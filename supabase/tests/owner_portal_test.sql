-- Tests for 20261124212913_owner_reports_and_portal.sql and 20261124214402_owner_report_itemised_costs.sql. One transaction, rolled back.
begin;

create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAILED: %', msg; end if; end $$;
create function tests.denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FAILED (was allowed): %', msg;
end $$;
create function tests.login(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true); end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

insert into private.app_settings values ('cron_token_sha256', encode(sha256(convert_to('a-long-random-test-token-0123456789abcdef', 'UTF8')), 'hex'))
  on conflict (key) do update set value = excluded.value;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d6000000-0000-0000-0000-00000000000a', 'portal-owner@example.test', '{"company_name": "Portal Co"}'),
  ('d6000000-0000-0000-0000-00000000000b', 'portal-staff@example.test', '{"company_name": "Portal S"}'),
  ('d6000000-0000-0000-0000-00000000000e', 'emma@example.test',         '{"company_name": "Emma own"}');
create temp table ids as select
  (select org_id from public.memberships where user_id = 'd6000000-0000-0000-0000-00000000000a') as org_a;
grant select on ids to authenticated, anon;
insert into public.memberships (org_id, user_id, role)
  select org_a, 'd6000000-0000-0000-0000-00000000000b'::uuid, 'staff'::public.member_role from ids;

-- Owner sets up a property, two owners and their shares.
select tests.login('d6000000-0000-0000-0000-00000000000a');
set local role authenticated;
insert into public.properties (org_id, id, name, currency) select org_a, 'MIA', 'Miami condo', 'USD' from ids;
insert into public.reservations (org_id, id, apartment_id, guest_name, check_in, check_out, net_payout)
  select org_a, 'R1', 'MIA', 'Secret Guest', '2026-10-01', '2026-10-05', 400 from ids;
insert into public.vendors (org_id, id, name, phone, email) select org_a, 'V1', 'Cool Air LLC', '+1 555 0100', 'vendor-secret@example.test' from ids;
insert into public.service_records (org_id, id, apartment_id, date, vendor_id, service_type, description, total_cost)
  select org_a, 'S1', 'MIA', '2026-10-03', 'V1', 'HVAC', 'Filter change', 80 from ids;
insert into public.daily_expenses (org_id, id, apartment_id, date, category, amount, notes)
  select org_a, 'E1', 'MIA', '2026-10-04', 'Repairs', 120, 'Door handle' from ids;
insert into public.entities (org_id, id, name, kind, report_email)
  select org_a, 'f6000000-0000-0000-0000-000000000001', 'Emma Clarke', 'individual', 'emma@example.test' from ids;
insert into public.entities (org_id, id, name, kind)
  select org_a, 'f6000000-0000-0000-0000-000000000002', 'Other Owner', 'company' from ids;
select public.set_listing_shares((select org_a from ids), 'MIA', '2026-01-01',
  '[{"entity_id": "f6000000-0000-0000-0000-000000000001", "share": 40}, {"entity_id": "f6000000-0000-0000-0000-000000000002", "share": 60}]');

-- Invitations: owners and managers only.
insert into public.owner_invitations (org_id, id, entity_id, email)
  select org_a, 'a6000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 'emma@example.test' from ids;
insert into public.owner_invitations (org_id, id, entity_id, email)
  select org_a, 'a6000000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000001', 'new-owner@example.test' from ids;
insert into public.owner_invitations (org_id, id, entity_id, email, expires_at)
  select org_a, 'a6000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000001', 'late@example.test', now() - interval '1 day' from ids;
select tests.denied($$insert into public.owner_invitations (org_id, entity_id, email, expires_at)
  select org_a, 'f6000000-0000-0000-0000-000000000001', 'x@example.test', now() + interval '90 days' from ids$$, 'invitation valid for more than 30 days');
reset role;

select tests.login('d6000000-0000-0000-0000-00000000000b');
set local role authenticated;
select tests.denied($$insert into public.owner_invitations (org_id, entity_id, email) select org_a, 'f6000000-0000-0000-0000-000000000001', 'y@example.test' from ids$$,
  'staff cannot invite owners');
select tests.ok((select count(*) from public.owner_invitations) = 0, 'staff cannot see owner invitations');
reset role;

-- The job prepares statements.
set local role anon;
select tests.denied($$select public.cron_owner_report_data('wrong-token-wrong-token-wrong-token-xx')$$, 'job data with a wrong token');
select tests.ok(jsonb_array_length(public.cron_owner_report_data('a-long-random-test-token-0123456789abcdef') -> 'workspaces') >= 1, 'job sees workspaces with ownership');
select tests.ok(public.cron_owner_report_data('a-long-random-test-token-0123456789abcdef')::text not like '%Secret Guest%', 'guest names never leave the database');
create temp table jobws as select w from jsonb_array_elements(public.cron_owner_report_data('a-long-random-test-token-0123456789abcdef') -> 'workspaces') w
  where w ->> 'org_id' = (select org_a::text from ids);
select tests.ok((select jsonb_array_length(w -> 'service_records') from jobws) = 1, 'job sees vendor work on units');
select tests.ok((select w -> 'vendors' -> 0 ->> 'name' from jobws) = 'Cool Air LLC', 'job sees vendor names');
select tests.ok((select (w -> 'vendors')::text from jobws) not like '%vendor-secret%' and (select (w -> 'vendors')::text from jobws) not like '%555%', 'vendor phone and email stay in the database');
select tests.ok((select w -> 'daily_expenses' -> 0 ->> 'notes' from jobws) = 'Door handle', 'expense notes reach the statement');

create temp table stored as
select * from public.cron_store_owner_statements('a-long-random-test-token-0123456789abcdef', jsonb_build_array(
  jsonb_build_object('org_id', (select org_a from ids), 'entity_id', 'f6000000-0000-0000-0000-000000000001', 'kind', 'monthly',
    'period_start', '2026-10-01', 'period_end', '2026-10-31', 'currency', 'USD', 'total', 160, 'statement', '{"lines": []}'::jsonb),
  jsonb_build_object('org_id', (select org_a from ids), 'entity_id', 'f6000000-0000-0000-0000-000000000002', 'kind', 'monthly',
    'period_start', '2026-10-01', 'period_end', '2026-10-31', 'currency', 'USD', 'total', 240, 'statement', '{"lines": []}'::jsonb),
  jsonb_build_object('org_id', (select org_a from ids), 'entity_id', 'f6000000-0000-0000-0000-000000000001', 'kind', 'month_to_date',
    'period_start', '2026-11-01', 'period_end', '2026-11-10', 'currency', 'USD', 'total', 10, 'statement', '{"lines": []}'::jsonb)));
select tests.ok((select count(*) from stored) = 3, 'three statements saved');
-- Again: the monthly ones are kept as they were; month-to-date is refreshed.
select tests.ok((select count(*) from public.cron_store_owner_statements('a-long-random-test-token-0123456789abcdef', jsonb_build_array(
  jsonb_build_object('org_id', (select org_a from ids), 'entity_id', 'f6000000-0000-0000-0000-000000000001', 'kind', 'monthly',
    'period_start', '2026-10-01', 'period_end', '2026-10-31', 'currency', 'USD', 'total', 999, 'statement', '{}'::jsonb),
  jsonb_build_object('org_id', (select org_a from ids), 'entity_id', 'f6000000-0000-0000-0000-000000000001', 'kind', 'month_to_date',
    'period_start', '2026-11-01', 'period_end', '2026-11-20', 'currency', 'USD', 'total', 55, 'statement', '{}'::jsonb)))
  where kind = 'monthly') = 0, 'a prepared monthly statement is not saved twice');
select public.cron_mark_statement_emailed('a-long-random-test-token-0123456789abcdef', (select org_a from ids),
  (select id from stored where kind = 'monthly' and entity_id = 'f6000000-0000-0000-0000-000000000001'), 'sent');
reset role;
select tests.ok((select total from public.owner_statements where kind = 'monthly' and entity_id = 'f6000000-0000-0000-0000-000000000001') = 160, 'monthly statement unchanged');
select tests.ok((select total from public.owner_statements where kind = 'month_to_date') = 55, 'month-to-date refreshed');
select tests.ok((select emailed_at is not null from public.owner_statements where kind = 'monthly' and entity_id = 'f6000000-0000-0000-0000-000000000001'), 'email recorded');

-- An existing user accepts; a stranger's account cannot; an expired invite cannot.
select tests.login('d6000000-0000-0000-0000-00000000000b');
set local role authenticated;
select tests.denied($$select public.accept_owner_invitation((select token from public.owner_invitations where id = 'a6000000-0000-0000-0000-000000000001'))$$,
  'an invitation for another email');
reset role;
select tests.login('d6000000-0000-0000-0000-00000000000e');
set local role authenticated;
select tests.denied($$select public.accept_owner_invitation('00000000-0000-0000-0000-000000000000')$$, 'an unknown invitation');
reset role;
create temp table tok as select token, id from public.owner_invitations;
grant select on tok to authenticated;
select tests.login('d6000000-0000-0000-0000-00000000000e');
set local role authenticated;
select tests.ok(public.accept_owner_invitation((select token from tok where id = 'a6000000-0000-0000-0000-000000000001')) = (select org_a from ids), 'invited owner accepts');
select tests.ok(public.accept_owner_invitation((select token from tok where id = 'a6000000-0000-0000-0000-000000000001')) = (select org_a from ids), 'accepting twice is harmless');

-- What the owner can see: their own statements, and nothing else.
select tests.ok((select count(*) from public.my_owner_portals()) = 1, 'one portal');
select tests.ok((select entity_name from public.my_owner_portals()) = 'Emma Clarke', 'portal for their owner');
select tests.ok((select count(*) from public.owner_statements) = 2, 'their monthly and month-to-date statements');
select tests.ok(not exists (select 1 from public.owner_statements where entity_id = 'f6000000-0000-0000-0000-000000000002'), 'not the other owner''s statement');
select tests.ok((select count(*) from public.reservations where org_id = (select org_a from ids)) = 0, 'no bookings');
select tests.ok((select count(*) from public.properties where org_id = (select org_a from ids)) = 0, 'no properties');
select tests.ok((select count(*) from public.entities where org_id = (select org_a from ids)) = 0, 'no owner records');
select tests.ok((select count(*) from public.listing_shares where org_id = (select org_a from ids)) = 0, 'no share records');
select tests.ok((select count(*) from public.memberships where org_id = (select org_a from ids)) = 0, 'not a team member');
delete from public.owner_statements;
select tests.ok((select count(*) from public.owner_statements) = 2, 'statements still there');
select tests.denied($$insert into public.owner_logins (org_id, entity_id, user_id) select org_a, 'f6000000-0000-0000-0000-000000000002', 'd6000000-0000-0000-0000-00000000000e' from ids$$,
  'owner cannot give themselves another owner''s statements');
reset role;

-- A new account made from an owner invitation gets the login and no workspace of its own.
insert into auth.users (id, email, raw_user_meta_data)
  select 'd6000000-0000-0000-0000-00000000000f', 'new-owner@example.test',
         jsonb_build_object('full_name', 'New Owner', 'owner_invite_token', (select token from tok where id = 'a6000000-0000-0000-0000-000000000002'));
select tests.ok(exists (select 1 from public.owner_logins where user_id = 'd6000000-0000-0000-0000-00000000000f'), 'new account linked as owner');
select tests.ok(not exists (select 1 from public.memberships where user_id = 'd6000000-0000-0000-0000-00000000000f'), 'no workspace created for the owner');
-- An expired invitation at sign-up falls back to the normal new workspace.
insert into auth.users (id, email, raw_user_meta_data)
  select 'd6000000-0000-0000-0000-000000000010', 'late@example.test',
         jsonb_build_object('owner_invite_token', (select token from tok where id = 'a6000000-0000-0000-0000-000000000003'));
select tests.ok(not exists (select 1 from public.owner_logins where user_id = 'd6000000-0000-0000-0000-000000000010'), 'expired invitation not linked');
select tests.ok(exists (select 1 from public.memberships where user_id = 'd6000000-0000-0000-0000-000000000010' and role = 'owner'), 'their own workspace instead');
-- A malformed token at sign-up does not break sign-up.
insert into auth.users (id, email, raw_user_meta_data)
  values ('d6000000-0000-0000-0000-000000000011', 'odd@example.test', '{"owner_invite_token": "not-a-uuid"}');
select tests.ok(exists (select 1 from public.memberships where user_id = 'd6000000-0000-0000-0000-000000000011'), 'malformed token ignored');

-- Staff never see statements; the workspace owner sees all and can remove a login.
select tests.login('d6000000-0000-0000-0000-00000000000b');
set local role authenticated;
select tests.ok((select count(*) from public.owner_statements) = 0, 'staff cannot see statements');
select tests.ok((select count(*) from public.owner_logins) = 0, 'staff cannot see owner logins');
reset role;
select tests.login('d6000000-0000-0000-0000-00000000000a');
set local role authenticated;
select tests.ok((select count(*) from public.owner_statements) = 3, 'workspace owner sees every statement');
delete from public.owner_logins where user_id = 'd6000000-0000-0000-0000-00000000000e';
reset role;
select tests.login('d6000000-0000-0000-0000-00000000000e');
set local role authenticated;
select tests.ok((select count(*) from public.owner_statements) = 0, 'access ends when the login is removed');
select tests.ok((select count(*) from public.my_owner_portals()) = 0, 'no portal any more');
reset role;

rollback;
