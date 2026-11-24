-- Owner statements itemise what each unit cost: the job now also reads vendor work done on
-- units (service_records), vendor names, and the notes on expenses.
-- Replaces public.cron_owner_report_data only; grants are unchanged (create or replace keeps them).

create or replace function public.cron_owner_report_data(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_since date := (date_trunc('year', current_date) - interval '1 year')::date;
begin
  if not private.cron_token_ok(p_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'org_id', o.id,
        'name', o.name,
        'base_currency', o.base_currency,
        'timezone', o.timezone,
        'entities', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'name', e.name, 'reporting_currency', e.reporting_currency, 'report_email', e.report_email,
            'report_frequency', e.report_frequency, 'opted_out', e.reports_opted_out_at is not null)), '[]')
          from public.entities e where e.org_id = o.id),
        'shares', (select coalesce(jsonb_agg(jsonb_build_object(
            'property_id', s.property_id, 'entity_id', s.entity_id, 'effective_from', s.effective_from, 'share', s.share)), '[]')
          from public.listing_shares s where s.org_id = o.id),
        'properties', (select coalesce(jsonb_agg(to_jsonb(p) - 'org_id' - 'address' - 'created_by'), '[]')
          from public.properties p where p.org_id = o.id),
        'reservations', (select coalesce(jsonb_agg(to_jsonb(r) - 'org_id' - 'guest_name' - 'notes' - 'rating' - 'created_by'), '[]')
          from public.reservations r where r.org_id = o.id and r.check_out >= v_since),
        -- Notes are kept: they describe the expense on the owner's statement.
        'daily_expenses', (select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_by'), '[]')
          from public.daily_expenses x where x.org_id = o.id and x.date >= v_since),
        -- Vendor work on a unit counts as a cost of that unit.
        'service_records', (select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_by'), '[]')
          from public.service_records x where x.org_id = o.id and x.date >= v_since),
        -- Only the name, to label vendor work; no phone or email.
        'vendors', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name)), '[]')
          from public.vendors v where v.org_id = o.id),
        'monthly_bills', (select coalesce(jsonb_agg(to_jsonb(x) - 'org_id' - 'created_by'), '[]')
          from public.monthly_bills x where x.org_id = o.id),
        'statements', (select coalesce(jsonb_agg(jsonb_build_object(
            'entity_id', st.entity_id, 'kind', st.kind, 'period_start', st.period_start, 'emailed_at', st.emailed_at)), '[]')
          from public.owner_statements st where st.org_id = o.id and st.kind <> 'month_to_date'),
        -- Statements from the past week whose email failed or could not be sent yet: try again.
        'retry', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', st.id, 'entity_id', st.entity_id, 'kind', st.kind, 'period_start', st.period_start,
            'currency', st.currency, 'total', st.total, 'statement', st.statement)), '[]')
          from public.owner_statements st
          where st.org_id = o.id and st.kind <> 'month_to_date' and st.emailed_at is null
            and st.email_status in ('failed', 'not_configured') and st.prepared_at > now() - interval '7 days')
      ))
      from public.organizations o
      where o.deletion_requested_at is null
        and exists (select 1 from public.listing_shares s where s.org_id = o.id)
    ), '[]'),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('rate_date', f.rate_date, 'currency', f.currency, 'per_usd', f.per_usd))
      from public.fx_rates f
      where f.rate_date >= v_since - 7
        and f.currency in (
          select p.currency from public.properties p
          union select e.reporting_currency from public.entities e
          union select o.base_currency from public.organizations o)
    ), '[]')
  );
end $$;
