-- Policy tests for 20261105105908_staylytics_core_data.sql. Everything runs in one transaction and is rolled back.
-- A failing check raises an exception, which stops psql (ON_ERROR_STOP) and fails CI.
begin;

create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', msg; end if;
end $$;
-- Runs a statement as the current role and fails the test if it succeeds.
create function tests.denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'FAILED (was allowed): %', msg;
end $$;
-- Number of rows a statement touched, as the current role.
create function tests.affected(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
create function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-00000000000a', 'owner-a@example.test', '{"company_name": "Org A"}'),
  ('c0000000-0000-0000-0000-00000000000b', 'stranger-b@example.test', '{"company_name": "Org B"}');

create temp table ids as
  select (select org_id from public.memberships where user_id = 'c0000000-0000-0000-0000-00000000000a') as org_a,
         (select org_id from public.memberships where user_id = 'c0000000-0000-0000-0000-00000000000b') as org_b;
grant select on ids to authenticated, anon;

-- New workspaces are seeded with booking platforms and settings
select tests.ok((select count(*) from public.platforms where org_id = (select org_a from ids)) > 0, 'platforms seeded');
select tests.ok((select count(*) from public.workspace_settings where org_id = (select org_a from ids)) = 1, 'settings seeded');

-- ---------------------------------------------------------------------------
-- Owner A in own workspace
-- ---------------------------------------------------------------------------
select tests.login('c0000000-0000-0000-0000-00000000000a');
set local role authenticated;
insert into public.properties (org_id, id, name) select org_a, 'p1', 'A flat' from ids;
insert into public.property_rent_cheques (org_id, property_id, id, amount_aed, status) select org_a, 'p1', 'c1', 1000, 'due' from ids;
select tests.ok((select count(*) from public.properties) = 1, 'owner sees own property');
select tests.denied(format('update public.properties set org_id = %L where id = %L', (select org_b from ids), 'p1'), 'move a row to another workspace');
select tests.denied(format('insert into public.documents (org_id, id, file_url) values (%L, %L, %L)', (select org_a from ids), 'd1', 'javascript:alert(1)'), 'javascript: document link');
select tests.denied(format('insert into public.properties (org_id, id) values (%L, %L)', (select org_b from ids), 'x'), 'write into another workspace');
select tests.denied('truncate public.properties', 'truncate');
select tests.denied('select count(*) from private.ai_usage', 'read AI usage log');
select public.consume_ai_quota((select org_a from ids), 'receipt') from generate_series(1, 20);
select tests.denied(format('select public.consume_ai_quota(%L, %L)', (select org_a from ids), 'receipt'), '21st receipt scan in an hour');
reset role;

-- ---------------------------------------------------------------------------
-- B, a stranger to workspace A
-- ---------------------------------------------------------------------------
select tests.login('c0000000-0000-0000-0000-00000000000b');
set local role authenticated;
select tests.ok((select count(*) from public.properties where org_id = (select org_a from ids)) = 0, 'stranger cannot read properties');
select tests.ok((select count(*) from public.property_rent_cheques where org_id = (select org_a from ids)) = 0, 'stranger cannot read cheques');
select tests.ok(tests.affected(format('update public.properties set name = %L where org_id = %L', 'hacked', (select org_a from ids))) = 0, 'stranger cannot update');
select tests.ok(tests.affected(format('delete from public.properties where org_id = %L', (select org_a from ids))) = 0, 'stranger cannot delete');
select tests.denied(format('select public.consume_ai_quota(%L, %L)', (select org_a from ids), 'market'), 'stranger uses workspace AI quota');
select tests.denied(format('select * from public.list_team(%L)', (select org_a from ids)), 'stranger lists team');
reset role;

-- ---------------------------------------------------------------------------
-- B as viewer, then staff, of workspace A
-- ---------------------------------------------------------------------------
insert into public.memberships (org_id, user_id, role) select org_a, 'c0000000-0000-0000-0000-00000000000b', 'viewer' from ids;
set local role authenticated;
select tests.ok((select count(*) from public.properties where org_id = (select org_a from ids)) = 1, 'viewer can read');
select tests.denied(format('insert into public.reservations (org_id, id) values (%L, %L)', (select org_a from ids), 'r1'), 'viewer writes');
select tests.denied(format('select public.consume_ai_quota(%L, %L)', (select org_a from ids), 'receipt'), 'viewer uses AI');
reset role;

update public.memberships set role = 'staff' where org_id = (select org_a from ids) and user_id = 'c0000000-0000-0000-0000-00000000000b';
set local role authenticated;
insert into public.reservations (org_id, id, status) select org_a, 'r1', 'confirmed' from ids;
select tests.denied(format('insert into public.properties (org_id, id) values (%L, %L)', (select org_a from ids), 'p2'), 'staff creates property');
select tests.ok(tests.affected(format('delete from public.properties where org_id = %L', (select org_a from ids))) = 0, 'staff cannot delete properties');
select tests.denied(format('insert into public.vendor_payments (org_id, id, amount_paid) values (%L, %L, 5)', (select org_a from ids), 'pay1'), 'staff records a payment');
reset role;

-- ---------------------------------------------------------------------------
-- Read-only workspace, and trial expiry after the 5-day grace
-- ---------------------------------------------------------------------------
update public.organizations set status = 'read_only' where id = (select org_a from ids);
select tests.login('c0000000-0000-0000-0000-00000000000a');
set local role authenticated;
select tests.denied(format('insert into public.reservations (org_id, id) values (%L, %L)', (select org_a from ids), 'r2'), 'write to read-only workspace');
select tests.ok((select count(*) from public.properties where org_id = (select org_a from ids)) = 1, 'read-only workspace still readable');
reset role;

update public.organizations set status = 'trialing', trial_ends_at = now() - interval '3 days' where id = (select org_a from ids);
set local role authenticated;
insert into public.reservations (org_id, id) select org_a, 'r3' from ids; -- day 3 of grace: still writable
reset role;

update public.organizations set trial_ends_at = now() - interval '6 days' where id = (select org_a from ids);
set local role authenticated;
select tests.denied(format('insert into public.reservations (org_id, id) values (%L, %L)', (select org_a from ids), 'r4'), 'write after trial and grace ended');
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------
select tests.login(null);
set local role anon;
select tests.denied('select count(*) from public.properties', 'anon reads properties');
select tests.denied(format('select public.consume_ai_quota(%L, %L)', (select org_a from ids), 'receipt'), 'anon calls AI quota');
reset role;

rollback;
