-- Deleting a user account no longer fails with "An organisation must keep at least one owner".
--
-- Before: the last-owner rule also blocked the membership removal that happens automatically
-- when an account is deleted, so the account could not be deleted at all.
-- Now, when the account itself is gone:
--   * if other members remain, the longest-standing manager (else staff, else viewer) becomes owner;
--   * if nobody remains, the workspace and its data are kept (not deleted) for the deletion process.
-- Removing an owner while the account still exists is still refused unless another owner remains.

create or replace function private.keep_one_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := old.org_id;
  v_successor uuid;
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations where id = v_org)   -- allow cascade on org delete
     and not exists (
       select 1 from public.memberships
       where org_id = v_org and role = 'owner' and id <> old.id
     )
  then
    if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = old.user_id) then
      select id into v_successor
      from public.memberships
      where org_id = v_org and id <> old.id
      order by case role when 'manager' then 1 when 'staff' then 2 else 3 end, created_at
      limit 1;
      if v_successor is not null then
        update public.memberships set role = 'owner' where id = v_successor;
      end if;
      return old;
    end if;
    raise exception 'An organisation must keep at least one owner' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

-- Records keep who created them, but when that account is deleted the reference is cleared
-- (ON DELETE SET NULL). The tenant lock used to restore it, which made account deletion fail
-- for anyone who had ever created data. Clearing is allowed only once the account is gone.
create or replace function private.lock_tenant_columns()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id cannot be changed' using errcode = '42501';
  end if;
  if tg_argv[0] = 'property' then
    if new.property_id is distinct from old.property_id then
      raise exception 'property_id cannot be changed' using errcode = '42501';
    end if;
  end if;
  if new.created_by is distinct from old.created_by then
    -- The account lookup only runs when the creator is being cleared.
    if new.created_by is not null or old.created_by is null
       or exists (select 1 from auth.users where id = old.created_by) then
      new.created_by := old.created_by;
    end if;
  end if;
  new.created_at := old.created_at;
  return new;
end $$;

revoke all on function private.lock_tenant_columns() from public, anon, authenticated;
