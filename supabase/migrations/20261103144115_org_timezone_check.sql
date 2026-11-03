-- Step 1.4: the onboarding wizard sets a workspace's timezone. Reject names Postgres does not know,
-- so daily P&L and reminders always use a valid zone. (A CHECK constraint cannot read the catalog,
-- so this is a trigger.)
create function private.validate_org_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = 'check_violation';
  end if;
  return new;
end $$;

revoke execute on function private.validate_org_timezone() from public, anon, authenticated;

create trigger organizations_validate_timezone
  before insert or update of timezone on public.organizations
  for each row execute function private.validate_org_timezone();
