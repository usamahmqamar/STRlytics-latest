-- accept_invitation: opening an invitation link you have already used (for example, after joining during
-- email sign-up) returns that workspace instead of an error. Anyone else still gets "not found".
create or replace function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.invitations;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();

  select * into v_invite from public.invitations where token = p_token for update;

  -- Already used by this same person: idempotent success.
  if v_invite.id is not null and v_invite.accepted_at is not null
     and exists (select 1 from public.memberships where org_id = v_invite.org_id and user_id = auth.uid())
  then
    return v_invite.org_id;
  end if;

  if v_invite.id is null or v_invite.accepted_at is not null or v_invite.expires_at <= now()
     or v_invite.email <> v_email then
    raise exception 'Invitation not found, expired, or for another email' using errcode = 'P0002';
  end if;

  insert into public.memberships (org_id, user_id, role, invited_by)
  values (v_invite.org_id, auth.uid(), v_invite.role, v_invite.invited_by)
  on conflict (org_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = v_invite.id;
  return v_invite.org_id;
end $$;

revoke execute on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;
