-- Step 1.5: the Team page lists members with their names and emails.
-- Emails live in auth.users, which the browser cannot read, so this function returns them,
-- but only to members of that workspace.
create function public.list_team(p_org uuid)
returns table (membership_id uuid, user_id uuid, full_name text, email text, role public.member_role,
               joined_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_org_role(p_org) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, p.full_name, u.email::text, m.role, m.created_at, m.user_id = auth.uid()
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.org_id = p_org
    order by array_position(array['owner', 'manager', 'staff', 'viewer']::public.member_role[], m.role),
             coalesce(p.full_name, u.email);
end $$;

revoke execute on function public.list_team(uuid) from public, anon;
grant execute on function public.list_team(uuid) to authenticated;
