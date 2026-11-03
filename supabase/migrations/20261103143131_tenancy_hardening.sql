-- Fixes from the Supabase security and performance advisors after applying 20261103142951_tenancy.
--
-- 1. Access helpers are SECURITY DEFINER and lived in the API-exposed public schema, so anyone could
--    call them over /rest/v1/rpc. Move them to a private schema the API does not expose. Policies refer
--    to functions by id, so they keep working after the move.
-- 2. Wrap auth.uid() in (select ...) inside policies so Postgres evaluates it once per query, not per row.
-- 3. Index foreign keys that had no covering index.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.has_org_role(uuid, public.member_role[]) set schema private;
alter function public.is_platform_admin() set schema private;
alter function public.org_is_writable(uuid) set schema private;
alter function public.keep_one_owner() set schema private;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_org_role(uuid, public.member_role[]) to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.org_is_writable(uuid) to authenticated;
-- keep_one_owner is a trigger; nobody calls it directly.

-- Policies that call auth.uid() directly: recreate with (select auth.uid()).
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.user_id = profiles.id and private.has_org_role(m.org_id)
  )
  or private.is_platform_admin()
);

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (user_id = (select auth.uid()) or private.has_org_role(org_id, array['owner']::public.member_role[]));

drop policy invitations_insert on public.invitations;
create policy invitations_insert on public.invitations for insert to authenticated with check (
  invited_by = (select auth.uid())
  and accepted_at is null
  and (
    private.has_org_role(org_id, array['owner']::public.member_role[])
    or (private.has_org_role(org_id, array['manager']::public.member_role[]) and role in ('staff', 'viewer'))
  )
);

drop policy user_preferences_all on public.user_preferences;
create policy user_preferences_all on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid()) and private.has_org_role(org_id))
  with check (user_id = (select auth.uid()) and private.has_org_role(org_id));

drop policy platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create index if not exists invitations_invited_by_idx on public.invitations (invited_by);
create index if not exists memberships_invited_by_idx on public.memberships (invited_by);
create index if not exists organizations_created_by_idx on public.organizations (created_by);
create index if not exists user_preferences_org_id_idx on public.user_preferences (org_id);
