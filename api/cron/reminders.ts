/**
 * Daily reminder job, called by Vercel Cron (see vercel.json) with
 * "Authorization: Bearer <CRON_SECRET>". Asks the database which reminders are due, sends one
 * email per person per workspace through Resend, and records only what was sent, so failures
 * are retried the next day and nothing is sent twice.
 *
 * Needs: CRON_SECRET (same value whose SHA-256 is stored in private.app_settings),
 * RESEND_API_KEY, EMAIL_FROM (e.g. "Staylytics <reminders@yourdomain.com>"), APP_URL.
 */
import { timingSafeEqual } from 'node:crypto';
import { HttpError, handle, json, supabaseConfig } from '../_lib/security.js';
import { buildEmail, type DueReminder } from '../_lib/reminderEmail.js';

export const maxDuration = 60;

function authorised(request: Request): string {
  const secret = process.env.CRON_SECRET || '';
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (secret.length < 32) throw new HttpError(503, 'Reminders are not configured.');
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Not allowed.');
  return secret;
}

async function rpc(name: string, body: unknown) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new HttpError(502, 'Could not reach the database.');
  return res.json();
}

export const GET = handle(async request => {
  const token = authorised(request);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const appUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  if (!apiKey || !from || !appUrl) throw new HttpError(503, 'Email sending is not configured.');

  const due = (await rpc('cron_reminders_due', { p_token: token })) as DueReminder[];
  const groups = new Map<string, DueReminder[]>();
  for (const r of due) {
    const k = `${r.org_id}|${r.email}`;
    groups.set(k, [...(groups.get(k) || []), r]);
  }

  const sentKeys: string[] = [];
  let failed = 0;
  for (const items of groups.values()) {
    const email = buildEmail(items, appUrl);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [items[0].email], subject: email.subject, text: email.text, html: email.html }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) { failed++; continue; }
      sentKeys.push(...items.map(i => i.reminder_key));
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 550)); // stay under Resend's 2 requests per second
  }
  if (sentKeys.length) await rpc('cron_mark_reminders_sent', { p_token: token, p_keys: sentKeys });
  return json(200, { due: due.length, emails: groups.size, sent: groups.size - failed, failed });
});
