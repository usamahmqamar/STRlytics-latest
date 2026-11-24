/** Loads the stored daily exchange rates (shared, read-only for signed-in users). */
import { supabase } from '../lib/supabase';
import { buildRates, type Rates } from '../lib/money';

const PAGE = 1000;

export async function loadRates(currencies: string[], since: string): Promise<Rates> {
  const wanted = [...new Set(currencies.filter(c => c && c !== 'USD'))];
  if (!wanted.length) return new Map();
  const rows: { rate_date: string; currency: string; per_usd: number }[] = [];
  // Start a week early so the first day has a rate on or before it.
  const from = new Date(Date.parse(since) - 7 * 864e5).toISOString().slice(0, 10);
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from('fx_rates')
      .select('rate_date, currency, per_usd')
      .in('currency', wanted)
      .gte('rate_date', from)
      .order('rate_date', { ascending: true })
      .order('currency', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return buildRates(rows);
}

/** Earliest date any amount in the workspace was recorded on (so rates load from there). */
export function earliestDate(dates: (string | undefined | null)[]): string {
  let min = new Date().toISOString().slice(0, 10);
  for (const d of dates) if (d && /^\d{4}-\d{2}-\d{2}/.test(d) && d.slice(0, 10) < min) min = d.slice(0, 10);
  return min;
}
