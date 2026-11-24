/**
 * Daily exchange-rate job, called by Vercel Cron (see vercel.json) with
 * "Authorization: Bearer <CRON_SECRET>".
 *
 * Fetches the ECB's last 90 days of reference rates and stores any day not yet held. When a
 * workspace has money recorded before the oldest stored day, it fetches the full history once
 * and fills the gap. Stored days are never changed.
 */
import { HttpError, handle, json } from '../_lib/security.js';
import { authorised, rpc } from '../_lib/cron.js';
import { ECB_90_DAYS, ECB_ALL, chunks, parseEcbXml, pickDays, type EcbDays } from '../_lib/ecbRates.js';

export const maxDuration = 60;

async function fetchEcb(url: string): Promise<EcbDays> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new HttpError(502, 'Could not reach the ECB.');
  const days = parseEcbXml(await res.text());
  if (!Object.keys(days).length) throw new HttpError(502, 'The ECB file had no rates.');
  return days;
}

async function store(token: string, days: EcbDays): Promise<number> {
  let added = 0;
  for (const part of chunks(days)) added += Number(await rpc('cron_store_rates', { p_token: token, p_days: part })) || 0;
  return added;
}

export const GET = handle(async request => {
  const token = authorised(request, 'Exchange rates');
  const [status] = (await rpc('cron_rates_status', { p_token: token })) as {
    latest_stored: string | null; earliest_stored: string | null; earliest_needed: string | null;
  }[];

  const recent = await fetchEcb(ECB_90_DAYS);
  let added = await store(token, pickDays(recent, { from: status?.latest_stored ?? null }));

  // Older money than the oldest stored rate (or nothing stored yet beyond 90 days): fill once.
  const oldestRecent = Object.keys(recent).sort()[0];
  const needed = status?.earliest_needed;
  const heldFrom = status?.earliest_stored ?? oldestRecent;
  let backfilled = 0;
  if (needed && needed < (heldFrom < oldestRecent ? heldFrom : oldestRecent)) {
    const all = await fetchEcb(ECB_ALL);
    // Start a week early so the first needed day has a rate on or before it.
    const from = new Date(Date.parse(needed) - 7 * 864e5).toISOString().slice(0, 10);
    backfilled = await store(token, pickDays(all, { from, skipFrom: heldFrom, skipTo: '9999-12-31' }));
    added += backfilled;
  }
  return json(200, { added, backfilled });
});
