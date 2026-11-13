-- Booking documents (OTA PDFs), received payouts, and their reconciliation with bookings.
--
--   source_documents    a PDF or CSV uploaded to the workspace's private file storage
--   payouts             money received (from a bank statement, an OTA payout report, or typed in)
--   payout_allocations  which bookings a payout covers, and how much of it each one got
--   payout_adjustments  explained differences between expected and received, accepted or disputed
--
-- Access: booking PDFs can be read by every member and added by staff and above. Anything
-- financial (bank statements, payout reports, payouts, matches, adjustments) can be read and
-- written by owners and managers only. Writes stop when the workspace is read-only.

-- ---------------------------------------------------------------------------
-- 1. Private file storage, one folder per workspace
--    <org_id>/bookings/...  booking PDFs       (staff and above may upload; all members may read)
--    <org_id>/finance/...   bank and payout     (owners and managers only, read and write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-files', 'workspace-files', false, 20971520,
        array['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'text/plain'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.object_org(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

create or replace function private.object_area(p_name text)
returns text language sql immutable set search_path = '' as $$
  select split_part(p_name, '/', 2)
$$;

revoke all on function private.object_org(text) from public, anon;
revoke all on function private.object_area(text) from public, anon;
grant execute on function private.object_org(text) to authenticated;
grant execute on function private.object_area(text) to authenticated;

create policy workspace_files_read on storage.objects for select to authenticated using (
  bucket_id = 'workspace-files' and (
    (private.object_area(name) = 'bookings'
       and private.has_org_role(private.object_org(name), '{owner,manager,staff,viewer}'::public.member_role[]))
    or (private.object_area(name) = 'finance'
       and private.has_org_role(private.object_org(name), '{owner,manager}'::public.member_role[]))
  )
);
create policy workspace_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'workspace-files' and (
    (private.object_area(name) = 'bookings'
       and private.can_write(private.object_org(name), '{owner,manager,staff}'::public.member_role[]))
    or (private.object_area(name) = 'finance'
       and private.can_write(private.object_org(name), '{owner,manager}'::public.member_role[]))
  )
);
create policy workspace_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'workspace-files'
  and private.object_area(name) in ('bookings', 'finance')
  and private.can_write(private.object_org(name), '{owner,manager}'::public.member_role[])
);
-- No update policy: stored files are never overwritten.

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.source_documents (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  kind text not null check (kind in ('bookings', 'bank_statement', 'payout_report')),
  apartment_id text check (char_length(apartment_id) <= 128),
  platform_id text check (char_length(platform_id) <= 128),
  file_path text not null check (
    char_length(file_path) <= 512
    and split_part(file_path, '/', 1) = org_id::text
    and split_part(file_path, '/', 2) = case when kind = 'bookings' then 'bookings' else 'finance' end
  ),
  file_name text not null check (char_length(file_name) between 1 and 255 and file_name !~ '[[:cntrl:]]'),
  file_size integer check (file_size between 0 and 20971520),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploaded' check (status in ('uploaded', 'read', 'saved', 'failed')),
  rows_found integer check (rows_found between 0 and 10000),
  rows_saved integer check (rows_saved between 0 and 10000),
  error text check (char_length(error) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, sha256)
);
create index source_documents_org_created_idx on public.source_documents (org_id, created_at desc);

alter table public.reservations add column source_document_id uuid;
alter table public.reservations
  add constraint reservations_source_document_fk
  foreign key (org_id, source_document_id) references public.source_documents(org_id, id)
  on delete set null (source_document_id);

create table public.payouts (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  platform_id text check (char_length(platform_id) <= 128),
  received_date date not null,
  amount_aed numeric not null check (abs(amount_aed) < 1e12 and amount_aed <> 0),
  original_amount numeric check (abs(original_amount) < 1e12),
  original_currency text check (original_currency ~ '^[A-Z]{3}$'),
  reference text check (char_length(reference) <= 200),
  description text check (char_length(description) <= 500),
  source text not null check (source in ('bank_statement', 'payout_report', 'manual')),
  source_document_id uuid,
  notes text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, source_document_id) references public.source_documents(org_id, id)
    on delete set null (source_document_id)
);
create index payouts_org_date_idx on public.payouts (org_id, received_date desc);
-- The same bank or OTA reference cannot be imported twice.
create unique index payouts_no_duplicate_reference
  on public.payouts (org_id, received_date, amount_aed, reference) where reference is not null;

create table public.payout_allocations (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  payout_id uuid not null,
  reservation_id text not null,
  amount_aed numeric not null check (abs(amount_aed) < 1e12 and amount_aed <> 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, payout_id, reservation_id),
  foreign key (org_id, payout_id) references public.payouts(org_id, id) on delete cascade,
  foreign key (org_id, reservation_id) references public.reservations(org_id, id) on delete cascade
);
create index payout_allocations_reservation_idx on public.payout_allocations (org_id, reservation_id);

create table public.payout_adjustments (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  reservation_id text,
  payout_id uuid,
  -- Signed: how much the received amount differs because of this reason (negative = less received).
  amount_aed numeric not null check (abs(amount_aed) < 1e12 and amount_aed <> 0),
  reason text not null check (reason in (
    'commission', 'vat', 'payment_fee', 'exchange_rate', 'refund', 'guest_change',
    'damage_claim', 'tax_withheld', 'ota_error', 'other')),
  note text check (char_length(note) <= 1000),
  resolution text not null default 'accepted' check (resolution in ('accepted', 'disputed', 'recovered', 'written_off')),
  dispute_reference text check (char_length(dispute_reference) <= 200),
  resolved_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id),
  check (reservation_id is not null or payout_id is not null),
  foreign key (org_id, reservation_id) references public.reservations(org_id, id) on delete cascade,
  foreign key (org_id, payout_id) references public.payouts(org_id, id) on delete cascade
);
create index payout_adjustments_reservation_idx on public.payout_adjustments (org_id, reservation_id);

-- A payout cannot be allocated beyond its own amount (1 AED rounding tolerance).
create or replace function private.check_payout_allocation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_amount numeric;
  v_total numeric;
begin
  select amount_aed into v_amount from public.payouts where org_id = new.org_id and id = new.payout_id;
  select coalesce(sum(amount_aed), 0) into v_total
    from public.payout_allocations where org_id = new.org_id and payout_id = new.payout_id;
  if abs(v_total) > abs(v_amount) + 1 or sign(v_total) * sign(v_amount) < 0 then
    raise exception 'Allocations (%) exceed the payout amount (%)', v_total, v_amount using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function private.check_payout_allocation() from public, anon, authenticated;

create constraint trigger payout_allocations_within_amount
  after insert or update on public.payout_allocations
  deferrable initially immediate
  for each row execute function private.check_payout_allocation();

-- ---------------------------------------------------------------------------
-- 3. Row-level security, timestamps, and locked tenant columns
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select * from (values
      ('source_documents',   '{owner,manager,staff}'),
      ('payouts',            '{owner,manager}'),
      ('payout_allocations', '{owner,manager}'),
      ('payout_adjustments', '{owner,manager}')
    ) as v(tbl, write_roles)
  loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('alter table public.%I force row level security', t.tbl);
    execute format('revoke all on public.%I from anon', t.tbl);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (private.has_org_role(org_id, %L::public.member_role[]))',
                   t.tbl || '_select', t.tbl, '{owner,manager,staff,viewer}');
    execute format('create policy %I on public.%I for update to authenticated using (private.can_write(org_id, %L::public.member_role[])) with check (private.can_write(org_id, %L::public.member_role[]))',
                   t.tbl || '_update', t.tbl, t.write_roles, t.write_roles);
    execute format('create policy %I on public.%I for delete to authenticated using (private.can_write(org_id, %L::public.member_role[]))',
                   t.tbl || '_delete', t.tbl, '{owner,manager}');
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t.tbl || '_updated_at', t.tbl);
    execute format('create trigger %I before update on public.%I for each row execute function private.lock_tenant_columns(%L)',
                   t.tbl || '_lock_tenant', t.tbl, 'org');
  end loop;
end $$;

-- Inserts: staff may add booking PDFs; financial documents and records are owners and managers only.
create policy source_documents_insert on public.source_documents for insert to authenticated with check (
  private.can_write(org_id, case when kind = 'bookings'
                                 then '{owner,manager,staff}'::public.member_role[]
                                 else '{owner,manager}'::public.member_role[] end)
);
create policy payouts_insert on public.payouts for insert to authenticated
  with check (private.can_write(org_id, '{owner,manager}'::public.member_role[]));
create policy payout_allocations_insert on public.payout_allocations for insert to authenticated
  with check (private.can_write(org_id, '{owner,manager}'::public.member_role[]));
create policy payout_adjustments_insert on public.payout_adjustments for insert to authenticated
  with check (private.can_write(org_id, '{owner,manager}'::public.member_role[]));

-- Staff may update only the documents they could create (booking PDFs), not financial ones.
drop policy source_documents_update on public.source_documents;
create policy source_documents_update on public.source_documents for update to authenticated
  using (private.can_write(org_id, case when kind = 'bookings'
                                        then '{owner,manager,staff}'::public.member_role[]
                                        else '{owner,manager}'::public.member_role[] end))
  with check (private.can_write(org_id, case when kind = 'bookings'
                                             then '{owner,manager,staff}'::public.member_role[]
                                             else '{owner,manager}'::public.member_role[] end));

-- Financial records are visible to owners and managers only (staff work without finance).
drop policy payouts_select on public.payouts;
create policy payouts_select on public.payouts for select to authenticated
  using (private.has_org_role(org_id, '{owner,manager}'::public.member_role[]));
drop policy payout_allocations_select on public.payout_allocations;
create policy payout_allocations_select on public.payout_allocations for select to authenticated
  using (private.has_org_role(org_id, '{owner,manager}'::public.member_role[]));
drop policy payout_adjustments_select on public.payout_adjustments;
create policy payout_adjustments_select on public.payout_adjustments for select to authenticated
  using (private.has_org_role(org_id, '{owner,manager}'::public.member_role[]));
drop policy source_documents_select on public.source_documents;
create policy source_documents_select on public.source_documents for select to authenticated
  using (private.has_org_role(org_id, case when kind = 'bookings'
                                           then '{owner,manager,staff,viewer}'::public.member_role[]
                                           else '{owner,manager}'::public.member_role[] end));

-- ---------------------------------------------------------------------------
-- 4. Reading PDFs counts towards the shared AI limits (30 documents per user per hour)
-- ---------------------------------------------------------------------------
alter table private.ai_usage drop constraint ai_usage_kind_check;
alter table private.ai_usage add constraint ai_usage_kind_check check (kind in ('receipt', 'market', 'document'));

create or replace function public.consume_ai_quota(p_org uuid, p_kind text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hour_limit int := case p_kind when 'receipt' then 20 when 'market' then 10 when 'document' then 30 end;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v_hour_limit is null then
    raise exception 'Unknown AI feature' using errcode = '22023';
  end if;
  if not private.can_write(p_org, '{owner,manager,staff}'::public.member_role[]) then
    raise exception 'AI features are not available for this workspace' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || p_kind, 0));

  if (select count(*) from private.ai_usage
      where user_id = v_uid and kind = p_kind and used_at > now() - interval '1 hour') >= v_hour_limit then
    raise exception 'AI hourly limit reached' using errcode = 'P0429';
  end if;
  if (select count(*) from private.ai_usage
      where org_id = p_org and used_at > now() - interval '1 day') >= 300 then
    raise exception 'AI daily workspace limit reached' using errcode = 'P0429';
  end if;

  insert into private.ai_usage (user_id, org_id, kind) values (v_uid, p_org, p_kind);
end $$;

revoke all on function public.consume_ai_quota(uuid, text) from public, anon;
grant execute on function public.consume_ai_quota(uuid, text) to authenticated;
