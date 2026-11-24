-- Owner reports and the owner portal.
--
--   owner_statements    statements prepared for each owner: monthly, quarterly or yearly ones
--                       (emailed as a PDF), plus a month-to-date one refreshed every day
--   owner_logins        people who may sign in to see one owner's statements (and nothing else)
--   owner_invitations   links that create an owner login once accepted by the invited email
--
-- An owner who signs in is not a member of the workspace: no team role, no access to bookings,
-- costs, guests or anyone else's figures. They can read only the statements of the owner (entity)
-- they are linked to. Statements are worked out by the daily job from the workspace's records.

-- ---------------------------------------------------------------------------
-- 1. Statements
-- ---------------------------------------------------------------------------
create table public.owner_statements (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  entity_id uuid not null,
  kind text not null check (kind in ('month_to_date', 'monthly', 'quarterly', 'yearly')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  currency char(3) not null references public.currencies(code),
  total numeric not null,
  statement jsonb not null check (jsonb_typeof(statement) = 'object' and octet_length(statement::text) < 400000),
  prepared_at timestamptz not null default now(),
  email_status text check (email_status in ('sent', 'failed', 'opted_out', 'no_email', 'not_configured')),
  emailed_at timestamptz,
  primary key (org_id, id),
  unique (org_id, entity_id, kind, period_start),
  foreign key (org_id, entity_id) references public.entities(org_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 2. Owner logins and invitations
-- ---------------------------------------------------------------------------
create table public.owner_logins (
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, entity_id, user_id),
  foreign key (org_id, entity_id) references public.entities(org_id, id) on delete cascade
);
create index owner_logins_user_idx on public.owner_logins (user_id);

create table public.owner_invitations (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  entity_id uuid not null,
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$'),
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null default now() + interval '14 days',
  invited_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (org_id, id),
  foreign key (org_id, entity_id) references public.entities(org_id, id) on delete cascade
);

-- An owner login, for this signed-in person, to this entity.
create or replace function private.is_owner_login(p_org uuid, p_entity uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.owner_logins l
    where l.org_id = p_org and l.entity_id = p_entity and l.user_id = (select auth.uid()))
$$;
revoke all on function private.is_owner_login(uuid, uuid) from public, anon;
grant execute on function private.is_owner_login(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Access
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['owner_statements', 'owner_logins', 'owner_invitations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
  end loop;
end $$;

-- Statements: the workspace's owners and managers, and the owner's own logins. Prepared by the
-- job; owners and managers may remove one (it is prepared again on the next run).
revoke insert, update on public.owner_statements from authenticated;
create policy owner_statements_select on public.owner_statements for select to authenticated using (
  private.has_org_role(org_id, '{owner,manager}'::public.member_role[]) or private.is_owner_login(org_id, entity_id));
create policy owner_statements_delete on public.owner_statements for delete to authenticated using (
  private.can_write(org_id, '{owner,manager}'::public.member_role[]));

-- Logins: owners and managers see and remove them; a person sees their own.
revoke insert, update on public.owner_logins from authenticated;
create policy owner_logins_select on public.owner_logins for select to authenticated using (
  user_id = (select auth.uid()) or private.has_org_role(org_id, '{owner,manager}'::public.member_role[]));
create policy owner_logins_delete on public.owner_logins for delete to authenticated using (
  private.can_write(org_id, '{owner,manager}'::public.member_role[]));

-- Invitations: owners and managers create, see and cancel them.
revoke update on public.owner_invitations from authenticated;
create policy owner_invitations_select on public.owner_invitations for select to authenticated using (
  private.has_org_role(org_id, '{owner,manager}'::public.member_role[]));
create policy owner_invitations_insert on public.owner_invitations for insert to authenticated with check (
  private.can_write(org_id, '{owner,manager}'::public.member_role[]) and invited_by = (select auth.uid())
  and accepted_at is null and expires_at <= now() + interval '30 days');
create policy owner_invitations_delete on public.owner_invitations for delete to authenticated using (
  private.can_write(org_id, '{owner,manager}'::public.member_role[]));

-- ---------------------------------------------------------------------------
-- 4. Accepting an invitation, and the portals a person can open
-- ---------------------------------------------------------------------------
create or replace function private.link_owner_invitation(p_token uuid, p_user uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.owner_invitations;
begin
  select * into v_inv from public.owner_invitations where token = p_token for update;
  if v_inv.id is null or v_inv.email <> lower(p_email) then
    return null;
  end if;
  if v_inv.accepted_at is null and v_inv.expires_at <= now() then
    return null;
  end if;
  insert into public.owner_logins (org_id, entity_id, user_id) values (v_inv.org_id, v_inv.entity_id, p_user)
  on conflict do nothing;
  update public.owner_invitations set accepted_at = coalesce(accepted_at, now()) where org_id = v_inv.org_id and id = v_inv.id;
  return v_inv.org_id;
end $$;
revoke all on function private.link_owner_invitation(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.accept_owner_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  v_org := private.link_owner_invitation(p_token, auth.uid(), v_email);
  if v_org is null then
    raise exception 'Invitation not found, expired, or for another email' using errcode = 'P0002';
  end if;
  return v_org;
end $$;
revoke all on function public.accept_owner_invitation(uuid) from public, anon;
grant execute on function public.accept_owner_invitation(uuid) to authenticated;

-- The owner portals the signed-in person can open: which workspace, which owner.
create or replace function public.my_owner_portals()
returns table (org_id uuid, org_name text, entity_id uuid, entity_name text, reporting_currency char(3))
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, e.id, e.name, e.reporting_currency
  from public.owner_logins l
  join public.organizations o on o.id = l.org_id
  join public.entities e on e.org_id = l.org_id and e.id = l.entity_id
  where l.user_id = (select auth.uid()) and o.deletion_requested_at is null
  order by o.name, e.name
$$;
revoke all on function public.my_owner_portals() from public, anon;
grant execute on function public.my_owner_portals() to authenticated;

-- New accounts: an owner invitation links the login and does not create a workspace.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_invite  public.invitations;
  v_org_id  uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(trim(coalesce(v_meta ->> 'full_name', '')), 120), ''));

  if coalesce(v_meta ->> 'owner_invite_token', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and private.link_owner_invitation((v_meta ->> 'owner_invite_token')::uuid, new.id, new.email) is not null then
    return new;
  end if;

  if v_meta ? 'invite_token' then
    select * into v_invite from public.invitations
    where token = nullif(v_meta ->> 'invite_token', '')::uuid
      and accepted_at is null
      and expires_at > now()
      and email = lower(new.email)
    for update;
  end if;

  if v_invite.id is not null then
    insert into public.memberships (org_id, user_id, role, invited_by)
    values (v_invite.org_id, new.id, v_invite.role, v_invite.invited_by);
    update public.invitations set accepted_at = now() where id = v_invite.id;
  else
    insert into public.organizations (name, created_by, status, trial_ends_at)
    values (
      coalesce(nullif(left(trim(coalesce(v_meta ->> 'company_name', '')), 120), ''), 'My workspace'),
      new.id,
      'trialing',
      now() + interval '15 days'   -- trial length decided 2026-10-30
    )
    returning id into v_org_id;

    insert into public.memberships (org_id, user_id, role) values (v_org_id, new.id, 'owner');
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The daily owner-report job (token-guarded, like reminders and rates)
-- ---------------------------------------------------------------------------
-- Everything needed to work out statements: per workspace with ownership recorded, its owners,
-- shares, properties, bookings (without guest names or notes), costs and statements already
-- prepared, plus the daily rates for the currencies involved.
create or replace function public.cron_owner_report_data(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_since date := (date_trunc('year', current_date) - interval '1 year')::date;
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'org_id', o.id,
        'name', o.name,
        'base_currency', o.base_currency,
        'timezone', o.timezone,
        'entities', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'name', e.name, 'reporting_currency', e.reporting_currency, 'report_email', e.report_email,
            'report_frequency', e.report_frequency, 'opted_out', e.reports_opted_out_at is not null)), '[]')
          from public.entities e where e.org_id = o.id),
        'shares', (select coalesce(jsonb_agg(jsonb_build_object(
            'property_id', s.property_id, 'entity_id', s.entity_id, 'effective_from', s.effective_from, 'share', s.share)), '[]')
          from public.listing_shares s where s.org_id = o.id),
        'properties', (select coalesce(jsonb_agg(to_jsonb(p) - 'org_id' - 'address' - 'created_by'), '[]')
          from public.properties p where p.org_id = o.id),
        'reservations', (select coalesce(jsonb_agg(to_jsonb(r) - 'org_id' - 'guest_name' - 'notes' - 'rating' - 'created_by'), '[]')
          from public.reservations r where r.org_id = o.id and r.check_out >= v_since),
        'daily_expenses', (select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'notes' - 'created_by'), '[]')
          from public.daily_expenses x where x.org_id = o.id and x.date >= v_since),
        'monthly_bills', (select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_by'), '[]')
          from public.monthly_bills x where x.org_id = o.id),
        'statements', (select coalesce(jsonb_agg(jsonb_build_object(
            'entity_id', st.entity_id, 'kind', st.kind, 'period_start', st.period_start, 'emailed_at', st.emailed_at)), '[]')
          from public.owner_statements st where st.org_id = o.id and st.kind <> 'month_to_date'),
        -- Statements from the past week whose email failed or could not be sent yet: try again.
        'retry', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', st.id, 'entity_id', st.entity_id, 'kind', st.kind, 'period_start', st.period_start,
            'currency', st.currency, 'total', st.total, 'statement', st.statement)), '[]')
          from public.owner_statements st
          where st.org_id = o.id and st.kind <> 'month_to_date' and st.emailed_at is null
            and st.email_status in ('failed', 'not_configured') and st.prepared_at > now() - interval '7 days')
      ))
      from public.organizations o
      where o.deletion_requested_at is null
        and exists (select 1 from public.listing_shares s where s.org_id = o.id)
    ), '[]'),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('rate_date', f.rate_date, 'currency', f.currency, 'per_usd', f.per_usd))
      from public.fx_rates f
      where f.rate_date >= v_since - 7
        and f.currency in (
          select p.currency from public.properties p
          union select e.reporting_currency from public.entities e
          union select o.base_currency from public.organizations o)
    ), '[]')
  );
end $$;

-- Saves prepared statements. Month-to-date ones are refreshed; a monthly, quarterly or yearly
-- statement, once prepared, is never changed. Returns the ids of the statements it saved.
create or replace function public.cron_store_owner_statements(p_token text, p_rows jsonb)
returns table (id uuid, org_id uuid, entity_id uuid, kind text, period_start date)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Expected up to 1000 statements' using errcode = '22023';
  end if;
  return query
  insert into public.owner_statements as s (org_id, entity_id, kind, period_start, period_end, currency, total, statement)
  select (x ->> 'org_id')::uuid, (x ->> 'entity_id')::uuid, x ->> 'kind', (x ->> 'period_start')::date,
         (x ->> 'period_end')::date, x ->> 'currency', (x ->> 'total')::numeric, x -> 'statement'
  from jsonb_array_elements(p_rows) x
  on conflict on constraint owner_statements_org_id_entity_id_kind_period_start_key do update
    set period_end = excluded.period_end, currency = excluded.currency, total = excluded.total,
        statement = excluded.statement, prepared_at = now()
    where s.kind = 'month_to_date'
  returning s.id, s.org_id, s.entity_id, s.kind, s.period_start;
end $$;

-- Records how a statement's email went.
create or replace function public.cron_mark_statement_emailed(p_token text, p_org uuid, p_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed', 'opted_out', 'no_email', 'not_configured') then
    raise exception 'Bad status' using errcode = '22023';
  end if;
  update public.owner_statements
    set email_status = p_status, emailed_at = case when p_status = 'sent' then now() else emailed_at end
    where org_id = p_org and id = p_id and kind <> 'month_to_date';
end $$;

revoke all on function public.cron_owner_report_data(text) from public, authenticated;
revoke all on function public.cron_store_owner_statements(text, jsonb) from public, authenticated;
revoke all on function public.cron_mark_statement_emailed(text, uuid, uuid, text) from public, authenticated;
grant execute on function public.cron_owner_report_data(text) to anon;
grant execute on function public.cron_store_owner_statements(text, jsonb) to anon;
grant execute on function public.cron_mark_statement_emailed(text, uuid, uuid, text) to anon;
