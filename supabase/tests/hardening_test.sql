-- Checks for 20261103143131_tenancy_hardening.sql
begin;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prosecdef and p.proname <> 'accept_invitation'
               and p.proname <> 'handle_new_user')
  then raise exception 'FAILED: security definer helper still in public schema'; end if;
  if has_function_privilege('anon', 'private.has_org_role(uuid, public.member_role[])', 'execute')
  then raise exception 'FAILED: anon can execute private.has_org_role'; end if;
  if has_function_privilege('authenticated', 'private.keep_one_owner()', 'execute')
  then raise exception 'FAILED: authenticated can execute the trigger function'; end if;
  if has_schema_privilege('anon', 'private', 'usage')
  then raise exception 'FAILED: anon can use the private schema'; end if;
end $$;
rollback;
