-- Tests for 20261113130000_multi_currency.sql. Rolled back.
begin;
create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAILED: %', msg; end if; end $$;
create function tests.denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FAILED (was allowed): %', msg;
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

insert into private.app_settings values ('cron_token_sha256', encode(sha256(convert_to('a-long-random-test-token-0123456789abcdef', 'UTF8')), 'hex'))
  on conflict (key) do update set value = excluded.value;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d4000000-0000-0000-0000-00000000000a', 'fx-owner@example.test', '{"company_name": "FX Co"}');
create temp table ids as select (select org_id from public.memberships where user_id = 'd4000000-0000-0000-0000-00000000000a') as org;
grant select on ids to anon, authenticated;
update public.organizations set base_currency = 'AED' where id = (select org from ids);

-- ---------------------------------------------------------------------------
-- Rates: only the job (with its token) can store them; nobody can edit them
-- ---------------------------------------------------------------------------
set local role anon;
select tests.denied($$select public.cron_store_rates('wrong-token-wrong-token-wrong-token-xx', '{"2026-11-12": {"USD": 1.16}}')$$, 'store rates with a wrong token');
select tests.ok(
  public.cron_store_rates('a-long-random-test-token-0123456789abcdef',
    '{"2026-11-12": {"USD": 1.16, "GBP": 0.87, "INR": 98.0}, "2026-11-13": {"USD": 1.2, "GBP": 0.9}}') = 2,
  'job stores two days');
select tests.ok(
  public.cron_store_rates('a-long-random-test-token-0123456789abcdef', '{"2026-11-12": {"USD": 9.99}}') = 0,
  'a stored day is never overwritten');
select tests.denied($$select public.cron_store_rates('a-long-random-test-token-0123456789abcdef', '{"2026-11-14": {"GBP": 0.9}}')$$, 'a day without USD is refused');
select tests.denied($$select public.cron_store_rates('a-long-random-test-token-0123456789abcdef', '{"2099-01-01": {"USD": 1.1}}')$$, 'a future day is refused');
select tests.denied($$select * from public.fx_rates$$, 'anon cannot read rates');
reset role;

select tests.ok((select per_usd from public.fx_rates where rate_date = '2026-11-12' and currency = 'USD') = 1, 'USD is 1 per USD');
select tests.ok(abs((select per_usd from public.fx_rates where rate_date = '2026-11-12' and currency = 'EUR') - 1 / 1.16) < 1e-9, 'EUR from the ECB base');
select tests.ok(abs((select per_usd from public.fx_rates where rate_date = '2026-11-12' and currency = 'GBP') - 0.87 / 1.16) < 1e-9, 'GBP converted to per-USD');
select tests.ok((select per_usd from public.fx_rates where rate_date = '2026-11-12' and currency = 'AED') = 3.6725, 'AED from its dollar peg');
select tests.ok(not exists (select 1 from public.fx_rates where rate_date = '2026-11-13' and currency = 'INR'), 'a currency missing that day is skipped, not guessed');

set local role authenticated;
set local request.jwt.claim.sub = 'd4000000-0000-0000-0000-00000000000a';
select tests.ok((select count(*) from public.fx_rates) > 0, 'signed-in users can read rates');
select tests.ok((select count(*) from public.currencies) >= 35, 'signed-in users can read currencies');
select tests.denied($$insert into public.fx_rates values ('2026-11-10', 'USD', 1)$$, 'users cannot add rates');
select tests.denied($$update public.fx_rates set per_usd = 2$$, 'users cannot edit rates');
select tests.denied($$insert into public.currencies values ('XXX', 'Fake', 2, 'ecb', null)$$, 'users cannot add currencies');
select tests.denied($$select public.cron_rates_status('a-long-random-test-token-0123456789abcdef')$$, 'signed-in users cannot call the job functions');

-- ---------------------------------------------------------------------------
-- Currencies on rows: filled from the property, else the workspace; property currency locks
-- ---------------------------------------------------------------------------
insert into public.properties (org_id, id, name, currency, country, city, timezone)
  select org, 'p-london', 'London flat', 'GBP', 'GB', 'London', 'Europe/London' from ids;
insert into public.properties (org_id, id, name) select org, 'p-dubai', 'Dubai flat' from ids;
select tests.ok((select currency from public.properties where id = 'p-dubai') = 'AED', 'property without a currency takes the workspace currency');

insert into public.reservations (org_id, id, apartment_id, net_payout) select org, 'r-1', 'p-london', 500 from ids;
insert into public.daily_expenses (org_id, id, amount) select org, 'e-1', 20 from ids;
insert into public.daily_expenses (org_id, id, apartment_id, amount, currency) select org, 'e-2', 'p-london', 20, 'EUR' from ids;
select tests.ok((select currency from public.reservations where id = 'r-1') = 'GBP', 'booking takes its property currency');
select tests.ok((select currency from public.daily_expenses where id = 'e-1') = 'AED', 'cost with no property takes the workspace currency');
select tests.ok((select currency from public.daily_expenses where id = 'e-2') = 'EUR', 'an explicit currency is kept');

select tests.denied($$insert into public.daily_expenses (org_id, id, amount, currency) select org, 'e-3', 1, 'XYZ' from ids$$, 'unknown currency refused');
select tests.denied($$update public.properties set currency = 'USD' where id = 'p-london'$$, 'currency of a property with records is locked');
update public.properties set currency = 'USD' where id = 'p-dubai';
select tests.ok((select currency from public.properties where id = 'p-dubai') = 'USD', 'currency of an empty property can change');
select tests.denied($$update public.properties set timezone = 'not a zone!' where id = 'p-dubai'$$, 'malformed time zone refused');
select tests.denied($$update public.organizations set base_currency = 'XYZ' where id = (select org from ids)$$, 'workspace display currency must be supported');

-- Payouts keep their own currency; differences on a booking take the booking's currency
insert into public.payouts (org_id, id, received_date, amount, currency, source)
  select org, 'f4000000-0000-0000-0000-000000000001', '2026-11-12', 640, 'USD', 'manual' from ids;
insert into public.payout_allocations (org_id, payout_id, reservation_id, amount, booking_amount)
  select org, 'f4000000-0000-0000-0000-000000000001', 'r-1', 640, 480 from ids;
insert into public.payout_adjustments (org_id, id, reservation_id, amount, reason)
  select org, 'f4000000-0000-0000-0000-000000000002', 'r-1', -20, 'exchange_rate' from ids;
select tests.ok((select currency from public.payout_adjustments where id = 'f4000000-0000-0000-0000-000000000002') = 'GBP', 'difference takes its booking currency');
select tests.ok((select booking_amount from public.payout_allocations where reservation_id = 'r-1') = 480, 'booking-currency amount kept beside the payout amount');

reset role;
set local role anon;
select tests.ok(
  (select earliest_needed from public.cron_rates_status('a-long-random-test-token-0123456789abcdef')) is null
  or (select earliest_needed from public.cron_rates_status('a-long-random-test-token-0123456789abcdef')) is not null,
  'job can read rates status');
reset role;

rollback;
