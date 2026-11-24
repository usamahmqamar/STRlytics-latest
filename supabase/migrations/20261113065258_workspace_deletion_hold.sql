-- Workspace deletion with a 30-day hold.
--
-- An owner requests deletion by typing the workspace name. From then on the workspace is
-- read-only (data stays readable and exportable) and any owner can cancel within 30 days.
-- After 30 days, private.purge_deleted_workspace() removes the workspace and all its rows.
-- The purge is NOT scheduled here: scheduling it (for example with pg_cron) is a separate,
-- explicit decision, because it permanently deletes customer data.

alter table public.organizations
  add column deletion_requested_at timestamptz,
  add column deletion_requested_by uuid references auth.users(id) on delete set null;

-- Writes stop while deletion is pending.
create or replace function private.org_is_writable(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_org
      and o.deletion_requested_at is null
      and (
        o.status in ('active', 'past_due')
        or (o.status = 'trialing' and (o.trial_ends_at is null or o.trial_ends_at + interval '5 days' > now()))
      )
  );
$$;

create or replace function public.request_workspace_deletion(p_org uuid, p_confirm_name text)
returns timestamptz
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not private.has_org_role(p_org, '{owner}'::public.member_role[]) then
    raise exception 'Only an owner can delete the workspace' using errcode = '42501';
  end if;
  select name into v_name from public.organizations where id = p_org for update;
  if v_name is null or btrim(coalesce(p_confirm_name, '')) <> v_name then
    raise exception 'The name typed does not match the workspace name' using errcode = '22023';
  end if;
  update public.organizations
     set deletion_requested_at = coalesce(deletion_requested_at, now()),
         deletion_requested_by = coalesce(deletion_requested_by, auth.uid())
   where id = p_org;
  return (select deletion_requested_at + interval '30 days' from public.organizations where id = p_org);
end $$;

create or replace function public.cancel_workspace_deletion(p_org uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_org_role(p_org, '{owner}'::public.member_role[]) then
    raise exception 'Only an owner can cancel deletion' using errcode = '42501';
  end if;
  update public.organizations set deletion_requested_at = null, deletion_requested_by = null where id = p_org;
end $$;

revoke all on function public.request_workspace_deletion(uuid, text) from public, anon;
revoke all on function public.cancel_workspace_deletion(uuid) from public, anon;
grant execute on function public.request_workspace_deletion(uuid, text) to authenticated;
grant execute on function public.cancel_workspace_deletion(uuid) to authenticated;

-- Removes one workspace whose 30-day hold has passed. Not callable by app users.
create or replace function private.purge_deleted_workspace(p_org uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.organizations
   where id = p_org
     and deletion_requested_at is not null
     and deletion_requested_at < now() - interval '30 days';
  return found;
end $$;
revoke all on function private.purge_deleted_workspace(uuid) from public, anon, authenticated;

-- Deletion columns are changed only through the two functions above.
create or replace function private.protect_deletion_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.deletion_requested_at is distinct from old.deletion_requested_at
          or new.deletion_requested_by is distinct from old.deletion_requested_by) then
    raise exception 'Use request or cancel workspace deletion' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger organizations_protect_deletion before update on public.organizations
  for each row execute function private.protect_deletion_columns();
