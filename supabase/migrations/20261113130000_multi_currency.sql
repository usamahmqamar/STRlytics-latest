-- Multi-currency and listing location (stage 1 of the multi-country plan).
--
-- * Every amount is stored in its own currency. Dirham-only column names lose their "_aed"
--   suffix, and every money row gains a currency code.
-- * Each property records where it is (country, region, city) and its time zone.
-- * Daily exchange rates are stored once and never edited. A daily job writes them through a
--   token-guarded function, the same way as the reminder emails; no service-role key.
-- * A property's currency cannot be changed once it has bookings or costs.

-- ---------------------------------------------------------------------------
-- 1. Supported currencies and where each one's daily rate comes from
-- ---------------------------------------------------------------------------
create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null check (char_length(name) <= 60),
  decimals smallint not null default 2 check (decimals between 0 and 3),
  -- base: EUR, the ECB's base currency; ecb: published daily by the ECB;
  -- usd_peg: fixed to the US dollar at usd_peg units per 1 USD.
  rate_source text not null check (rate_source in ('base', 'ecb', 'usd_peg')),
  usd_peg numeric check (usd_peg > 0),
  check ((rate_source = 'usd_peg') = (usd_peg is not null))
);

insert into public.currencies (code, name, decimals, rate_source, usd_peg) values
  ('EUR', 'Euro', 2, 'base', null),
  ('USD', 'US dollar', 2, 'ecb', null),
  ('GBP', 'Pound sterling', 2, 'ecb', null),
  ('INR', 'Indian rupee', 2, 'ecb', null),
  ('CHF', 'Swiss franc', 2, 'ecb', null),
  ('SEK', 'Swedish krona', 2, 'ecb', null),
  ('NOK', 'Norwegian krone', 2, 'ecb', null),
  ('DKK', 'Danish krone', 2, 'ecb', null),
  ('PLN', 'Polish zloty', 2, 'ecb', null),
  ('CZK', 'Czech koruna', 2, 'ecb', null),
  ('HUF', 'Hungarian forint', 2, 'ecb', null),
  ('RON', 'Romanian leu', 2, 'ecb', null),
  ('ISK', 'Icelandic krona', 0, 'ecb', null),
  ('TRY', 'Turkish lira', 2, 'ecb', null),
  ('ILS', 'Israeli shekel', 2, 'ecb', null),
  ('JPY', 'Japanese yen', 0, 'ecb', null),
  ('CNY', 'Chinese yuan', 2, 'ecb', null),
  ('HKD', 'Hong Kong dollar', 2, 'ecb', null),
  ('SGD', 'Singapore dollar', 2, 'ecb', null),
  ('KRW', 'South Korean won', 0, 'ecb', null),
  ('IDR', 'Indonesian rupiah', 2, 'ecb', null),
  ('MYR', 'Malaysian ringgit', 2, 'ecb', null),
  ('PHP', 'Philippine peso', 2, 'ecb', null),
  ('THB', 'Thai baht', 2, 'ecb', null),
  ('AUD', 'Australian dollar', 2, 'ecb', null),
  ('NZD', 'New Zealand dollar', 2, 'ecb', null),
  ('CAD', 'Canadian dollar', 2, 'ecb', null),
  ('MXN', 'Mexican peso', 2, 'ecb', null),
  ('BRL', 'Brazilian real', 2, 'ecb', null),
  ('ZAR', 'South African rand', 2, 'ecb', null),
  ('AED', 'UAE dirham', 2, 'usd_peg', 3.6725),
  ('SAR', 'Saudi riyal', 2, 'usd_peg', 3.75),
  ('QAR', 'Qatari riyal', 2, 'usd_peg', 3.64),
  ('OMR', 'Omani rial', 3, 'usd_peg', 0.3845),
  ('BHD', 'Bahraini dinar', 3, 'usd_peg', 0.376);

alter table public.currencies enable row level security;
alter table public.currencies force row level security;
revoke all on public.currencies from anon;
revoke insert, update, delete, truncate, trigger, references on public.currencies from authenticated;
create policy currencies_select on public.currencies for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Daily exchange rates: units of each currency per 1 US dollar
-- ---------------------------------------------------------------------------
create table public.fx_rates (
  rate_date date not null,
  currency char(3) not null references public.currencies(code),
  per_usd numeric not null check (per_usd > 0 and per_usd < 1e9),
  primary key (rate_date, currency)
);
alter table public.fx_rates enable row level security;
alter table public.fx_rates force row level security;
revoke all on public.fx_rates from anon;
revoke insert, update, delete, truncate, trigger, references on public.fx_rates from authenticated;
create policy fx_rates_select on public.fx_rates for select to authenticated using (true);

-- Stores ECB rates (units per 1 EUR) for one or more days, converted to "per 1 USD", plus the
-- dollar-pegged currencies. Days already stored are left untouched. Returns days added.
create or replace function public.cron_store_rates(p_token text, p_days jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_day record;
  v_date date;
  v_usd numeric;
  v_added integer := 0;
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_days) <> 'object' or (select count(*) from jsonb_object_keys(p_days)) > 400 then
    raise exception 'Expected up to 400 days of rates' using errcode = '22023';
  end if;

  for v_day in select key, value from jsonb_each(p_days) loop
    if v_day.key !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(v_day.value) <> 'object' then
      raise exception 'Bad day %', left(v_day.key, 20) using errcode = '22023';
    end if;
    v_date := v_day.key::date;
    if v_date > current_date + 1 or v_date < date '1999-01-04' then
      raise exception 'Date out of range' using errcode = '22023';
    end if;
    continue when exists (select 1 from public.fx_rates where rate_date = v_date);

    v_usd := nullif(v_day.value ->> 'USD', '')::numeric;
    if v_usd is null or v_usd <= 0 then
      raise exception 'Missing USD rate for %', v_date using errcode = '22023';
    end if;

    insert into public.fx_rates (rate_date, currency, per_usd)
    select v_date, c.code,
           case c.rate_source
             when 'base' then 1 / v_usd
             when 'usd_peg' then c.usd_peg
             else (v_day.value ->> c.code)::numeric / v_usd
           end
    from public.currencies c
    where c.rate_source <> 'ecb'
       or (jsonb_typeof(v_day.value -> c.code) in ('number', 'string')
           and (v_day.value ->> c.code)::numeric > 0);
    v_added := v_added + 1;
  end loop;
  return v_added;
end $$;

-- What the job needs to know: the latest and earliest days stored, and the earliest day any
-- workspace has money recorded on (so older rates can be filled in once).
create or replace function public.cron_rates_status(p_token text)
returns table (latest_stored date, earliest_stored date, earliest_needed date)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select
    (select max(rate_date) from public.fx_rates),
    (select min(rate_date) from public.fx_rates),
    least(
      (select min(check_in) from public.reservations),
      (select min(date) from public.daily_expenses),
      (select min(received_date) from public.payouts),
      (select min(due_date) from public.property_rent_cheques),
      (select min(date) from public.property_setup_costs),
      (select min(start_operation_date) from public.properties)
    );
end $$;

-- Only the daily job (publishable key, anon role, plus the secret token) calls these.
revoke all on function public.cron_store_rates(text, jsonb) from public, authenticated;
revoke all on function public.cron_rates_status(text) from public, authenticated;
grant execute on function public.cron_store_rates(text, jsonb) to anon;
grant execute on function public.cron_rates_status(text) to anon;

-- ---------------------------------------------------------------------------
-- 3. Drop the dirham-only names (the tables hold no data yet)
-- ---------------------------------------------------------------------------
alter table public.properties rename column annual_rent_aed to annual_rent;
alter table public.properties rename column monthly_rent_aed to monthly_rent;
alter table public.property_rent_cheques rename column amount_aed to amount;
alter table public.property_rent_cheques drop column amount_native;
alter table public.property_setup_costs rename column amount_aed to amount;
alter table public.reservations rename column total_booking_revenue_aed to total_booking_revenue;
alter table public.reservations rename column net_payout_aed to net_payout;
alter table public.reservations rename column cleaning_cost_aed to cleaning_cost;
alter table public.daily_expenses rename column amount_aed to amount;
alter table public.monthly_bills rename column amount_aed to amount;
alter table public.assets rename column cost_aed to cost;
alter table public.payouts rename column amount_aed to amount;
alter table public.payout_allocations rename column amount_aed to amount;
alter table public.payout_adjustments rename column amount_aed to amount;

-- ---------------------------------------------------------------------------
-- 4. Where each property is, and its currency
-- ---------------------------------------------------------------------------
alter table public.properties drop constraint if exists properties_currency_check;
alter table public.properties alter column currency type char(3) using upper(currency);
alter table public.properties
  add constraint properties_currency_fk foreign key (currency) references public.currencies(code),
  add column country char(2) check (country ~ '^[A-Z]{2}$'),
  add column region text check (char_length(region) <= 100 and region !~ '[[:cntrl:]]'),
  add column city text check (char_length(city) <= 100 and city !~ '[[:cntrl:]]'),
  add column timezone text check (char_length(timezone) <= 64 and timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){0,2}$');

-- Workspace display currency must be one we can convert.
update public.organizations set base_currency = 'AED' where base_currency not in (select code from public.currencies);
alter table public.organizations
  add constraint organizations_base_currency_fk foreign key (base_currency) references public.currencies(code);

-- ---------------------------------------------------------------------------
-- 5. A currency on every money row
-- ---------------------------------------------------------------------------
alter table public.property_rent_cheques add column currency char(3) references public.currencies(code);
alter table public.property_setup_costs  add column currency char(3) references public.currencies(code);
alter table public.reservations          add column currency char(3) references public.currencies(code);
alter table public.service_records       add column currency char(3) references public.currencies(code);
alter table public.vendor_invoices       add column currency char(3) references public.currencies(code);
alter table public.vendor_payments       add column currency char(3) references public.currencies(code);
alter table public.daily_expenses        add column currency char(3) references public.currencies(code);
alter table public.monthly_bills         add column currency char(3) references public.currencies(code);
alter table public.assets                add column currency char(3) references public.currencies(code);
alter table public.payouts               add column currency char(3) references public.currencies(code);
alter table public.payout_adjustments    add column currency char(3) references public.currencies(code);
alter table public.feasibility_scenarios add column currency char(3) references public.currencies(code);
-- A payout's allocations are in the payout's currency; when the booking is in another
-- currency, the amount it covers in the booking's currency is kept beside it.
alter table public.payout_allocations
  add column booking_amount numeric check (abs(booking_amount) < 1e12 and booking_amount <> 0);

-- When a row arrives without a currency: its property's currency, otherwise the workspace's.
-- TG_ARGV[0] names the column that links the row to a property ('' when there is none).
create or replace function private.fill_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_property text;
begin
  if new.currency is not null then
    return new;
  end if;
  if tg_argv[0] <> '' then
    v_property := to_jsonb(new) ->> tg_argv[0];
    if v_property is not null then
      select p.currency into new.currency
      from public.properties p where p.org_id = new.org_id and p.id = v_property;
    end if;
  end if;
  if new.currency is null then
    select o.base_currency into new.currency from public.organizations o where o.id = new.org_id;
  end if;
  return new;
end $$;
revoke all on function private.fill_currency() from public, anon, authenticated;

do $$
declare
  t record;
begin
  for t in select * from (values
      ('properties', ''),
      ('property_rent_cheques', 'property_id'),
      ('property_setup_costs', 'property_id'),
      ('reservations', 'apartment_id'),
      ('service_records', 'apartment_id'),
      ('vendor_invoices', ''),
      ('vendor_payments', ''),
      ('daily_expenses', 'apartment_id'),
      ('monthly_bills', 'apartment_id'),
      ('assets', 'apartment_id'),
      ('payouts', ''),
      ('feasibility_scenarios', '')
    ) as v(tbl, link)
  loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function private.fill_currency(%L)',
                   t.tbl || '_fill_currency', t.tbl, t.link);
    execute format('alter table public.%I alter column currency set not null', t.tbl);
  end loop;
end $$;

-- An explanation of a difference is in its booking's currency, or its payout's when it has no booking.
create or replace function private.fill_adjustment_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.currency is null and new.reservation_id is not null then
    select r.currency into new.currency from public.reservations r
    where r.org_id = new.org_id and r.id = new.reservation_id;
  end if;
  if new.currency is null and new.payout_id is not null then
    select p.currency into new.currency from public.payouts p
    where p.org_id = new.org_id and p.id = new.payout_id;
  end if;
  if new.currency is null then
    select o.base_currency into new.currency from public.organizations o where o.id = new.org_id;
  end if;
  return new;
end $$;
revoke all on function private.fill_adjustment_currency() from public, anon, authenticated;
create trigger payout_adjustments_fill_currency before insert or update on public.payout_adjustments
  for each row execute function private.fill_adjustment_currency();
alter table public.payout_adjustments alter column currency set not null;

-- A property's currency is fixed once anything is recorded against it.
create or replace function private.lock_property_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.currency is distinct from old.currency and (
       exists (select 1 from public.reservations where org_id = old.org_id and apartment_id = old.id)
    or exists (select 1 from public.property_rent_cheques where org_id = old.org_id and property_id = old.id)
    or exists (select 1 from public.property_setup_costs where org_id = old.org_id and property_id = old.id)
    or exists (select 1 from public.daily_expenses where org_id = old.org_id and apartment_id = old.id)
    or exists (select 1 from public.monthly_bills where org_id = old.org_id and apartment_id = old.id)
    or exists (select 1 from public.service_records where org_id = old.org_id and apartment_id = old.id)
    or exists (select 1 from public.assets where org_id = old.org_id and apartment_id = old.id)
  ) then
    raise exception 'This property already has records in %; its currency cannot be changed', old.currency
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function private.lock_property_currency() from public, anon, authenticated;
create trigger properties_lock_currency before update of currency on public.properties
  for each row execute function private.lock_property_currency();

-- ---------------------------------------------------------------------------
-- 6. Functions and indexes that named the old columns
-- ---------------------------------------------------------------------------
drop index if exists public.payouts_no_duplicate_reference;
create unique index payouts_no_duplicate_reference
  on public.payouts (org_id, received_date, amount, currency, reference) where reference is not null;

-- A payout cannot be allocated beyond its own amount (rounding tolerance of 1 unit).
create or replace function private.check_payout_allocation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_amount numeric;
  v_total numeric;
begin
  select amount into v_amount from public.payouts where org_id = new.org_id and id = new.payout_id;
  select coalesce(sum(amount), 0) into v_total
    from public.payout_allocations where org_id = new.org_id and payout_id = new.payout_id;
  if abs(v_total) > abs(v_amount) + 1 or sign(v_total) * sign(v_amount) < 0 then
    raise exception 'Allocations (%) exceed the payout amount (%)', v_total, v_amount using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- Reminder emails: the amount now carries its currency, and "today" follows each
-- property's own time zone (falling back to the workspace's).
create or replace function public.cron_reminders_due(p_token text)
returns table (reminder_key text, kind text, org_id uuid, org_name text, email text, details jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with orgs as (
    select o.id, o.name, o.status, o.trial_ends_at, o.timezone,
           (now() at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date as today
    from public.organizations o
    where o.deletion_requested_at is null
  ),
  recipients as (
    select m.org_id, lower(u.email::text) as email
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.user_preferences up on up.user_id = m.user_id and up.org_id = m.org_id
    where m.role in ('owner', 'manager')
      and u.email is not null
      and coalesce(up.prefs ->> 'emailReminders', 'true') <> 'false'
  ),
  items as (
    select
      'cheque:' || o.id || ':' || c.property_id || ':' || c.id || ':' || s.stage as item_key,
      s.stage as item_kind,
      o.id as item_org,
      jsonb_build_object(
        'property', coalesce(nullif(p.name, ''), p.id),
        'amount', c.amount,
        'currency', c.currency,
        'due_date', c.due_date,
        'cheque_number', c.cheque_number,
        'status', c.status
      ) as item_details
    from orgs o
    join public.property_rent_cheques c on c.org_id = o.id
    join public.properties p on p.org_id = c.org_id and p.id = c.property_id
    cross join lateral (
      select (now() at time zone coalesce(nullif(p.timezone, ''), nullif(o.timezone, ''), 'UTC'))::date as today
    ) pt
    cross join lateral (
      select case
        when c.due_date = pt.today + 7 then 'cheque_7d'
        when c.due_date = pt.today then 'cheque_today'
        when c.due_date = pt.today - 3 then 'cheque_overdue'
      end as stage
    ) s
    where c.status in ('due', 'postponed', 'bounced')
      and s.stage is not null
      and coalesce(p.status, 'active') = 'active'
    union all
    select
      'trial:' || o.id || ':' || s.stage,
      s.stage,
      o.id,
      jsonb_build_object('trial_ends_on', (o.trial_ends_at at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date)
    from orgs o
    cross join lateral (
      select case
        when (o.trial_ends_at at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date = o.today + 3 then 'trial_3d'
        when (o.trial_ends_at at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date = o.today then 'trial_today'
      end as stage
    ) s
    where o.status = 'trialing' and o.trial_ends_at is not null and s.stage is not null
  )
  select
    i.item_key || '|' || md5(r.email),
    i.item_kind,
    i.item_org,
    o.name,
    r.email,
    i.item_details
  from items i
  join orgs o on o.id = i.item_org
  join recipients r on r.org_id = i.item_org
  where not exists (
    select 1 from private.reminder_log l where l.reminder_key = i.item_key || '|' || md5(r.email)
  )
  order by i.item_org, r.email, i.item_kind
  limit 2000;
end $$;
revoke execute on function public.cron_reminders_due(text) from authenticated;
