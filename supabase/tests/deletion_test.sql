-- Policy tests for 20261113065258_workspace_deletion_hold.sql. Rolled back.
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
  ('e2000000-0000-0000-0000-00000000000a', 'owner@example.test',   '{"company_name": "Deletable Co"}'),
  ('e2000000-0000-0000-0000-00000000000b', 'manager@example.test', '{"company_name": "Other"}');
create temp table ids as select
  (select org_id from public.memberships where user_id = 'e2000000-0000-0000-0000-00000000000a') as org_a;
grant select on ids to authenticated, anon;
insert into public.memberships (org_id, user_id, role)
  select org_a, 'e2000000-0000-0000-0000-00000000000b'::uuid, 'manager'::public.member_role from ids;
update public.organizations set name = 'Deletable Co', status = 'active' where id = (select org_a from ids);

-- A manager cannot delete; an owner must type the exact name
select tests.login('e2000000-0000-0000-0000-00000000000b');
set local role authenticated;
select tests.denied(format('select public.request_workspace_deletion(%L, %L)', (select org_a from ids), 'Deletable Co'), 'manager requests deletion');
select tests.denied(format('update public.organizations set deletion_requested_at = now() where id = %L', (select org_a from ids)), 'setting the deletion date directly');
reset role;

select tests.login('e2000000-0000-0000-0000-00000000000a');
set local role authenticated;
select tests.denied(format('select public.request_workspace_deletion(%L, %L)', (select org_a from ids), 'Deletable'), 'wrong name typed');
insert into public.reservations (org_id, id) select org_a, 'before' from ids;
select public.request_workspace_deletion((select org_a from ids), ' Deletable Co ');
select tests.ok((select deletion_requested_at is not null from public.organizations where id = (select org_a from ids)), 'deletion requested');
-- read-only during the hold, but still readable for export
select tests.denied(format('insert into public.reservations (org_id, id) values (%L, %L)', (select org_a from ids), 'during'), 'writes during the hold');
select tests.ok((select count(*) from public.reservations) = 1, 'data still readable');
reset role;

-- Purge does nothing before 30 days, and app users cannot call it
select tests.ok(not private.purge_deleted_workspace((select org_a from ids)), 'no purge before 30 days');
set local role authenticated;
select tests.denied(format('select private.purge_deleted_workspace(%L)', (select org_a from ids)), 'app user calls purge');
-- cancel restores writes
select public.cancel_workspace_deletion((select org_a from ids));
insert into public.reservations (org_id, id) select org_a, 'after-cancel' from ids;
reset role;

-- After 30 days the purge removes the workspace and its data
update public.organizations set deletion_requested_at = now() - interval '31 days' where id = (select org_a from ids);
select tests.ok(private.purge_deleted_workspace((select org_a from ids)), 'purged after 30 days');
select tests.ok(not exists (select 1 from public.reservations where org_id = (select org_a from ids)), 'rows removed with the workspace');
rollback;
