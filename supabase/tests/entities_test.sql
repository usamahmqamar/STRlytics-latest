-- Tests for 20261116063619_entities_and_ownership.sql. One transaction, rolled back.
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('d5000000-0000-0000-0000-00000000000a', 'own-owner@example.test',    '{"company_name": "Own A"}'),
  ('d5000000-0000-0000-0000-00000000000b', 'own-staff@example.test',    '{"company_name": "Own S"}'),
  ('d5000000-0000-0000-0000-00000000000c', 'own-manager@example.test',  '{"company_name": "Own M"}'),
  ('d5000000-0000-0000-0000-00000000000d', 'own-stranger@example.test', '{"company_name": "Own X"}');
create temp table ids as select
  (select org_id from public.memberships where user_id = 'd5000000-0000-0000-0000-00000000000a') as org_a,
  (select org_id from public.memberships where user_id = 'd5000000-0000-0000-0000-00000000000d') as org_x;
grant select on ids to authenticated, anon;
insert into public.memberships (org_id, user_id, role)
  select org_a, 'd5000000-0000-0000-0000-00000000000b'::uuid, 'staff'::public.member_role from ids
  union all select org_a, 'd5000000-0000-0000-0000-00000000000c'::uuid, 'manager'::public.member_role from ids;
update public.organizations set base_currency = 'AED' where id = (select org_a from ids);

-- ---------------------------------------------------------------------------
-- Entities
-- ---------------------------------------------------------------------------
select tests.login('d5000000-0000-0000-0000-00000000000a');
set local role authenticated;
insert into public.properties (org_id, id, name, currency) select org_a, 'MIA', 'Miami condo', 'USD' from ids;
insert into public.properties (org_id, id, name) select org_a, 'DXB', 'Marina 1BR' from ids;

insert into public.entities (org_id, id, name, kind, tax_country, report_email)
  select org_a, 'f5000000-0000-0000-0000-000000000001', 'XYZ Rentals LLC', 'company', 'US', 'books@xyz.test' from ids;
insert into public.entities (org_id, id, name, kind, tax_country, reporting_currency)
  select org_a, 'f5000000-0000-0000-0000-000000000002', 'Partner A', 'individual', 'US', 'USD' from ids;
insert into public.entities (org_id, id, name, kind, tax_country)
  select org_a, 'f5000000-0000-0000-0000-000000000003', 'Partner B', 'individual', 'IN' from ids;
select tests.ok((select reporting_currency from public.entities where id = 'f5000000-0000-0000-0000-000000000001') = 'AED',
  'an entity without a reporting currency uses the workspace currency');
select tests.ok((select report_frequency from public.entities where id = 'f5000000-0000-0000-0000-000000000001') = 'monthly',
  'reports are monthly by default');
select tests.denied($$insert into public.entities (org_id, name, kind) select org_a, 'xyz rentals llc', 'company' from ids$$, 'duplicate entity name');
select tests.denied($$insert into public.entities (org_id, name, kind, report_email) select org_a, 'Bad', 'individual', 'not-an-email' from ids$$, 'malformed report email');
select tests.denied($$insert into public.entities (org_id, name, kind) select org_x, 'Theirs', 'company' from ids$$, 'entity in another workspace');

-- Opting out of reports needs evidence, and that evidence must be an owner letter.
select tests.denied($$update public.entities set reports_opted_out_at = now() where id = 'f5000000-0000-0000-0000-000000000002'$$,
  'opt-out without evidence');
insert into public.source_documents (org_id, id, kind, file_path, file_name)
  select org_a, 'e5000000-0000-0000-0000-000000000001', 'owner_letter', org_a || '/finance/letter.pdf', 'letter.pdf' from ids;
insert into public.source_documents (org_id, id, kind, file_path, file_name)
  select org_a, 'e5000000-0000-0000-0000-000000000002', 'bookings', org_a || '/bookings/b.pdf', 'b.pdf' from ids;
select tests.denied($$update public.entities set reports_opted_out_at = now(), opt_out_document_id = 'e5000000-0000-0000-0000-000000000002' where id = 'f5000000-0000-0000-0000-000000000002'$$,
  'a booking PDF is not evidence of an opt-out');
update public.entities set reports_opted_out_at = now(), opt_out_document_id = 'e5000000-0000-0000-0000-000000000001'
  where id = 'f5000000-0000-0000-0000-000000000002';
update public.entities set reports_opted_out_at = now(), opt_out_note = 'Email of 14 Nov: please stop the monthly reports.'
  where id = 'f5000000-0000-0000-0000-000000000003';
select tests.ok((select count(*) from public.entities where reports_opted_out_at is not null) = 2, 'opt-outs recorded with evidence');
update public.entities set reports_opted_out_at = null where id = 'f5000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- Shares
-- ---------------------------------------------------------------------------
select tests.denied($$insert into public.listing_shares (org_id, property_id, entity_id, effective_from, share)
  select org_a, 'MIA', 'f5000000-0000-0000-0000-000000000001', '2026-01-01', 100 from ids$$, 'shares cannot be written directly');
select tests.denied($$select public.set_listing_shares((select org_a from ids), 'MIA', '2026-01-01',
  '[{"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 60}, {"entity_id": "f5000000-0000-0000-0000-000000000002", "share": 30}]')$$,
  'shares that add up to 90');
select tests.denied($$select public.set_listing_shares((select org_a from ids), 'MIA', '2026-01-01',
  '[{"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 50}, {"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 50}]')$$,
  'the same owner twice');
select tests.denied($$select public.set_listing_shares((select org_a from ids), 'MIA', '2026-01-01',
  '[{"entity_id": "f5000000-0000-0000-0000-0000000000ff", "share": 100}]')$$, 'unknown owner');
select tests.denied($$select public.set_listing_shares((select org_a from ids), 'NOPE', '2026-01-01',
  '[{"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 100}]')$$, 'unknown property');

select public.set_listing_shares((select org_a from ids), 'MIA', '2026-01-01',
  '[{"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 60}, {"entity_id": "f5000000-0000-0000-0000-000000000002", "share": 40}]');
select public.set_listing_shares((select org_a from ids), 'DXB', '2026-01-01',
  '[{"entity_id": "f5000000-0000-0000-0000-000000000002", "share": 50}, {"entity_id": "f5000000-0000-0000-0000-000000000003", "share": 50}]');
-- A later split keeps the earlier one as history.
select public.set_listing_shares((select org_a from ids), 'MIA', '2027-01-01',
  '[{"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 100}]');
select tests.ok((select count(*) from public.listing_shares where property_id = 'MIA') = 3, 'share history kept');
select tests.denied($$delete from public.entities where id = 'f5000000-0000-0000-0000-000000000001'$$, 'an entity that holds shares cannot be deleted');

-- ---------------------------------------------------------------------------
-- Representative: majority of today's shares approves
-- ---------------------------------------------------------------------------
select tests.denied($$select public.nominate_representative((select org_a from ids), 'MIA', 'd5000000-0000-0000-0000-00000000000b')$$,
  'staff cannot be a representative');
select tests.denied($$select public.nominate_representative((select org_a from ids), 'MIA', 'd5000000-0000-0000-0000-00000000000d')$$,
  'someone outside the workspace cannot be a representative');

create temp table nom as select public.nominate_representative((select org_a from ids), 'MIA', 'd5000000-0000-0000-0000-00000000000c') as id;
grant select on nom to authenticated;
select tests.denied($$select public.record_representative_approval((select org_a from ids), (select id from nom), 'f5000000-0000-0000-0000-000000000002', null, '  ')$$,
  'approval without evidence');
select tests.denied($$select public.record_representative_approval((select org_a from ids), (select id from nom), 'f5000000-0000-0000-0000-000000000003', null, 'yes')$$,
  'approval from someone with no share in the property');
select tests.ok(public.record_representative_approval((select org_a from ids), (select id from nom),
  'f5000000-0000-0000-0000-000000000002', null, 'Email 15 Nov: I agree.') = 'pending', '40% is not a majority');
select tests.ok(public.record_representative_approval((select org_a from ids), (select id from nom),
  'f5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', null) = 'approved', '40% + 60% approves');
select tests.ok((select status from public.representative_nominations where id = (select id from nom)) = 'approved', 'nomination approved');
select tests.denied($$select public.record_representative_approval((select org_a from ids), (select id from nom), 'f5000000-0000-0000-0000-000000000002', null, 'again')$$,
  'an approved nomination takes no more approvals');

-- 50/50: one approval is not enough, both are.
create temp table nom2 as select public.nominate_representative((select org_a from ids), 'DXB', 'd5000000-0000-0000-0000-00000000000a') as id;
grant select on nom2 to authenticated;
select tests.ok(public.record_representative_approval((select org_a from ids), (select id from nom2),
  'f5000000-0000-0000-0000-000000000002', null, 'ok') = 'pending', '50% alone is not a majority');
select tests.ok(public.record_representative_approval((select org_a from ids), (select id from nom2),
  'f5000000-0000-0000-0000-000000000003', null, 'ok') = 'approved', 'both halves approve');

-- A new representative replaces the old one once approved.
create temp table nom3 as select public.nominate_representative((select org_a from ids), 'DXB', 'd5000000-0000-0000-0000-00000000000c') as id;
grant select on nom3 to authenticated;
select public.record_representative_approval((select org_a from ids), (select id from nom3), 'f5000000-0000-0000-0000-000000000002', null, 'ok');
select public.record_representative_approval((select org_a from ids), (select id from nom3), 'f5000000-0000-0000-0000-000000000003', null, 'ok');
select tests.ok((select status from public.representative_nominations where id = (select id from nom2)) = 'replaced', 'previous representative replaced');
select tests.ok((select count(*) from public.representative_nominations where property_id = 'DXB' and status = 'approved') = 1, 'one representative per property');
select tests.denied($$insert into public.representative_nominations (org_id, property_id, nominee_user_id) select org_a, 'MIA', 'd5000000-0000-0000-0000-00000000000a' from ids$$,
  'nominations cannot be written directly');
reset role;

-- ---------------------------------------------------------------------------
-- Who can see and change it
-- ---------------------------------------------------------------------------
select tests.login('d5000000-0000-0000-0000-00000000000c');
set local role authenticated;
select tests.ok((select count(*) from public.entities) = 3, 'manager sees the entities');
select tests.ok((select count(*) from public.listing_shares) = 5, 'manager sees the shares');
reset role;

select tests.login('d5000000-0000-0000-0000-00000000000b');
set local role authenticated;
select tests.ok((select count(*) from public.entities) = 0, 'staff cannot see entities');
select tests.ok((select count(*) from public.listing_shares) = 0, 'staff cannot see shares');
select tests.ok((select count(*) from public.representative_approvals) = 0, 'staff cannot see approvals');
select tests.denied($$insert into public.entities (org_id, name, kind) select org_a, 'Staff Co', 'company' from ids$$, 'staff cannot add entities');
select tests.denied($$select public.set_listing_shares((select org_a from ids), 'MIA', '2026-06-01', '[{"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 100}]')$$,
  'staff cannot change shares');
reset role;

select tests.login('d5000000-0000-0000-0000-00000000000d');
set local role authenticated;
select tests.ok((select count(*) from public.entities) = 0, 'another workspace sees nothing');
select tests.denied($$select public.set_listing_shares((select org_a from ids), 'MIA', '2026-06-01', '[{"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 100}]')$$,
  'another workspace cannot change shares');
reset role;

-- A workspace waiting to be deleted is read-only.
update public.organizations set deletion_requested_at = now() where id = (select org_a from ids);
select tests.login('d5000000-0000-0000-0000-00000000000a');
set local role authenticated;
select tests.denied($$select public.set_listing_shares((select org_a from ids), 'MIA', '2026-06-01', '[{"entity_id": "f5000000-0000-0000-0000-000000000001", "share": 100}]')$$,
  'no ownership changes while deletion is pending');
update public.entities set name = 'Renamed' where id = 'f5000000-0000-0000-0000-000000000003';
select tests.ok((select name from public.entities where id = 'f5000000-0000-0000-0000-000000000003') = 'Partner B', 'no entity edits while deletion is pending');
reset role;

rollback;
