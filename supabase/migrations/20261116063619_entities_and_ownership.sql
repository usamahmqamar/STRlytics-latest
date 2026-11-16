-- Entities and co-ownership (stage 2 of the multi-country plan).
--
--   entities                   the legal "who" behind the money: a person or a company, with its
--                              tax residence, reporting currency and owner-report preferences
--   listing_shares             which entities own each property's business, and in what shares,
--                              from a given date (history is kept; earlier splits never change)
--   representative_nominations the one person chosen to manage a co-owned property and deal with us
--   representative_approvals   each co-owner's approval of a nomination, with its evidence
--
-- A nomination takes effect once co-owners holding more than 50% of the shares approve it, so a
-- 50/50 split needs both. Co-owners do not log in: an owner or manager records each approval and
-- each report opt-out on their behalf, with the email or letter as evidence.
--
-- Access: all of this is ownership and tax information, so owners and managers only (like
-- payouts). Shares, nominations and approvals change only through the functions below, which
-- check the rules; direct writes are not allowed. Nothing changes while a workspace is read-only.

-- Owners' letters and emails are stored with the finance files.
alter table public.source_documents drop constraint source_documents_kind_check;
alter table public.source_documents add constraint source_documents_kind_check
  check (kind in ('bookings', 'bank_statement', 'payout_report', 'owner_letter'));

-- ---------------------------------------------------------------------------
-- 1. Entities
-- ---------------------------------------------------------------------------
create table public.entities (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200 and name !~ '[[:cntrl:]]'),
  kind text not null check (kind in ('individual', 'company')),
  legal_form text check (char_length(legal_form) <= 60 and legal_form !~ '[[:cntrl:]]'),
  tax_country char(2) check (tax_country ~ '^[A-Z]{2}$'),
  tax_id text check (char_length(tax_id) <= 60 and tax_id !~ '[[:cntrl:]]'),
  reporting_currency char(3) not null references public.currencies(code),
  report_email text check (char_length(report_email) <= 254 and report_email ~* '^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$'),
  report_frequency text not null default 'monthly'
    check (report_frequency in ('monthly', 'quarterly', 'monthly_and_yearly')),
  -- Reports go out unless the owner asked to stop, by email or letter, recorded here.
  reports_opted_out_at timestamptz,
  opt_out_document_id uuid,
  opt_out_note text check (char_length(opt_out_note) <= 2000),
  notes text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, opt_out_document_id) references public.source_documents(org_id, id)
    on delete restrict,
  check (reports_opted_out_at is null or opt_out_document_id is not null or char_length(btrim(coalesce(opt_out_note, ''))) > 0)
);
create unique index entities_unique_name on public.entities (org_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- 2. Shares in each property, from a date
-- ---------------------------------------------------------------------------
create table public.listing_shares (
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id text not null,
  entity_id uuid not null,
  effective_from date not null,
  share numeric(6, 3) not null check (share > 0 and share <= 100),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, property_id, effective_from, entity_id),
  foreign key (org_id, property_id) references public.properties(org_id, id) on delete cascade,
  foreign key (org_id, entity_id) references public.entities(org_id, id) on delete restrict
);
create index listing_shares_entity_idx on public.listing_shares (org_id, entity_id);

-- ---------------------------------------------------------------------------
-- 3. Representatives and their approvals
-- ---------------------------------------------------------------------------
create table public.representative_nominations (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  property_id text not null,
  nominee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'replaced')),
  nominated_by uuid default auth.uid() references auth.users(id) on delete set null,
  nominated_at timestamptz not null default now(),
  approved_at timestamptz,
  replaced_at timestamptz,
  primary key (org_id, id),
  foreign key (org_id, property_id) references public.properties(org_id, id) on delete cascade
);
-- At most one approved and one pending nomination per property.
create unique index representative_one_approved on public.representative_nominations (org_id, property_id) where status = 'approved';
create unique index representative_one_pending on public.representative_nominations (org_id, property_id) where status = 'pending';

create table public.representative_approvals (
  org_id uuid not null references public.organizations(id) on delete cascade,
  nomination_id uuid not null,
  entity_id uuid not null,
  share_at_approval numeric(6, 3) not null,
  evidence_document_id uuid,
  note text check (char_length(note) <= 2000),
  recorded_by uuid default auth.uid() references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  primary key (org_id, nomination_id, entity_id),
  foreign key (org_id, nomination_id) references public.representative_nominations(org_id, id) on delete cascade,
  foreign key (org_id, entity_id) references public.entities(org_id, id) on delete restrict,
  foreign key (org_id, evidence_document_id) references public.source_documents(org_id, id) on delete restrict,
  check (evidence_document_id is not null or char_length(btrim(coalesce(note, ''))) > 0)
);

-- ---------------------------------------------------------------------------
-- 4. Access: owners and managers only; shares, nominations and approvals via functions
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['entities', 'listing_shares', 'representative_nominations', 'representative_approvals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.has_org_role(org_id, %L::public.member_role[]))',
                   t || '_select', t, '{owner,manager}');
  end loop;
end $$;

-- Entities: owners and managers add, edit and remove them directly.
create policy entities_insert on public.entities for insert to authenticated
  with check (private.can_write(org_id, '{owner,manager}'::public.member_role[]));
create policy entities_update on public.entities for update to authenticated
  using (private.can_write(org_id, '{owner,manager}'::public.member_role[]))
  with check (private.can_write(org_id, '{owner,manager}'::public.member_role[]));
create policy entities_delete on public.entities for delete to authenticated
  using (private.can_write(org_id, '{owner,manager}'::public.member_role[]));
create trigger entities_updated_at before update on public.entities
  for each row execute function public.set_updated_at();
create trigger entities_lock_tenant before update on public.entities
  for each row execute function private.lock_tenant_columns('org');
-- An entity without a reporting currency reports in the workspace's currency.
create or replace function private.fill_entity_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reporting_currency is null then
    select o.base_currency into new.reporting_currency from public.organizations o where o.id = new.org_id;
  end if;
  return new;
end $$;
revoke all on function private.fill_entity_currency() from public, anon, authenticated;
create trigger entities_fill_currency before insert or update on public.entities
  for each row execute function private.fill_entity_currency();

-- The rest: no direct writes.
revoke insert, update, delete on public.listing_shares, public.representative_nominations,
  public.representative_approvals from authenticated;

-- An evidence file must be one of the workspace's owner letters.
create or replace function private.is_owner_letter(p_org uuid, p_doc uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_doc is null or exists (
    select 1 from public.source_documents d where d.org_id = p_org and d.id = p_doc and d.kind = 'owner_letter')
$$;
revoke all on function private.is_owner_letter(uuid, uuid) from public, anon, authenticated;

create or replace function private.check_entity_evidence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner_letter(new.org_id, new.opt_out_document_id) then
    raise exception 'The opt-out evidence must be an uploaded owner letter' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function private.check_entity_evidence() from public, anon, authenticated;
create trigger entities_check_evidence before insert or update of opt_out_document_id on public.entities
  for each row execute function private.check_entity_evidence();

-- Each entity's share in a property on a day: the latest split that started on or before it.
create or replace function private.shares_on(p_org uuid, p_property text, p_day date)
returns table (entity_id uuid, share numeric)
language sql stable security definer set search_path = '' as $$
  select s.entity_id, s.share
  from public.listing_shares s
  where s.org_id = p_org and s.property_id = p_property
    and s.effective_from = (
      select max(x.effective_from) from public.listing_shares x
      where x.org_id = p_org and x.property_id = p_property and x.effective_from <= p_day)
$$;
revoke all on function private.shares_on(uuid, text, date) from public, anon, authenticated;

-- Sets who owns a property's business from a date: [{"entity_id": "...", "share": 60}, ...].
-- Shares must add up to 100. A split already recorded for that same date is replaced.
create or replace function public.set_listing_shares(p_org uuid, p_property text, p_effective_from date, p_shares jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_count integer;
begin
  if not private.can_write(p_org, '{owner,manager}'::public.member_role[]) then
    raise exception 'Only owners and managers can change ownership' using errcode = '42501';
  end if;
  if p_effective_from is null or p_effective_from > current_date + 3650 or p_effective_from < date '2000-01-01' then
    raise exception 'Choose a sensible start date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.properties where org_id = p_org and id = p_property) then
    raise exception 'Unknown property' using errcode = '22023';
  end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) not between 1 and 50 then
    raise exception 'Give between 1 and 50 owners' using errcode = '22023';
  end if;

  select count(*), coalesce(sum((x ->> 'share')::numeric), 0) into v_count, v_total
  from jsonb_array_elements(p_shares) x;
  if v_count <> (select count(distinct x ->> 'entity_id') from jsonb_array_elements(p_shares) x) then
    raise exception 'Each owner can appear only once' using errcode = '22023';
  end if;
  if abs(v_total - 100) > 0.001 then
    raise exception 'Shares add up to %, not 100', v_total using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_shares) x
    where not exists (select 1 from public.entities e where e.org_id = p_org and e.id::text = x ->> 'entity_id')
  ) then
    raise exception 'Unknown owner' using errcode = '22023';
  end if;

  delete from public.listing_shares where org_id = p_org and property_id = p_property and effective_from = p_effective_from;
  insert into public.listing_shares (org_id, property_id, entity_id, effective_from, share)
  select p_org, p_property, (x ->> 'entity_id')::uuid, p_effective_from, round((x ->> 'share')::numeric, 3)
  from jsonb_array_elements(p_shares) x;
end $$;
revoke all on function public.set_listing_shares(uuid, text, date, jsonb) from public, anon;
grant execute on function public.set_listing_shares(uuid, text, date, jsonb) to authenticated;

-- Nominates a workspace owner or manager as a property's representative. A pending nomination
-- for the same property is replaced. Returns the nomination id.
create or replace function public.nominate_representative(p_org uuid, p_property text, p_user uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.can_write(p_org, '{owner,manager}'::public.member_role[]) then
    raise exception 'Only owners and managers can nominate a representative' using errcode = '42501';
  end if;
  if not exists (select 1 from public.properties where org_id = p_org and id = p_property) then
    raise exception 'Unknown property' using errcode = '22023';
  end if;
  if not exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = p_user and m.role in ('owner', 'manager')) then
    raise exception 'The representative must be an owner or manager of this workspace' using errcode = '22023';
  end if;
  if not exists (select 1 from private.shares_on(p_org, p_property, current_date)) then
    raise exception 'Record who owns this property first' using errcode = '22023';
  end if;

  update public.representative_nominations set status = 'replaced', replaced_at = now()
  where org_id = p_org and property_id = p_property and status = 'pending';
  insert into public.representative_nominations (org_id, property_id, nominee_user_id)
  values (p_org, p_property, p_user) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.nominate_representative(uuid, text, uuid) from public, anon;
grant execute on function public.nominate_representative(uuid, text, uuid) to authenticated;

-- Records one co-owner's approval of a pending nomination, with evidence (an uploaded letter or
-- the email pasted as a note). Once approvals hold more than 50% of today's shares, the
-- nomination takes effect and the previous representative is replaced. Returns the status.
create or replace function public.record_representative_approval(
  p_org uuid, p_nomination uuid, p_entity uuid, p_evidence uuid, p_note text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nom public.representative_nominations%rowtype;
  v_share numeric;
  v_approved numeric;
begin
  if not private.can_write(p_org, '{owner,manager}'::public.member_role[]) then
    raise exception 'Only owners and managers can record approvals' using errcode = '42501';
  end if;
  select * into v_nom from public.representative_nominations where org_id = p_org and id = p_nomination for update;
  if not found or v_nom.status <> 'pending' then
    raise exception 'This nomination is no longer waiting for approval' using errcode = '22023';
  end if;
  if p_evidence is null and char_length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Attach the owner''s letter or paste their email' using errcode = '22023';
  end if;
  if not private.is_owner_letter(p_org, p_evidence) then
    raise exception 'The evidence must be an uploaded owner letter' using errcode = '22023';
  end if;
  select s.share into v_share from private.shares_on(p_org, v_nom.property_id, current_date) s where s.entity_id = p_entity;
  if v_share is null then
    raise exception 'This owner does not hold a share in the property' using errcode = '22023';
  end if;

  insert into public.representative_approvals (org_id, nomination_id, entity_id, share_at_approval, evidence_document_id, note)
  values (p_org, p_nomination, p_entity, v_share, p_evidence, nullif(btrim(p_note), ''))
  on conflict (org_id, nomination_id, entity_id) do nothing;

  select coalesce(sum(s.share), 0) into v_approved
  from private.shares_on(p_org, v_nom.property_id, current_date) s
  where exists (select 1 from public.representative_approvals a
                where a.org_id = p_org and a.nomination_id = p_nomination and a.entity_id = s.entity_id);

  if v_approved > 50 then
    update public.representative_nominations set status = 'replaced', replaced_at = now()
    where org_id = p_org and property_id = v_nom.property_id and status = 'approved';
    update public.representative_nominations set status = 'approved', approved_at = now()
    where org_id = p_org and id = p_nomination;
    return 'approved';
  end if;
  return 'pending';
end $$;
revoke all on function public.record_representative_approval(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.record_representative_approval(uuid, uuid, uuid, uuid, text) to authenticated;

-- Like payouts, ownership and tax details are not sent over live updates; screens reload them.
