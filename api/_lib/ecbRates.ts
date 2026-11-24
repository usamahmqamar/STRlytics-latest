/**
 * Reads the European Central Bank's euro reference rates (XML) into
 * { "2026-11-12": { "USD": 1.16, "GBP": 0.87, ... }, ... } — units per 1 EUR.
 * The database turns these into "per 1 USD" and adds the dollar-pegged currencies.
 */
export const ECB_90_DAYS = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
export const ECB_ALL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml';

export type EcbDays = Record<string, Record<string, number>>;

export function parseEcbXml(xml: string): EcbDays {
  const days: EcbDays = {};
  const dayRe = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  const rateRe = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9]+(?:\.[0-9]+)?)["']\s*\/>/g;
  for (const day of xml.matchAll(dayRe)) {
    const rates: Record<string, number> = {};
    for (const r of day[2].matchAll(rateRe)) {
      const v = Number(r[2]);
      if (Number.isFinite(v) && v > 0) rates[r[1]] = v;
    }
    if (rates.USD) days[day[1]] = rates;
  }
  return days;
}

/** Days to store: everything not already held, from `from` (inclusive) onwards. */
export function pickDays(days: EcbDays, opts: { from?: string | null; skipFrom?: string | null; skipTo?: string | null }): EcbDays {
  const out: EcbDays = {};
  for (const [d, r] of Object.entries(days)) {
    if (opts.from && d < opts.from) continue;
    if (opts.skipFrom && opts.skipTo && d >= opts.skipFrom && d <= opts.skipTo) continue;
    out[d] = r;
  }
  return out;
}

export function chunks(days: EcbDays, size = 400): EcbDays[] {
  const keys = Object.keys(days).sort();
  const out: EcbDays[] = [];
  for (let i = 0; i < keys.length; i += size) out.push(Object.fromEntries(keys.slice(i, i + size).map(k => [k, days[k]])));
  return out;
}
