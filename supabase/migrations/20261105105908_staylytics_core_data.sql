-- Staylytics core data model, protected by workspace (organization) and role.
-- Builds on the tenancy foundation: organizations, memberships, private.has_org_role(), private.org_is_writable().
--
-- Access rules (enforced by row-level security):
--   viewer  : read everything in the workspace
--   staff   : + create/edit/delete operational records (reservations, expenses, services, bills, assets, documents, tasks, templates)
--   manager : + properties, rent cheques, setup costs, platforms, vendors, invoices, payments, reconciliations, workspace settings
--   owner   : same as manager for data
-- Writes are refused when the workspace is not writable (read-only/cancelled, or trial over by more than 5 days).

-- ---------------------------------------------------------------------------
-- 0. Privilege hygiene
-- ---------------------------------------------------------------------------
-- New objects in public must not be reachable by anonymous visitors by default.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;
-- TRUNCATE bypasses row-level security; TRIGGER and REFERENCES are not needed by app users.
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
-- Trial gets a 5-day grace period; read_only and cancelled workspaces cannot write.
create or replace function private.org_is_writable(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_org
      and (
        o.status in ('active', 'past_due')
        or (o.status = 'trialing' and (o.trial_ends_at is null or o.trial_ends_at + interval '5 days' > now()))
      )
  );
$$;

create or replace function private.can_write(p_org uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_org_role(p_org, p_roles) and private.org_is_writable(p_org);
$$;

-- Rows can never be moved to another workspace (or another property) after creation.
create or replace function private.lock_tenant_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id cannot be changed' using errcode = '42501';
  end if;
  if tg_argv[0] = 'property' then
    if new.property_id is distinct from old.property_id then
      raise exception 'property_id cannot be changed' using errcode = '42501';
    end if;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- Common columns: org_id, id (the app's own record key), created_by, created_at, updated_at.
-- ---------------------------------------------------------------------------
create table public.properties (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  name text check (char_length(name) <= 200),
  nickname text check (char_length(nickname) <= 128),
  building text check (char_length(building) <= 200),
  address text check (char_length(address) <= 500),
  specification text check (char_length(specification) <= 40),
  measurement_sqft numeric check (measurement_sqft between 0 and 1000000),
  start_operation_date date,
  annual_rent_aed numeric check (abs(annual_rent_aed) < 1e12),
  monthly_rent_aed numeric check (abs(monthly_rent_aed) < 1e12),
  num_cheques integer check (num_cheques between 0 and 366),
  currency text check (char_length(currency) <= 8),
  status text check (status in ('active', 'expired', 'terminated')),
  tenancy_end_date date,
  utilities_monthly_defaults jsonb check (pg_column_size(utilities_monthly_defaults) <= 8192),
  platform_settings jsonb check (pg_column_size(platform_settings) <= 65536),
  tenancy_history jsonb check (pg_column_size(tenancy_history) <= 262144),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.property_rent_cheques (
  org_id uuid not null,
  property_id text not null,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  cheque_number text check (char_length(cheque_number) <= 64),
  due_date date,
  amount_aed numeric check (abs(amount_aed) < 1e12),
  amount_native numeric check (abs(amount_native) < 1e12),
  status text check (status in ('due', 'paid', 'postponed', 'bounced')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, property_id, id),
  foreign key (org_id, property_id) references public.properties(org_id, id) on delete cascade
);

create table public.property_setup_costs (
  org_id uuid not null,
  property_id text not null,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  date date,
  category text check (char_length(category) <= 60),
  description text check (char_length(description) <= 1000),
  amount_aed numeric check (abs(amount_aed) < 1e12),
  is_refundable boolean,
  payment_method text check (char_length(payment_method) <= 60),
  vendor text check (char_length(vendor) <= 200),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, property_id, id),
  foreign key (org_id, property_id) references public.properties(org_id, id) on delete cascade
);

create table public.reservations (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  apartment_id text check (char_length(apartment_id) <= 128),
  platform_id text check (char_length(platform_id) <= 128),
  channel text check (char_length(channel) <= 100),
  guest_name text check (char_length(guest_name) <= 200),
  check_in date,
  check_in_time text check (char_length(check_in_time) <= 10),
  check_out date,
  check_out_time text check (char_length(check_out_time) <= 10),
  num_guests integer check (num_guests between 0 and 1000),
  nights integer check (nights between -10000 and 10000),
  total_booking_revenue_aed numeric check (abs(total_booking_revenue_aed) < 1e12),
  net_payout_aed numeric check (abs(net_payout_aed) < 1e12),
  payout_date date,
  cleaning_cost_aed numeric check (abs(cleaning_cost_aed) < 1e12),
  status text check (status in ('confirmed', 'cancelled')),
  cancellation_policy text check (char_length(cancellation_policy) <= 40),
  booking_date date,
  non_refundable_date date,
  rating numeric check (rating between 0 and 10),
  notes text check (char_length(notes) <= 5000),
  damages_incurred text check (char_length(damages_incurred) <= 5000),
  other_booking_costs jsonb check (pg_column_size(other_booking_costs) <= 32768),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);
create index reservations_org_check_in_idx on public.reservations (org_id, check_in);

create table public.platforms (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  name text check (char_length(name) <= 120),
  commission_percent numeric check (commission_percent between -100 and 100),
  payment_charge_percent numeric check (payment_charge_percent between -100 and 100),
  vat_percent numeric check (vat_percent between -100 and 100),
  other_charges_percent numeric check (other_charges_percent between -100 and 100),
  payout_timing text check (payout_timing in ('before_checkin', 'after_checkin', 'after_checkout', 'next_specific_day')),
  payout_day_of_week integer check (payout_day_of_week between 0 and 6),
  payout_days_offset integer check (payout_days_offset between -365 and 365),
  processing_days integer check (processing_days between 0 and 365),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.vendors (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  name text check (char_length(name) <= 200),
  service_type text check (char_length(service_type) <= 100),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 254),
  status text check (status in ('active', 'inactive')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.service_records (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  date date,
  apartment_id text check (char_length(apartment_id) <= 128),
  service_type text check (char_length(service_type) <= 100),
  vendor_id text check (char_length(vendor_id) <= 128),
  description text check (char_length(description) <= 2000),
  quantity numeric check (abs(quantity) < 1e9),
  unit_cost numeric check (abs(unit_cost) < 1e12),
  total_cost numeric check (abs(total_cost) < 1e12),
  status text check (status in ('unbilled', 'billed', 'paid')),
  invoice_id text check (char_length(invoice_id) <= 128),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.vendor_invoices (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  vendor_id text check (char_length(vendor_id) <= 128),
  record_ids text[] check (cardinality(record_ids) <= 5000),
  total_amount numeric check (abs(total_amount) < 1e12),
  date date,
  status text check (status in ('pending', 'paid', 'partial')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.vendor_payments (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  date date,
  vendor_id text check (char_length(vendor_id) <= 128),
  amount_paid numeric check (abs(amount_paid) < 1e12),
  type text check (type in ('advance', 'invoice_payment', 'partial_payment')),
  invoice_id text check (char_length(invoice_id) <= 128),
  notes text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.daily_expenses (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  apartment_id text check (char_length(apartment_id) <= 128),
  date date,
  category text check (char_length(category) <= 100),
  amount_aed numeric check (abs(amount_aed) < 1e12),
  notes text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);
create index daily_expenses_org_date_idx on public.daily_expenses (org_id, date);

create table public.monthly_bills (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  apartment_id text check (char_length(apartment_id) <= 128),
  month text check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  bill_type text check (bill_type in ('electricity', 'internet', 'water', 'gas', 'other')),
  amount_aed numeric check (abs(amount_aed) < 1e12),
  status text check (status in ('pending', 'paid')),
  paid_date date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.bank_reconciliations (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  date date,
  actual_balance numeric check (abs(actual_balance) < 1e13),
  notes text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.assets (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  apartment_id text check (char_length(apartment_id) <= 128),
  name text check (char_length(name) <= 200),
  category text check (char_length(category) <= 100),
  purchase_date date,
  warranty_expiry date,
  condition text check (condition in ('new', 'good', 'fair', 'poor')),
  last_serviced_date date,
  next_service_due date,
  cost_aed numeric check (abs(cost_aed) < 1e12),
  notes text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.documents (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  apartment_id text check (char_length(apartment_id) <= 128),
  title text check (char_length(title) <= 300),
  type text check (char_length(type) <= 100),
  expiry_date date,
  -- Only https links can be stored, so a stored link can never run script when clicked.
  file_url text check (file_url is null or (file_url ~ '^https://' and char_length(file_url) <= 2048)),
  status text check (status in ('active', 'expired', 'pending_renewal')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.maintenance_tasks (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  apartment_id text check (char_length(apartment_id) <= 128),
  title text check (char_length(title) <= 300),
  description text check (char_length(description) <= 5000),
  priority text check (priority in ('low', 'medium', 'high', 'urgent')),
  status text check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date date,
  vendor_id text check (char_length(vendor_id) <= 128),
  cost_estimate numeric check (abs(cost_estimate) < 1e12),
  actual_cost numeric check (abs(actual_cost) < 1e12),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table public.communication_templates (
  org_id uuid not null references public.organizations(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 128 and id !~ '[[:cntrl:]]'),
  name text check (char_length(name) <= 200),
  subject text check (char_length(subject) <= 300),
  content text check (char_length(content) <= 20000),
  category text check (category in ('check_in', 'check_out', 'house_rules', 'wifi', 'other')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

-- One row per workspace: company profile and custom document types.
create table public.workspace_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  company_profile jsonb not null default '{}'::jsonb check (pg_column_size(company_profile) <= 16384),
  custom_document_types text[] not null default '{}' check (cardinality(custom_document_types) <= 200),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Triggers, grants and row-level security for every data table
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      -- table,                     write roles,                         delete roles,                 lock arg
      ('properties',              '{owner,manager}',                    '{owner,manager}',            'org'),
      ('property_rent_cheques',   '{owner,manager}',                    '{owner,manager}',            'property'),
      ('property_setup_costs',    '{owner,manager}',                    '{owner,manager}',            'property'),
      ('reservations',            '{owner,manager,staff}',              '{owner,manager,staff}',      'org'),
      ('platforms',               '{owner,manager}',                    '{owner,manager}',            'org'),
      ('vendors',                 '{owner,manager}',                    '{owner,manager}',            'org'),
      ('service_records',         '{owner,manager,staff}',              '{owner,manager,staff}',      'org'),
      ('vendor_invoices',         '{owner,manager}',                    '{owner,manager}',            'org'),
      ('vendor_payments',         '{owner,manager}',                    '{owner,manager}',            'org'),
      ('daily_expenses',          '{owner,manager,staff}',              '{owner,manager,staff}',      'org'),
      ('monthly_bills',           '{owner,manager,staff}',              '{owner,manager,staff}',      'org'),
      ('bank_reconciliations',    '{owner,manager}',                    '{owner,manager}',            'org'),
      ('assets',                  '{owner,manager,staff}',              '{owner,manager,staff}',      'org'),
      ('documents',               '{owner,manager,staff}',              '{owner,manager,staff}',      'org'),
      ('maintenance_tasks',       '{owner,manager,staff}',              '{owner,manager,staff}',      'org'),
      ('communication_templates', '{owner,manager,staff}',              '{owner,manager,staff}',      'org'),
      ('workspace_settings',      '{owner,manager}',                    '{owner}',                    'org')
    ) as v(tbl, write_roles, delete_roles, lock_arg)
  loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('alter table public.%I force row level security', t.tbl);

    execute format('revoke all on public.%I from anon, authenticated', t.tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.tbl);

    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t.tbl || '_updated_at', t.tbl);
    execute format('create trigger %I before update on public.%I for each row execute function private.lock_tenant_columns(%L)',
                   t.tbl || '_lock_tenant', t.tbl, t.lock_arg);

    execute format('create policy %I on public.%I for select to authenticated using (private.has_org_role(org_id))',
                   t.tbl || '_select', t.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.can_write(org_id, %L::public.member_role[]))',
                   t.tbl || '_insert', t.tbl, t.write_roles);
    execute format('create policy %I on public.%I for update to authenticated using (private.can_write(org_id, %L::public.member_role[])) with check (private.can_write(org_id, %L::public.member_role[]))',
                   t.tbl || '_update', t.tbl, t.write_roles, t.write_roles);
    execute format('create policy %I on public.%I for delete to authenticated using (private.can_write(org_id, %L::public.member_role[]))',
                   t.tbl || '_delete', t.tbl, t.delete_roles);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. New workspaces start with standard booking platforms and an empty profile
-- ---------------------------------------------------------------------------
create or replace function private.seed_workspace()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.workspace_settings (org_id, company_profile, created_by)
  values (new.id, jsonb_build_object('name', new.name), new.created_by)
  on conflict (org_id) do nothing;

  insert into public.platforms (org_id, id, name, commission_percent, payment_charge_percent, vat_percent,
                                other_charges_percent, payout_timing, payout_day_of_week, payout_days_offset, processing_days, created_by)
  values
    (new.id, 'airbnb',  'Airbnb',          3,  null, 5, 0, 'after_checkin',     null, 1, 0, new.created_by),
    (new.id, 'booking', 'Booking.com',     15, null, 5, 0, 'next_specific_day', 4,    0, 0, new.created_by),
    (new.id, 'stripe',  'Direct - Stripe', 0,  2.9,  0, 0, 'after_checkout',    null, 2, 0, new.created_by),
    (new.id, 'paypal',  'Direct - PayPal', 0,  3.4,  0, 0, 'after_checkout',    null, 1, 0, new.created_by)
  on conflict do nothing;
  return new;
end $$;

create trigger organizations_seed_workspace
after insert on public.organizations
for each row execute function private.seed_workspace();

-- ---------------------------------------------------------------------------
-- 5. Shared AI usage limits (used by the /api/ai server functions with the user's own token)
-- ---------------------------------------------------------------------------
create table private.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('receipt', 'market')),
  used_at timestamptz not null default now()
);
create index ai_usage_user_kind_time_idx on private.ai_usage (user_id, kind, used_at desc);
create index ai_usage_org_time_idx on private.ai_usage (org_id, used_at desc);
alter table private.ai_usage enable row level security;
revoke all on private.ai_usage from anon, authenticated, public;

-- Records one AI use if within limits; raises otherwise. Limits:
--   per user per hour: 20 receipts, 10 market analyses; per workspace per day: 300 calls.
create or replace function public.consume_ai_quota(p_org uuid, p_kind text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hour_limit int := case p_kind when 'receipt' then 20 when 'market' then 10 end;
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

  -- Serialise checks per user so parallel requests cannot slip past the limit.
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

-- Existing helper functions: only signed-in users may call them.
revoke execute on function public.accept_invitation(uuid) from public, anon;
revoke execute on function public.list_team(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.list_team(uuid) to authenticated;
