-- Step 1.1 + 1.3: operator workspaces (tenants), members, invitations, preferences, platform admins,
-- and provisioning of a workspace with a 15-day trial when someone signs up.
--
-- Tenancy rule: every tenant-owned row carries org_id, and row-level security only lets a user
-- see rows of organisations they are a member of.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'manager', 'staff', 'viewer');
create type public.org_status as enum ('trialing', 'active', 'past_due', 'read_only', 'cancelled');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.organizations (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (char_length(name) between 1 and 120),
  country                  char(2) check (country ~ '^[A-Z]{2}$'),          -- ISO 3166-1 alpha-2
  base_currency            char(3) not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  timezone                 text not null default 'UTC',
  tax_id                   text check (char_length(tax_id) <= 64),
  billing_email            text check (char_length(billing_email) <= 254),
  status                   public.org_status not null default 'trialing',
  trial_ends_at            timestamptz,
  onboarding_completed_at  timestamptz,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null,
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  email        text not null check (email = lower(email) and char_length(email) <= 254),
  role         public.member_role not null check (role <> 'owner'),
  token        uuid not null unique default gen_random_uuid(),
  invited_by   uuid references auth.users (id) on delete set null,
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index invitations_open_per_email on public.invitations (org_id, email) where accepted_at is null;

create table public.user_preferences (
  user_id     uuid not null references auth.users (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  prefs       jsonb not null default '{}'::jsonb,   -- dashboard layout, theme, font size
  updated_at  timestamptz not null default now(),
  primary key (user_id, org_id)
);

create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies can read memberships without recursion)
-- ---------------------------------------------------------------------------
create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create function public.has_org_role(p_org uuid, p_roles public.member_role[]
  default array['owner', 'manager', 'staff', 'viewer']::public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role = any (p_roles)
  );
$$;

-- An organisation in read_only or cancelled status keeps reads but blocks writes (used by later migrations).
create function public.org_is_writable(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizations
    where id = p_org and status in ('trialing', 'active', 'past_due')
  );
$$;

-- ---------------------------------------------------------------------------
-- Guard: an organisation must always keep at least one owner
-- ---------------------------------------------------------------------------
create function public.keep_one_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := old.org_id;
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations where id = v_org)   -- allow cascade on org delete
     and not exists (
       select 1 from public.memberships
       where org_id = v_org and role = 'owner' and id <> old.id
     )
  then
    raise exception 'An organisation must keep at least one owner' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_keep_one_owner
  before update or delete on public.memberships
  for each row execute function public.keep_one_owner();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.organizations     enable row level security;
alter table public.memberships       enable row level security;
alter table public.invitations       enable row level security;
alter table public.user_preferences  enable row level security;
alter table public.platform_admins   enable row level security;

-- Anonymous visitors never touch tenant tables.
revoke all on public.profiles, public.organizations, public.memberships, public.invitations,
              public.user_preferences, public.platform_admins from anon;

-- profiles: yourself, and people who share an organisation with you
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (
    select 1 from public.memberships m
    where m.user_id = profiles.id and public.has_org_role(m.org_id)
  )
  or public.is_platform_admin()
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- organizations: members read; owners and managers edit settings.
-- Workspaces are created only by the provisioning function, never directly.
create policy organizations_select on public.organizations for select to authenticated
  using (public.has_org_role(id) or public.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner', 'manager']::public.member_role[]))
  with check (public.has_org_role(id, array['owner', 'manager']::public.member_role[]));
-- Tenants may only change these columns; status and trial dates belong to billing (Phase 4).
revoke insert, update, delete on public.organizations from authenticated;
grant update (name, country, base_currency, timezone, tax_id, billing_email, onboarding_completed_at)
  on public.organizations to authenticated;

-- memberships: members see their team; owners manage it; anyone may leave.
create policy memberships_select on public.memberships for select to authenticated
  using (public.has_org_role(org_id) or public.is_platform_admin());
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_org_role(org_id, array['owner']::public.member_role[]))
  with check (public.has_org_role(org_id, array['owner']::public.member_role[]));
create policy memberships_delete on public.memberships for delete to authenticated
  using (user_id = auth.uid() or public.has_org_role(org_id, array['owner']::public.member_role[]));
-- New members arrive only through invitations (accept_invitation / sign-up), never by direct insert.
revoke insert on public.memberships from authenticated;
revoke update on public.memberships from authenticated;
grant update (role) on public.memberships to authenticated;

-- invitations: owners and managers invite; managers cannot create managers.
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'manager']::public.member_role[]));
create policy invitations_insert on public.invitations for insert to authenticated with check (
  invited_by = auth.uid()
  and accepted_at is null
  and (
    public.has_org_role(org_id, array['owner']::public.member_role[])
    or (public.has_org_role(org_id, array['manager']::public.member_role[]) and role in ('staff', 'viewer'))
  )
);
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'manager']::public.member_role[]));
revoke update on public.invitations from authenticated;

-- user_preferences: each person's own, inside organisations they belong to
create policy user_preferences_all on public.user_preferences for all to authenticated
  using (user_id = auth.uid() and public.has_org_role(org_id))
  with check (user_id = auth.uid() and public.has_org_role(org_id));

-- platform_admins: you can only see whether you yourself are one; managed via service role.
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.platform_admins from authenticated;

-- ---------------------------------------------------------------------------
-- Step 1.3: provisioning on sign-up
--   * With a valid invitation token (raw_user_meta_data.invite_token) whose email matches,
--     the user joins that organisation with the invited role.
--   * Otherwise a new workspace is created with the user as owner and a 15-day trial.
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_invite  public.invitations;
  v_org_id  uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(trim(coalesce(v_meta ->> 'full_name', '')), 120), ''));

  if v_meta ? 'invite_token' then
    select * into v_invite from public.invitations
    where token = nullif(v_meta ->> 'invite_token', '')::uuid
      and accepted_at is null
      and expires_at > now()
      and email = lower(new.email)
    for update;
  end if;

  if v_invite.id is not null then
    insert into public.memberships (org_id, user_id, role, invited_by)
    values (v_invite.org_id, new.id, v_invite.role, v_invite.invited_by);
    update public.invitations set accepted_at = now() where id = v_invite.id;
  else
    insert into public.organizations (name, created_by, status, trial_ends_at)
    values (
      coalesce(nullif(left(trim(coalesce(v_meta ->> 'company_name', '')), 120), ''), 'My workspace'),
      new.id,
      'trialing',
      now() + interval '15 days'   -- trial length decided 2026-10-30
    )
    returning id into v_org_id;

    insert into public.memberships (org_id, user_id, role) values (v_org_id, new.id, 'owner');
  end if;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Existing users accept an invitation from inside the app.
create function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.invitations;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();

  select * into v_invite from public.invitations
  where token = p_token and accepted_at is null and expires_at > now()
  for update;

  if v_invite.id is null or v_invite.email <> v_email then
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
revoke execute on function public.handle_new_user() from public, anon, authenticated;
