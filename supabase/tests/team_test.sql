-- Checks for list_team (20261103144843_list_team.sql).
begin;
create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAILED: %', msg; end if; end $$;
grant usage on schema tests to authenticated;
grant execute on function tests.ok(boolean, text) to authenticated;
create function tests.org_of(p_user uuid) returns uuid language sql security definer as $$
  select id from public.organizations where created_by = p_user
$$;
grant execute on function tests.org_of(uuid) to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@example.com', '{"full_name": "Bob"}');
insert into public.invitations (org_id, email, role, invited_by)
select tests.org_of('a0000000-0000-0000-0000-00000000000a'), 'carol@example.com', 'staff', 'a0000000-0000-0000-0000-00000000000a';
insert into auth.users (id, email, raw_user_meta_data)
select 'c0000000-0000-0000-0000-00000000000c', 'carol@example.com', jsonb_build_object('full_name', 'Carol', 'invite_token', token)
from public.invitations where email = 'carol@example.com';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', true);

select tests.ok((select count(*) = 2 from public.list_team(tests.org_of('a0000000-0000-0000-0000-00000000000a'))), 'staff sees both team members');
select tests.ok((select string_agg(email || ':' || role || ':' || is_me, ',' order by email)
                 from public.list_team(tests.org_of('a0000000-0000-0000-0000-00000000000a')))
                = 'alice@example.com:owner:false,carol@example.com:staff:true', 'names, roles and is_me are right');
select tests.ok((select role = 'owner' from public.list_team(tests.org_of('a0000000-0000-0000-0000-00000000000a')) limit 1), 'owners listed first');

do $$ begin
  perform * from public.list_team(tests.org_of('b0000000-0000-0000-0000-00000000000b'));
  raise exception 'FAILED: listed another workspace''s team';
exception when insufficient_privilege then null; end $$;

reset role;
set local role anon;
do $$ begin
  perform * from public.list_team(tests.org_of('a0000000-0000-0000-0000-00000000000a'));
  raise exception 'FAILED: anon listed a team';
exception when insufficient_privilege then null; end $$;
rollback;
