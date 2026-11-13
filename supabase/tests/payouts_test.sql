-- Policy tests for 20261109194012_payouts_and_booking_documents.sql and
-- 20261109193823_account_deletion_keeps_workspace.sql. Runs in one transaction, rolled back.
begin;

create schema tests;
create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', msg; end if;
end $$;
create function tests.denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'FAILED (was allowed): %', msg;
end $$;
create function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000a', 'owner@example.test',    '{"company_name": "Org A"}'),
  ('d0000000-0000-0000-0000-00000000000b', 'staff@example.test',    '{"company_name": "Org S"}'),
  ('d0000000-0000-0000-0000-00000000000c', 'viewer@example.test',   '{"company_name": "Org V"}'),
  ('d0000000-0000-0000-0000-00000000000d', 'stranger@example.test', '{"company_name": "Org X"}');

create temp table ids as select
  (select org_id from public.memberships where user_id = 'd0000000-0000-0000-0000-00000000000a') as org_a,
  (select org_id from public.memberships where user_id = 'd0000000-0000-0000-0000-00000000000d') as org_x;
grant select on ids to authenticated, anon;

insert into public.memberships (org_id, user_id, role)
  select org_a, 'd0000000-0000-0000-0000-00000000000b'::uuid, 'staff'::public.member_role from ids
  union all select org_a, 'd0000000-0000-0000-0000-00000000000c'::uuid, 'viewer'::public.member_role from ids;

-- ---------------------------------------------------------------------------
-- Owner records a booking, its PDF, a payout and the match
-- ---------------------------------------------------------------------------
select tests.login('d0000000-0000-0000-0000-00000000000a');
set local role authenticated;
insert into storage.objects (bucket_id, name) select 'workspace-files', org_a || '/bookings/a.pdf' from ids;
insert into storage.objects (bucket_id, name) select 'workspace-files', org_a || '/finance/statement.pdf' from ids;
select tests.denied(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'workspace-files', (select org_x from ids) || '/bookings/x.pdf'), 'owner uploads into another workspace');
select tests.denied(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'workspace-files', (select org_a from ids) || '/elsewhere/x.pdf'), 'upload outside the allowed folders');

insert into public.source_documents (org_id, id, kind, file_path, file_name)
  select org_a, 'e0000000-0000-0000-0000-000000000001', 'bookings', org_a || '/bookings/a.pdf', 'a.pdf' from ids;
select tests.denied(format('insert into public.source_documents (org_id, kind, file_path, file_name) values (%L, %L, %L, %L)',
  (select org_a from ids), 'bank_statement', (select org_a from ids) || '/bookings/s.pdf', 's.pdf'), 'bank statement filed in the bookings folder');
select tests.denied(format('insert into public.source_documents (org_id, kind, file_path, file_name) values (%L, %L, %L, %L)',
  (select org_a from ids), 'bookings', (select org_x from ids) || '/bookings/a.pdf', 'a.pdf'), 'document path pointing at another workspace');

insert into public.reservations (org_id, id, status, net_payout, source_document_id)
  select org_a, 'R1', 'confirmed', 1000, 'e0000000-0000-0000-0000-000000000001' from ids;
insert into public.reservations (org_id, id, status, net_payout) select org_a, 'R2', 'confirmed', 500 from ids;
insert into public.payouts (org_id, id, received_date, amount, source)
  select org_a, 'f0000000-0000-0000-0000-000000000001', '2026-11-01', 1450, 'manual' from ids;
insert into public.payout_allocations (org_id, payout_id, reservation_id, amount)
  select org_a, 'f0000000-0000-0000-0000-000000000001', 'R1', 980 from ids;
select tests.denied(format('insert into public.payout_allocations (org_id, payout_id, reservation_id, amount) values (%L, %L, %L, 600)',
  (select org_a from ids), 'f0000000-0000-0000-0000-000000000001', 'R2'), 'allocating more than the payout amount');
insert into public.payout_allocations (org_id, payout_id, reservation_id, amount)
  select org_a, 'f0000000-0000-0000-0000-000000000001', 'R2', 470 from ids;
insert into public.payout_adjustments (org_id, reservation_id, amount, reason, resolution)
  select org_a, 'R1', -20, 'payment_fee', 'accepted' from ids;
select tests.denied(format('insert into public.payout_adjustments (org_id, reservation_id, amount, reason) values (%L, %L, -5, %L)',
  (select org_a from ids), 'R2', 'made_up_reason'), 'unknown difference reason');
select tests.denied(format('update public.payouts set org_id = %L', (select org_x from ids)), 'moving a payout to another workspace');
select public.consume_ai_quota((select org_a from ids), 'document');
-- Ordinary edits still work, and the creator cannot be rewritten.
update public.payouts set notes = 'checked', created_by = 'd0000000-0000-0000-0000-00000000000d' where id = 'f0000000-0000-0000-0000-000000000001';
update public.reservations set guest_name = 'Edited' where id = 'R2';
reset role;
select tests.ok((select notes = 'checked' and created_by = 'd0000000-0000-0000-0000-00000000000a' from public.payouts where id = 'f0000000-0000-0000-0000-000000000001'),
  'payout edit saved, creator unchanged');
select tests.login('d0000000-0000-0000-0000-00000000000a');
set local role authenticated;
select tests.ok((select count(*) from public.payout_allocations) = 2, 'owner sees both matches');
reset role;

-- ---------------------------------------------------------------------------
-- Staff: booking PDFs yes, finance no
-- ---------------------------------------------------------------------------
select tests.login('d0000000-0000-0000-0000-00000000000b');
set local role authenticated;
insert into storage.objects (bucket_id, name) select 'workspace-files', org_a || '/bookings/b.pdf' from ids;
insert into public.source_documents (org_id, kind, file_path, file_name) select org_a, 'bookings', org_a || '/bookings/b.pdf', 'b.pdf' from ids;
select tests.denied(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'workspace-files', (select org_a from ids) || '/finance/s.pdf'), 'staff uploads a bank statement');
select tests.denied(format('insert into public.source_documents (org_id, kind, file_path, file_name) values (%L, %L, %L, %L)',
  (select org_a from ids), 'bank_statement', (select org_a from ids) || '/finance/s.pdf', 's.pdf'), 'staff files a bank statement');
select tests.ok((select count(*) from storage.objects where name like '%/finance/%') = 0, 'staff cannot see finance files');
select tests.ok((select count(*) from public.payouts) = 0, 'staff cannot see payouts');
select tests.ok((select count(*) from public.payout_adjustments) = 0, 'staff cannot see adjustments');
select tests.denied(format('insert into public.payouts (org_id, received_date, amount, source) values (%L, %L, 10, %L)',
  (select org_a from ids), '2026-11-02', 'manual'), 'staff records a payout');
delete from storage.objects where name like '%/bookings/a.pdf';
reset role;
select tests.ok((select count(*) from storage.objects where name like '%/bookings/a.pdf') = 1, 'staff cannot delete stored files');

-- ---------------------------------------------------------------------------
-- Viewer: reads booking PDFs, nothing else
-- ---------------------------------------------------------------------------
select tests.login('d0000000-0000-0000-0000-00000000000c');
set local role authenticated;
select tests.ok((select count(*) from storage.objects where name like '%/bookings/%') = 2, 'viewer reads booking files');
select tests.ok((select count(*) from storage.objects where name like '%/finance/%') = 0, 'viewer cannot read finance files');
select tests.ok((select count(*) from public.source_documents where kind = 'bookings') = 2, 'viewer sees booking documents');
select tests.denied(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'workspace-files', (select org_a from ids) || '/bookings/v.pdf'), 'viewer uploads');
reset role;

-- ---------------------------------------------------------------------------
-- Stranger: sees and touches nothing of workspace A
-- ---------------------------------------------------------------------------
select tests.login('d0000000-0000-0000-0000-00000000000d');
set local role authenticated;
select tests.ok((select count(*) from storage.objects) = 0, 'stranger sees no files');
select tests.ok((select count(*) from public.source_documents) = 0, 'stranger sees no documents');
select tests.ok((select count(*) from public.payouts) = 0, 'stranger sees no payouts');
select tests.denied(format('insert into public.payout_allocations (org_id, payout_id, reservation_id, amount) values (%L, %L, %L, 1)',
  (select org_a from ids), 'f0000000-0000-0000-0000-000000000001', 'R1'), 'stranger links a payout');
select tests.denied(format('select public.consume_ai_quota(%L, %L)', (select org_a from ids), 'document'), 'stranger uses workspace AI quota');
reset role;

-- ---------------------------------------------------------------------------
-- Read-only workspace: no new files or payouts
-- ---------------------------------------------------------------------------
update public.organizations set status = 'read_only' where id = (select org_a from ids);
select tests.login('d0000000-0000-0000-0000-00000000000a');
set local role authenticated;
select tests.denied(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'workspace-files', (select org_a from ids) || '/bookings/late.pdf'), 'upload to read-only workspace');
select tests.denied(format('insert into public.payouts (org_id, received_date, amount, source) values (%L, %L, 10, %L)',
  (select org_a from ids), '2026-11-03', 'manual'), 'payout in read-only workspace');
reset role;
update public.organizations set status = 'active' where id = (select org_a from ids);

-- ---------------------------------------------------------------------------
-- Account deletion: the last owner's account can be deleted
-- ---------------------------------------------------------------------------
delete from auth.users where id = 'd0000000-0000-0000-0000-00000000000a';
select tests.ok((select role from public.memberships where user_id = 'd0000000-0000-0000-0000-00000000000b' and org_id = (select org_a from ids)) = 'owner',
  'longest-standing remaining member becomes owner');
delete from auth.users where id = 'd0000000-0000-0000-0000-00000000000d';
select tests.ok(exists (select 1 from public.organizations where id = (select org_x from ids)), 'sole owner leaving keeps the workspace and its data');
-- Removing an owner whose account still exists is still refused.
select tests.denied(format('delete from public.memberships where user_id = %L', 'd0000000-0000-0000-0000-00000000000b'), 'removing the only owner while their account exists');

rollback;
