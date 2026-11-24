-- Policy tests for 20261113064718_feasibility_scenarios.sql. Rolled back.
begin;
create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAILED: %', msg; end if; end $$;
create function tests.denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FAILED (was allowed): %', msg;
end $$;
create function tests.login(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true); end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-0000-0000-00000000000a', 'fa@example.test', '{"company_name": "A"}'),
  ('f1000000-0000-0000-0000-00000000000b', 'fv@example.test', '{"company_name": "V"}'),
  ('f1000000-0000-0000-0000-00000000000c', 'fx@example.test', '{"company_name": "X"}');
create temp table ids as select
  (select org_id from public.memberships where user_id = 'f1000000-0000-0000-0000-00000000000a') as org_a;
grant select on ids to authenticated, anon;
insert into public.memberships (org_id, user_id, role)
  select org_a, 'f1000000-0000-0000-0000-00000000000b'::uuid, 'viewer'::public.member_role from ids;

select tests.login('f1000000-0000-0000-0000-00000000000a');
set local role authenticated;
insert into public.feasibility_scenarios (org_id, name, inputs) select org_a, 'Marina 1BR', '{"nightlyRate": 650}' from ids;
select tests.denied(format('insert into public.feasibility_scenarios (org_id, name, inputs) values (%L, %L, %L)', (select org_a from ids), 'x', '[1,2]'), 'inputs must be an object');
select tests.denied(format('insert into public.feasibility_scenarios (org_id, name, inputs) values (%L, %L, %L)', (select org_a from ids), repeat('x', 200), '{}'), 'name too long');
select tests.denied(format('insert into public.feasibility_scenarios (org_id, name, inputs) values (%L, %L, %L::jsonb)', (select org_a from ids), 'big', '{"a":"' || repeat('x', 20000) || '"}'), 'inputs too large');
reset role;

select tests.login('f1000000-0000-0000-0000-00000000000b');
set local role authenticated;
select tests.ok((select count(*) from public.feasibility_scenarios) = 1, 'viewer reads scenarios');
select tests.denied(format('insert into public.feasibility_scenarios (org_id, name, inputs) values (%L, %L, %L)', (select org_a from ids), 'v', '{}'), 'viewer saves a scenario');
reset role;

select tests.login('f1000000-0000-0000-0000-00000000000c');
set local role authenticated;
select tests.ok((select count(*) from public.feasibility_scenarios) = 0, 'other workspace sees nothing');
select tests.denied(format('insert into public.feasibility_scenarios (org_id, name, inputs) values (%L, %L, %L)', (select org_a from ids), 'x', '{}'), 'other workspace writes');
reset role;
rollback;
