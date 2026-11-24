/**
 * Owner reports, worked out for the daily job: which statements are due for each owner, their
 * figures, the PDF and the email. Pure code with no database or network access, bundled for
 * the server by `npm run build:server` into api/_lib/ownerReportsCore.js.
 *
 * Each day, per owner with shares:
 *   - a month-to-date statement (1st of this month to yesterday), refreshed daily for the portal
 *   - the periodic statements that are due and not yet prepared:
 *       monthly            last month          (frequency monthly, or monthly_and_yearly)
 *       quarterly          last full quarter   (frequency quarterly)
 *       yearly             last calendar year  (frequency monthly_and_yearly)
 * A statement with no property lines (no shares in that period) is not prepared.
 * "Today" is the workspace's own date, in its time zone.
 */
import { assembleUserData } from '../lib/workspaceRows';
import { buildRates, type Rates } from '../lib/money';
import { buildStatement, type Statement } from '../lib/ownerStatement';
import { statementPdf } from '../lib/statementPdf';
import type { ListingShare } from '../services/owners';

export { statementPdf };

export interface PayloadEntity {
  id: string; name: string; reporting_currency: string; report_email: string | null;
  report_frequency: 'monthly' | 'quarterly' | 'monthly_and_yearly'; opted_out: boolean;
}
export interface WorkspacePayload {
  org_id: string; name: string; base_currency: string; timezone: string | null;
  entities: PayloadEntity[];
  shares: ListingShare[];
  properties: Record<string, unknown>[];
  reservations: Record<string, unknown>[];
  daily_expenses: Record<string, unknown>[];
  monthly_bills: Record<string, unknown>[];
  service_records?: Record<string, unknown>[];
  vendors?: Record<string, unknown>[]; // id and name only
  statements: { entity_id: string; kind: string; period_start: string; emailed_at: string | null }[];
  /** Recent statements whose email failed or could not be sent yet. */
  retry?: { id: string; entity_id: string; kind: Kind; period_start: string; currency: string; total: number | string; statement: Statement }[];
}
export interface ReportPayload { workspaces: WorkspacePayload[]; rates: { rate_date: string; currency: string; per_usd: number | string }[] }

export type Kind = 'month_to_date' | 'monthly' | 'quarterly' | 'yearly';
export interface PlannedStatement {
  org_id: string; entity_id: string; kind: Kind; period_start: string; period_end: string;
  currency: string; total: number; statement: Statement;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

/** The workspace's date today (yyyy-mm-dd) in its time zone. */
export function localToday(timezone: string | null | undefined, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The periods due as of `today` for a frequency (month-to-date first; it may be absent on the 1st). */
export function duePeriods(frequency: PayloadEntity['report_frequency'], today: string): { kind: Kind; start: string; end: string }[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1, d = Number(today.slice(8, 10));
  const out: { kind: Kind; start: string; end: string }[] = [];
  if (d > 1) out.push({ kind: 'month_to_date', start: iso(y, m, 1), end: iso(y, m, d - 1) });
  if (frequency === 'monthly' || frequency === 'monthly_and_yearly') out.push({ kind: 'monthly', start: iso(y, m - 1, 1), end: iso(y, m, 0) });
  if (frequency === 'quarterly') {
    const q = Math.floor(m / 3);
    out.push({ kind: 'quarterly', start: iso(y, (q - 1) * 3, 1), end: iso(y, q * 3, 0) });
  }
  if (frequency === 'monthly_and_yearly') out.push({ kind: 'yearly', start: iso(y - 1, 0, 1), end: iso(y - 1, 11, 31) });
  return out;
}

/** Statements to save for one workspace today. Periodic ones already prepared are skipped. */
export function planWorkspace(ws: WorkspacePayload, rates: Rates, now: Date): PlannedStatement[] {
  const today = localToday(ws.timezone, now);
  const data = assembleUserData({
    properties: ws.properties, property_rent_cheques: [], property_setup_costs: [],
    tables: { reservations: ws.reservations, daily_expenses: ws.daily_expenses, monthly_bills: ws.monthly_bills,
      service_records: ws.service_records ?? [], vendors: ws.vendors ?? [] },
  });
  const done = new Set(ws.statements.map(s => `${s.entity_id}|${s.kind}|${String(s.period_start).slice(0, 10)}`));
  const shares = ws.shares.map(s => ({ ...s, effective_from: String(s.effective_from).slice(0, 10), share: Number(s.share) }));
  const owners = new Set(shares.map(s => s.entity_id));
  const out: PlannedStatement[] = [];

  for (const e of ws.entities) {
    if (!owners.has(e.id)) continue;
    for (const p of duePeriods(e.report_frequency, today)) {
      if (p.kind !== 'month_to_date' && done.has(`${e.id}|${p.kind}|${p.start}`)) continue;
      const statement = buildStatement({
        data, rates, baseCurrency: ws.base_currency, shares, entityId: e.id,
        reportingCurrency: e.reporting_currency, start: p.start, end: p.end,
      });
      if (!statement.lines.length) continue;
      out.push({
        org_id: ws.org_id, entity_id: e.id, kind: p.kind, period_start: p.start, period_end: p.end,
        currency: statement.reportingCurrency, total: statement.totalReporting, statement,
      });
    }
  }
  return out;
}

export function planAll(payload: ReportPayload, now: Date): PlannedStatement[] {
  const rates = buildRates(payload.rates);
  return payload.workspaces.flatMap(ws => planWorkspace(ws, rates, now));
}

/* ------------------------------------------------------------------ email */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (v: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v).replace(/ /g, ' ');
  } catch { return `${currency} ${v.toFixed(2)}`; }
};
const monthName = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function periodLabel(kind: Kind, start: string): string {
  if (kind === 'yearly') return start.slice(0, 4);
  if (kind === 'quarterly') return `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1} ${start.slice(0, 4)}`;
  return monthName(start);
}

export function buildOwnerEmail(input: {
  ownerName: string; workspaceName: string; kind: Kind; periodStart: string; total: number; currency: string; appUrl: string;
}): { subject: string; text: string; html: string; filename: string } {
  const period = periodLabel(input.kind, input.periodStart);
  const total = money(input.total, input.currency);
  const portal = `${input.appUrl.replace(/\/$/, '')}/owner`;
  const subject = `Your owner statement for ${period} from ${input.workspaceName}`.slice(0, 200);
  const text = [
    `Dear ${input.ownerName},`,
    '',
    `Your owner statement for ${period} from ${input.workspaceName} is attached.`,
    `Your share of profit: ${total}.`,
    '',
    `If you have an owner login, you can see this and the month so far at ${portal}.`,
    '',
    `If you would rather not receive these emails, reply to ${input.workspaceName} and ask them to stop.`,
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#18181b;line-height:1.5">
<p>Dear ${esc(input.ownerName)},</p>
<p>Your owner statement for <strong>${esc(period)}</strong> from ${esc(input.workspaceName)} is attached.</p>
<p style="font-size:13px;color:#52525b;margin-bottom:2px">Your share of profit</p>
<p style="font-size:22px;font-weight:bold;margin-top:0">${esc(total)}</p>
<p>If you have an owner login, you can see this and the month so far at <a href="${esc(portal)}">${esc(portal)}</a>.</p>
<p style="font-size:12px;color:#71717a">If you would rather not receive these emails, reply to ${esc(input.workspaceName)} and ask them to stop.</p>
</body></html>`;
  const filename = `owner-statement-${period.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
  return { subject, text, html, filename };
}
