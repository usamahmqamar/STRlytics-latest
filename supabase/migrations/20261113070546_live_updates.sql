-- Live updates: publish workspace tables to Supabase Realtime so teammates' saves appear
-- without a refresh. Realtime enforces the same row-level security as normal reads, so a
-- member only receives changes for workspaces and rows they are allowed to see.
-- Finance tables (payouts and their matches) are deliberately not published.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found; skipping (local test database)';
    return;
  end if;
  foreach t in array array[
    'properties', 'property_rent_cheques', 'property_setup_costs', 'reservations', 'platforms', 'vendors',
    'service_records', 'vendor_invoices', 'vendor_payments', 'daily_expenses', 'monthly_bills',
    'bank_reconciliations', 'assets', 'documents', 'maintenance_tasks', 'communication_templates', 'workspace_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
