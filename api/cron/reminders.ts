/**
 * Daily reminder job, called by Vercel Cron (see vercel.json) with
 * "Authorization: Bearer <CRON_SECRET>". Asks the database which reminders are due, sends one
 * email per person per workspace through Resend, and records only what was sent, so failures
 * are retried the next day and nothing is sent twice.
 *
 * Needs: CRON_SECRET (same value whose SHA-256 is stored in private.app_settings),
 * RESEND_API_KEY, EMAIL_FROM (e.g. "Staylytics <reminders@yourdomain.com>"), APP_URL.
 */
import { HttpError, handle, json } from '../_lib/security.js';
import { authorised, rpc } from '../_lib/cron.js';
import { buildEmail, type DueReminder } from '../_lib/reminderEmail.js';

export const maxDuration = 60;

export const GET = handle(async request => {
  const token = authorised(request, 'Reminders');
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
