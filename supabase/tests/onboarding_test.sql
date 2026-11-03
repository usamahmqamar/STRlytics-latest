-- Checks for the onboarding settings an owner saves (20261103144115_org_timezone_check.sql).
begin;
create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAILED: %', msg; end if; end $$;
grant usage on schema tests to authenticated;
grant execute on function tests.ok(boolean, text) to authenticated;

insert into auth.users (id, email, raw_user_meta_data)
values ('a0000000-0000-0000-0000-00000000000a', 'owner@example.com', '{"company_name": "Palm Stays"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', true);

select tests.ok((select onboarding_completed_at is null from public.organizations), 'new workspace needs onboarding');

update public.organizations
set name = 'Palm Stays FZ-LLC', country = 'AE', base_currency = 'AED', timezone = 'Asia/Dubai',
    tax_id = '100000000000003', onboarding_completed_at = now();
select tests.ok((select country = 'AE' and base_currency = 'AED' and timezone = 'Asia/Dubai'
                        and onboarding_completed_at is not null from public.organizations), 'owner saves onboarding');

do $$ begin
  update public.organizations set timezone = 'Mars/Olympus_Mons';
  raise exception 'FAILED: invalid timezone accepted';
exception when check_violation then null; end $$;

do $$ begin
  update public.organizations set base_currency = 'dirham';
  raise exception 'FAILED: invalid currency accepted';
exception when check_violation or string_data_right_truncation then null; end $$;

do $$ begin
  update public.organizations set base_currency = 'aed';
  raise exception 'FAILED: lower-case currency accepted';
exception when check_violation then null; end $$;

do $$ begin
  update public.organizations set country = 'UAE';
  raise exception 'FAILED: 3-letter country accepted';
exception when check_violation or string_data_right_truncation then null; end $$;

rollback;
