/**
 * Daily owner-report job, called by Vercel Cron (see vercel.json) with
 * "Authorization: Bearer <CRON_SECRET>".
 *
 * Prepares each owner's month-to-date statement (for the owner portal) and any monthly,
 * quarterly or yearly statement that is due, then emails new periodic statements as a PDF to
 * owners who have an email and have not opted out. Needs CRON_SECRET; emailing also needs
 * RESEND_API_KEY, EMAIL_FROM and APP_URL (without them statements are still prepared).
 *
 * The calculation code is shared with the app and bundled into ownerReportsCore.js
 * (`npm run build:server`).
 */
import { handle, json } from '../_lib/security.js';
import { authorised, rpc } from '../_lib/cron.js';
// @ts-ignore -- generated bundle; types come from src/server/ownerReports.ts
import * as core from '../_lib/ownerReportsCore.js';
import type * as CoreTypes from '../../src/server/ownerReports';

export const maxDuration = 60;

const C = core as typeof CoreTypes;

export const GET = handle(async request => {
  const token = authorised(request, 'Owner reports');
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const appUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  const canEmail = Boolean(apiKey && from && appUrl);

  const payload = (await rpc('cron_owner_report_data', { p_token: token })) as CoreTypes.ReportPayload;
  const planned = C.planAll(payload, new Date());

  // Save in batches; the database returns only statements it saved for the first time (and
  // month-to-date ones, which it refreshes).
  const saved: { id: string; org_id: string; entity_id: string; kind: CoreTypes.Kind; period_start: string }[] = [];
  for (let i = 0; i < planned.length; i += 200) {
    const rows = planned.slice(i, i + 200);
    saved.push(...((await rpc('cron_store_owner_statements', { p_token: token, p_rows: rows })) as any[]));
  }

  // New periodic statements, plus recent ones whose email failed or waited for email set-up.
  type Outgoing = { id: string; org_id: string; entity_id: string; kind: CoreTypes.Kind; period_start: string; currency: string; total: number; statement: CoreTypes.PlannedStatement['statement'] };
  const outgoing: Outgoing[] = [];
  for (const s of saved) {
    if (s.kind === 'month_to_date') continue;
    const plan = planned.find(p => p.org_id === s.org_id && p.entity_id === s.entity_id && p.kind === s.kind && p.period_start === String(s.period_start).slice(0, 10));
    if (plan) outgoing.push({ id: s.id, org_id: s.org_id, entity_id: s.entity_id, kind: s.kind, period_start: plan.period_start, currency: plan.currency, total: plan.total, statement: plan.statement });
  }
  for (const ws of payload.workspaces) {
    for (const r of ws.retry ?? []) {
      outgoing.push({ id: r.id, org_id: ws.org_id, entity_id: r.entity_id, kind: r.kind, period_start: String(r.period_start).slice(0, 10), currency: r.currency, total: Number(r.total), statement: r.statement });
    }
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const s of outgoing) {
    const ws = payload.workspaces.find(w => w.org_id === s.org_id);
    const owner = ws?.entities.find(e => e.id === s.entity_id);
    const plan = s;
    if (!ws || !owner) continue;

    const status = owner.opted_out ? 'opted_out' : !owner.report_email ? 'no_email' : !canEmail ? 'not_configured' : null;
    if (status) {
      skipped++;
      if (status === 'not_configured' && (ws.retry ?? []).some(r => r.id === s.id)) continue; // still waiting
      await rpc('cron_mark_statement_emailed', { p_token: token, p_org: s.org_id, p_id: s.id, p_status: status });
      continue;
    }
    try {
      const pdf = await C.statementPdf(plan.statement, { ownerName: owner.name, workspaceName: ws.name });
      const email = C.buildOwnerEmail({
        ownerName: owner.name, workspaceName: ws.name, kind: s.kind, periodStart: plan.period_start,
        total: plan.total, currency: plan.currency, appUrl,
      });
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from, to: [owner.report_email], subject: email.subject, text: email.text, html: email.html,
          attachments: [{ filename: email.filename, content: Buffer.from(pdf).toString('base64') }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      const ok = res.ok;
      if (ok) sent++; else failed++;
      await rpc('cron_mark_statement_emailed', { p_token: token, p_org: s.org_id, p_id: s.id, p_status: ok ? 'sent' : 'failed' });
    } catch {
      failed++;
      await rpc('cron_mark_statement_emailed', { p_token: token, p_org: s.org_id, p_id: s.id, p_status: 'failed' }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 550)); // stay under Resend's 2 requests per second
  }
  return json(200, { prepared: planned.length, saved: saved.length, sent, failed, skipped });
});
