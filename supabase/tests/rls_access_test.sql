-- Row-level security attack tests for Staylytics.
-- Safe on any project: everything runs in one block that ends by raising, so all changes roll back.
-- Run in the Supabase SQL editor. The error message lists each check; any "FAIL" means a problem.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  org_a uuid; org_b uuid; n int; r text := '';
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (a, 'rls-test-a@example.test', 'authenticated', 'authenticated', '{"company_name":"Org A"}'),
    (b, 'rls-test-b@example.test', 'authenticated', 'authenticated', '{}');
  select org_id into org_a from public.memberships where user_id = a;
  select org_id into org_b from public.memberships where user_id = b;
  select count(*) into n from public.platforms where org_id = org_a;
  r := r || format('seed platforms=%s settings=%s | ', n, (select count(*) from public.workspace_settings where org_id = org_a));

  -- Owner A in own workspace
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.properties (org_id, id, name) values (org_a, 'p1', 'A flat');
  insert into public.property_rent_cheques (org_id, property_id, id, amount_aed, status) values (org_a, 'p1', 'c1', 1000, 'due');
  select count(*) into n from public.properties; r := r || format('A sees own=%s | ', n);
  begin update public.properties set org_id = org_b where id = 'p1'; r := r || 'FAIL moved org | ';
  exception when others then r := r || 'move org blocked | '; end;
  begin insert into public.documents (org_id, id, file_url) values (org_a, 'd1', 'javascript:alert(1)'); r := r || 'FAIL js url | ';
  exception when check_violation then r := r || 'js url blocked | '; end;
  begin insert into public.properties (org_id, id) values (org_b, 'x'); r := r || 'FAIL A wrote B | ';
  exception when others then r := r || 'A->B insert blocked | '; end;
  begin truncate public.properties; r := r || 'FAIL truncate | ';
  exception when insufficient_privilege then r := r || 'truncate blocked | '; end;
  begin perform count(*) from private.ai_usage; r := r || 'FAIL read ai_usage | ';
  exception when insufficient_privilege then r := r || 'ai_usage hidden | '; end;
  for i in 1..20 loop perform public.consume_ai_quota(org_a, 'receipt'); end loop;
  begin perform public.consume_ai_quota(org_a, 'receipt'); r := r || 'FAIL quota | ';
  exception when others then r := r || 'quota 21st blocked | '; end;
  execute 'reset role';

  -- B, a stranger to workspace A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.properties where org_id = org_a; r := r || format('B sees A=%s | ', n);
  select count(*) into n from public.property_rent_cheques where org_id = org_a; r := r || format('B sees A cheques=%s | ', n);
  update public.properties set name = 'hacked' where org_id = org_a; get diagnostics n = row_count; r := r || format('B updated A=%s | ', n);
  delete from public.properties where org_id = org_a; get diagnostics n = row_count; r := r || format('B deleted A=%s | ', n);
  begin perform public.consume_ai_quota(org_a, 'market'); r := r || 'FAIL B used A quota | ';
  exception when others then r := r || 'B->A quota blocked | '; end;
  begin perform * from public.list_team(org_a); r := r || 'FAIL B listed A team | ';
  exception when others then r := r || 'B->A team blocked | '; end;
  execute 'reset role';

  -- B as viewer of A
  insert into public.memberships (org_id, user_id, role) values (org_a, b, 'viewer');
  execute 'set local role authenticated';
  select count(*) into n from public.properties where org_id = org_a; r := r || format('viewer reads=%s | ', n);
  begin insert into public.reservations (org_id, id) values (org_a, 'r1'); r := r || 'FAIL viewer wrote | ';
  exception when others then r := r || 'viewer write blocked | '; end;
  execute 'reset role';

  -- B as staff of A
  update public.memberships set role = 'staff' where org_id = org_a and user_id = b;
  execute 'set local role authenticated';
  insert into public.reservations (org_id, id, status) values (org_a, 'r1', 'confirmed'); r := r || 'staff wrote reservation | ';
  begin insert into public.properties (org_id, id) values (org_a, 'p2'); r := r || 'FAIL staff wrote property | ';
  exception when others then r := r || 'staff property blocked | '; end;
  delete from public.properties where org_id = org_a; get diagnostics n = row_count; r := r || format('staff deleted props=%s | ', n);
  begin insert into public.vendor_payments (org_id, id, amount_paid) values (org_a, 'pay1', 5); r := r || 'FAIL staff wrote payment | ';
  exception when others then r := r || 'staff payment blocked | '; end;
  execute 'reset role';

  -- Read-only workspace, then trial expiry with 5-day grace
  update public.organizations set status = 'read_only' where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.reservations (org_id, id) values (org_a, 'r2'); r := r || 'FAIL read_only write | ';
  exception when others then r := r || 'read_only blocked | '; end;
  select count(*) into n from public.properties where org_id = org_a; r := r || format('read_only still reads=%s | ', n);
  execute 'reset role';
  update public.organizations set status = 'trialing', trial_ends_at = now() - interval '3 days' where id = org_a;
  execute 'set local role authenticated';
  insert into public.reservations (org_id, id) values (org_a, 'r3'); r := r || 'grace day3 write ok | ';
  execute 'reset role';
  update public.organizations set trial_ends_at = now() - interval '6 days' where id = org_a;
  execute 'set local role authenticated';
  begin insert into public.reservations (org_id, id) values (org_a, 'r4'); r := r || 'FAIL expired trial write | ';
  exception when others then r := r || 'expired trial blocked | '; end;
  execute 'reset role';

  -- Anonymous visitor
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform count(*) from public.properties; r := r || 'FAIL anon read | ';
  exception when insufficient_privilege then r := r || 'anon blocked | '; end;
  begin perform public.consume_ai_quota(org_a, 'receipt'); r := r || 'FAIL anon rpc | ';
  exception when insufficient_privilege then r := r || 'anon rpc blocked'; end;
  execute 'reset role';

  raise exception 'RESULTS (rolled back): %', r;
end $$;
