-- Tests for 20261113071230_reminder_emails.sql. Rolled back.
begin;
create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAILED: %', msg; end if; end $$;
create function tests.denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FAILED (was allowed): %', msg;
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

insert into private.app_settings values ('cron_token_sha256', encode(sha256(convert_to('a-long-random-test-token-0123456789abcdef', 'UTF8')), 'hex'));

insert into auth.users (id, email, raw_user_meta_data) values
  ('d3000000-0000-0000-0000-00000000000a', 'Owner@Example.test', '{"company_name": "Reminder Co"}'),
  ('d3000000-0000-0000-0000-00000000000b', 'manager@example.test', '{"company_name": "M"}'),
  ('d3000000-0000-0000-0000-00000000000c', 'viewer@example.test', '{"company_name": "V"}'),
  ('d3000000-0000-0000-0000-00000000000d', 'optout@example.test', '{"company_name": "O"}');
create temp table ids as select (select org_id from public.memberships where user_id = 'd3000000-0000-0000-0000-00000000000a') as org;
grant select on ids to anon, authenticated;
insert into public.memberships (org_id, user_id, role) select org, 'd3000000-0000-0000-0000-00000000000b'::uuid, 'manager'::public.member_role from ids
  union all select org, 'd3000000-0000-0000-0000-00000000000c'::uuid, 'viewer'::public.member_role from ids
  union all select org, 'd3000000-0000-0000-0000-00000000000d'::uuid, 'manager'::public.member_role from ids;
insert into public.user_preferences (user_id, org_id, prefs) select 'd3000000-0000-0000-0000-00000000000d', org, '{"emailReminders": false}' from ids;

-- Workspace in Dubai time; trial ends in 3 days
update public.organizations set timezone = 'Asia/Dubai', status = 'trialing',
  trial_ends_at = ((now() at time zone 'Asia/Dubai')::date + 3)::timestamp at time zone 'Asia/Dubai' + interval '12 hours'
  where id = (select org from ids);
create temp table d as select (now() at time zone 'Asia/Dubai')::date as today;
grant select on d to anon, authenticated;

insert into public.properties (org_id, id, name, status) select org, 'p1', 'Marina 1BR', 'active' from ids;
insert into public.properties (org_id, id, name, status) select org, 'p2', 'Old unit', 'terminated' from ids;
insert into public.property_rent_cheques (org_id, property_id, id, cheque_number, due_date, amount, status)
  select org, 'p1', 'c7', '0001', (select today + 7 from d), 27500, 'due' from ids
  union all select org, 'p1', 'c0', '0002', (select today from d), 27500, 'due' from ids
  union all select org, 'p1', 'c3', '0003', (select today - 3 from d), 27500, 'bounced' from ids
  union all select org, 'p1', 'cp', '0004', (select today + 7 from d), 27500, 'paid' from ids
  union all select org, 'p1', 'c5', '0005', (select today + 5 from d), 27500, 'due' from ids
  union all select org, 'p2', 'cx', '0006', (select today + 7 from d), 27500, 'due' from ids;

-- Without the right token, nothing is returned or recorded
set local role anon;
select tests.denied($q$select * from public.cron_reminders_due('wrong-token-wrong-token-wrong-token-xx')$q$, 'wrong token reads reminders');
select tests.denied($q$select * from public.cron_reminders_due(null)$q$, 'no token');
select tests.denied($q$select public.cron_mark_reminders_sent('short', array['x'])$q$, 'wrong token marks sent');
select tests.denied($q$select * from private.reminder_log$q$, 'reading the log directly');

create temp table due as select * from public.cron_reminders_due('a-long-random-test-token-0123456789abcdef');
reset role;

-- 3 cheque stages + trial_3d, for owner and the opted-in manager only (2 recipients)
select tests.ok((select count(*) from due) = 8, 'expected 4 reminders x 2 recipients, got ' || (select count(*) from due));
select tests.ok((select array_agg(distinct kind order by kind) from due) = array['cheque_7d', 'cheque_overdue', 'cheque_today', 'trial_3d'], 'kinds');
select tests.ok((select array_agg(distinct email order by email) from due) = array['manager@example.test', 'owner@example.test'], 'recipients: owner and opted-in manager, lower-cased');
select tests.ok(not exists (select 1 from due where details->>'property' = 'Old unit'), 'terminated units are skipped');
select tests.ok(not exists (select 1 from due where details->>'cheque_number' in ('0004', '0005')), 'paid cheques and other dates are skipped');

-- Marking sent stops repeats; only well-formed keys for real workspaces are stored
set local role anon;
select tests.ok(public.cron_mark_reminders_sent('a-long-random-test-token-0123456789abcdef',
  (select array_agg(reminder_key) from due where email = 'owner@example.test') || array['not-a-key', 'trial:00000000-0000-0000-0000-000000000000:trial_3d|x']) = 4, 'four marked');
select tests.ok((select count(*) from public.cron_reminders_due('a-long-random-test-token-0123456789abcdef')) = 4, 'only the manager''s four remain');
reset role;

-- Signed-in users cannot call the job's functions at all
select tests.ok(not has_function_privilege('authenticated', 'public.cron_reminders_due(text)', 'execute'), 'signed-in users cannot read reminders');

-- A workspace being deleted gets no reminders
update public.organizations set deletion_requested_at = now() where id = (select org from ids);
set local role anon;
select tests.ok((select count(*) from public.cron_reminders_due('a-long-random-test-token-0123456789abcdef')) = 0, 'no reminders during deletion hold');
reset role;
rollback;
