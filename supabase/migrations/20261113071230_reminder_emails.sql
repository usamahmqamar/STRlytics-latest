-- Daily reminder emails: rent cheques and trials ending.
--
-- A daily job (Vercel cron, /api/cron/reminders) asks the database which reminders are due,
-- sends them, then records them as sent so each is sent once. The job proves itself with a
-- secret token whose SHA-256 is stored here; no service-role key is needed on the server and
-- the token only unlocks these two functions.
--
-- Set the token once (replace the value; keep the same value in Vercel as CRON_SECRET):
--   insert into private.app_settings (key, value)
--   values ('cron_token_sha256', encode(sha256(convert_to('YOUR-LONG-RANDOM-SECRET', 'UTF8')), 'hex'))
--   on conflict (key) do update set value = excluded.value;
--
-- Who gets them: owners and managers of the workspace, unless they turned reminders off.
-- When (in the workspace's time zone):
--   rent cheque still unpaid: 7 days before, on the day, and 3 days after the due date
--   free trial: 3 days before it ends, and on the day it ends

create table private.app_settings (
  key text primary key,
  value text not null
);
create table private.reminder_log (
  reminder_key text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  sent_at timestamptz not null default now()
);
revoke all on private.app_settings from public, anon, authenticated;
revoke all on private.reminder_log from public, anon, authenticated;

create or replace function private.cron_token_ok(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(char_length(p_token) >= 32, false) and exists (
    select 1 from private.app_settings
    where key = 'cron_token_sha256'
      and value = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  );
$$;
revoke all on function private.cron_token_ok(text) from public, anon, authenticated;

create or replace function public.cron_reminders_due(p_token text)
returns table (reminder_key text, kind text, org_id uuid, org_name text, email text, details jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with orgs as (
    select o.id, o.name, o.status, o.trial_ends_at, o.timezone,
           (now() at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date as today
    from public.organizations o
    where o.deletion_requested_at is null
  ),
  recipients as (
    select m.org_id, lower(u.email::text) as email
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.user_preferences up on up.user_id = m.user_id and up.org_id = m.org_id
    where m.role in ('owner', 'manager')
      and u.email is not null
      and coalesce(up.prefs ->> 'emailReminders', 'true') <> 'false'
  ),
  items as (
    select
      'cheque:' || o.id || ':' || c.property_id || ':' || c.id || ':' || s.stage as item_key,
      s.stage as item_kind,
      o.id as item_org,
      jsonb_build_object(
        'property', coalesce(nullif(p.name, ''), p.id),
        'amount_aed', c.amount_aed,
        'due_date', c.due_date,
        'cheque_number', c.cheque_number,
        'status', c.status
      ) as item_details
    from orgs o
    join public.property_rent_cheques c on c.org_id = o.id
    join public.properties p on p.org_id = c.org_id and p.id = c.property_id
    cross join lateral (
      select case
        when c.due_date = o.today + 7 then 'cheque_7d'
        when c.due_date = o.today then 'cheque_today'
        when c.due_date = o.today - 3 then 'cheque_overdue'
      end as stage
    ) s
    where c.status in ('due', 'postponed', 'bounced')
      and s.stage is not null
      and coalesce(p.status, 'active') = 'active'
    union all
    select
      'trial:' || o.id || ':' || s.stage,
      s.stage,
      o.id,
      jsonb_build_object('trial_ends_on', (o.trial_ends_at at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date)
    from orgs o
    cross join lateral (
      select case
        when (o.trial_ends_at at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date = o.today + 3 then 'trial_3d'
        when (o.trial_ends_at at time zone coalesce(nullif(o.timezone, ''), 'UTC'))::date = o.today then 'trial_today'
      end as stage
    ) s
    where o.status = 'trialing' and o.trial_ends_at is not null and s.stage is not null
  )
  select
    i.item_key || '|' || md5(r.email),
    i.item_kind,
    i.item_org,
    o.name,
    r.email,
    i.item_details
  from items i
  join orgs o on o.id = i.item_org
  join recipients r on r.org_id = i.item_org
  where not exists (
    select 1 from private.reminder_log l where l.reminder_key = i.item_key || '|' || md5(r.email)
  )
  order by i.item_org, r.email, i.item_kind
  limit 2000;
end $$;

create or replace function public.cron_mark_reminders_sent(p_token text, p_keys text[])
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into private.reminder_log (reminder_key, org_id)
  select k, split_part(k, ':', 2)::uuid
  from unnest(p_keys[1:2000]) as k
  where k ~ '^(cheque|trial):[0-9a-f-]{36}:'
    and exists (select 1 from public.organizations o where o.id = split_part(k, ':', 2)::uuid)
  on conflict (reminder_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- The daily job calls these with the publishable key (anon); the token is the real check.
revoke all on function public.cron_reminders_due(text) from public;
revoke all on function public.cron_mark_reminders_sent(text, text[]) from public;
grant execute on function public.cron_reminders_due(text) to anon, authenticated;
grant execute on function public.cron_mark_reminders_sent(text, text[]) to anon, authenticated;
