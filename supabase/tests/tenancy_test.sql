-- Policy tests for 20261103142951_tenancy.sql. Everything runs in one transaction and is rolled back.
-- A failing check raises an exception, which stops psql (ON_ERROR_STOP) and fails CI.
begin;

create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', msg; end if;
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on function tests.ok(boolean, text) to anon, authenticated;

-- Act as a signed-in user (or anon when p_user is null) for the rest of the transaction.
create function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
end $$;
grant execute on function tests.login(uuid) to anon, authenticated;

-- The invitee receives the token by email; tests read it directly.
create function tests.token(p_email text) returns uuid language sql security definer as $$
  select token from public.invitations where email = p_email
$$;
grant execute on function tests.token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up provisioning (step 1.3)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@alicestays.com', '{"company_name": "Alice Stays", "full_name": "Alice"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@bobhomes.com', '{}');

select tests.ok((select count(*) = 2 from public.organizations), 'each sign-up gets a workspace');
select tests.ok((select name = 'Alice Stays' from public.organizations where created_by = 'a0000000-0000-0000-0000-00000000000a'), 'workspace named from company_name');
select tests.ok((select name = 'My workspace' from public.organizations where created_by = 'b0000000-0000-0000-0000-00000000000b'), 'default workspace name');
select tests.ok((select bool_and(status = 'trialing') from public.organizations), 'new workspaces are trialing');
select tests.ok((select bool_and(trial_ends_at between now() + interval '14 days 23 hours' and now() + interval '15 days 1 hour') from public.organizations), 'trial is 15 days');
select tests.ok((select count(*) = 2 from public.memberships where role = 'owner'), 'creator is owner');
select tests.ok((select full_name = 'Alice' from public.profiles where id = 'a0000000-0000-0000-0000-00000000000a'), 'profile created');

-- ---------------------------------------------------------------------------
-- Isolation between operators
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a0000000-0000-0000-0000-00000000000a');

select tests.ok((select count(*) = 1 from public.organizations), 'Alice sees only her workspace');
select tests.ok((select count(*) = 1 from public.memberships), 'Alice sees only her team');
select tests.ok((select count(*) = 1 from public.profiles), 'Alice sees only profiles in her workspaces');

with u as (update public.organizations set name = 'Hijacked' where created_by = 'b0000000-0000-0000-0000-00000000000b' returning 1)
select tests.ok((select count(*) = 0 from u), 'Alice cannot rename Bob''s workspace');

update public.organizations set name = 'Alice Stays LLC', base_currency = 'AED', country = 'AE';
select tests.ok((select name = 'Alice Stays LLC' from public.organizations), 'owner can edit workspace settings');

do $$ begin
  update public.organizations set status = 'active';
  raise exception 'FAILED: tenant changed billing status';
exception when insufficient_privilege then null; end $$;

do $$ begin
  update public.organizations set trial_ends_at = now() + interval '1 year';
  raise exception 'FAILED: tenant extended own trial';
exception when insufficient_privilege then null; end $$;

do $$ begin
  insert into public.organizations (name) values ('Second workspace');
  raise exception 'FAILED: direct workspace insert allowed';
exception when insufficient_privilege then null; end $$;

do $$ begin
  insert into public.memberships (org_id, user_id, role)
  select id, 'a0000000-0000-0000-0000-00000000000a', 'owner' from public.organizations;
  raise exception 'FAILED: direct membership insert allowed';
exception when insufficient_privilege then null; end $$;

do $$ begin
  delete from public.memberships where user_id = auth.uid();
  raise exception 'FAILED: last owner removed';
exception when check_violation then null; end $$;

-- Alice invites Carol (new user, staff) and Bob (existing user, viewer) and Dave.
insert into public.invitations (org_id, email, role, invited_by)
select id, e.email, e.role::public.member_role, auth.uid()
from public.organizations,
     (values ('carol@example.com', 'staff'), ('bob@bobhomes.com', 'viewer'), ('dave@example.com', 'staff')) as e(email, role);
select tests.ok((select count(*) = 3 from public.invitations), 'owner can invite');

do $$ begin
  insert into public.invitations (org_id, email, role, invited_by)
  select id, 'eve@example.com', 'owner', auth.uid() from public.organizations;
  raise exception 'FAILED: owner invitation allowed';
exception when check_violation then null; end $$;

-- ---------------------------------------------------------------------------
-- Joining through an invitation
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email, raw_user_meta_data)
select 'c0000000-0000-0000-0000-00000000000c', 'carol@example.com', jsonb_build_object('invite_token', token)
from public.invitations where email = 'carol@example.com';

select tests.ok((select count(*) = 2 from public.organizations), 'invited sign-up does not create a workspace');
select tests.ok((select role = 'staff' from public.memberships m join public.organizations o on o.id = m.org_id
                 where m.user_id = 'c0000000-0000-0000-0000-00000000000c' and o.created_by = 'a0000000-0000-0000-0000-00000000000a'),
                'Carol joined Alice''s workspace as staff');
select tests.ok((select accepted_at is not null from public.invitations where email = 'carol@example.com'), 'invitation marked accepted');

-- A token used with a different email creates a normal workspace instead of joining.
insert into auth.users (id, email, raw_user_meta_data)
select 'e0000000-0000-0000-0000-00000000000e', 'mallory@example.com', jsonb_build_object('invite_token', token)
from public.invitations where email = 'dave@example.com';
select tests.ok((select count(*) = 0 from public.memberships m join public.organizations o on o.id = m.org_id
                 where m.user_id = 'e0000000-0000-0000-0000-00000000000e' and o.created_by = 'a0000000-0000-0000-0000-00000000000a'),
                'stolen invite token does not grant access');

set local role authenticated;
select tests.login('c0000000-0000-0000-0000-00000000000c');
select tests.ok((select count(*) = 0 from public.invitations), 'staff cannot see invitations');
do $$ begin
  insert into public.invitations (org_id, email, role, invited_by)
  select id, 'frank@example.com', 'staff', auth.uid() from public.organizations;
  raise exception 'FAILED: staff could invite';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.memberships set role = 'owner' where user_id = auth.uid();
  if found then raise exception 'FAILED: staff promoted themselves'; end if;
end $$;

-- Carol opens the invitation link again after joining at sign-up: she gets the workspace, not an error.
select tests.ok((select public.accept_invitation(tests.token('carol@example.com'))
                 = (select id from public.organizations)), 'reopening a used invitation is harmless for its owner');

-- Mallory cannot reuse Carol's used token.
select tests.login('e0000000-0000-0000-0000-00000000000e');
do $$ begin
  perform public.accept_invitation(tests.token('carol@example.com'));
  raise exception 'FAILED: someone else reused an accepted invitation';
exception when sqlstate 'P0002' then null; end $$;
select tests.login('c0000000-0000-0000-0000-00000000000c');

-- Existing user Bob accepts from inside the app; he now belongs to two workspaces.
select tests.login('b0000000-0000-0000-0000-00000000000b');
select public.accept_invitation(tests.token('bob@bobhomes.com'));
select tests.ok((select count(*) = 2 from public.organizations), 'Bob sees both of his workspaces');

do $$ begin
  perform public.accept_invitation(tests.token('dave@example.com'));
  raise exception 'FAILED: accepted an invitation addressed to someone else';
exception when sqlstate 'P0002' then null; end $$;

-- Carol (staff) can leave Alice's workspace on her own.
select tests.login('c0000000-0000-0000-0000-00000000000c');
delete from public.memberships where user_id = auth.uid();
select tests.ok((select count(*) = 0 from public.organizations), 'Carol left the workspace');

-- ---------------------------------------------------------------------------
-- Preferences are per person
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-0000-0000-00000000000a');
insert into public.user_preferences (user_id, org_id, prefs)
select auth.uid(), id, '{"theme": "dark"}' from public.organizations;
select tests.login('b0000000-0000-0000-0000-00000000000b');
select tests.ok((select count(*) = 0 from public.user_preferences), 'Bob cannot see Alice''s preferences');

-- ---------------------------------------------------------------------------
-- Anonymous visitors see nothing
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select tests.login(null);
do $$ begin
  perform 1 from public.organizations;
  raise exception 'FAILED: anon can read organizations';
exception when insufficient_privilege then null; end $$;

-- ---------------------------------------------------------------------------
-- Deleting a workspace removes its memberships without tripping the owner guard
-- ---------------------------------------------------------------------------
reset role;
delete from public.organizations where created_by = 'b0000000-0000-0000-0000-00000000000b';
select tests.ok((select count(*) = 0 from public.memberships m left join public.organizations o on o.id = m.org_id where o.id is null),
                'no orphan memberships');

rollback;
