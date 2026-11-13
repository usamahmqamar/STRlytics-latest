/**
 * Builds reminder emails (plain text and simple HTML). Every value from the database is
 * escaped before it goes into HTML.
 */
export interface DueReminder {
  reminder_key: string;
  kind: 'cheque_7d' | 'cheque_today' | 'cheque_overdue' | 'trial_3d' | 'trial_today';
  org_id: string;
  org_name: string;
  email: string;
  details: Record<string, any>;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: unknown, currency: unknown) =>
  `${typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : ''} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 })}`.trim();
const day = (iso: unknown) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export function line(r: DueReminder): { text: string; link: string } {
  const d = r.details;
  const cheque = `rent cheque${d.cheque_number ? ` ${d.cheque_number}` : ''} for ${d.property} (${money(d.amount, d.currency)})`;
  switch (r.kind) {
    case 'cheque_7d': return { text: `The ${cheque} is due in 7 days, on ${day(d.due_date)}.`, link: '/app/setup' };
    case 'cheque_today': return { text: `The ${cheque} is due today, ${day(d.due_date)}.`, link: '/app/setup' };
    case 'cheque_overdue': return {
      text: `The ${cheque} was due on ${day(d.due_date)} and is still marked ${d.status === 'bounced' ? 'bounced' : 'unpaid'}. If it has cleared, mark it paid.`,
      link: '/app/setup',
    };
    case 'trial_3d': return { text: `Your free trial ends in 3 days, on ${day(d.trial_ends_on)}. After that the workspace becomes read-only until a plan is chosen.`, link: '/app/settings' };
    case 'trial_today': return { text: `Your free trial ends today. After that the workspace becomes read-only until a plan is chosen; your data stays safe.`, link: '/app/settings' };
  }
}

export function subjectFor(items: DueReminder[]): string {
  const org = items[0].org_name;
  if (items.length === 1) {
    const r = items[0];
    if (r.kind.startsWith('trial')) return r.kind === 'trial_today' ? `Your Staylytics trial ends today (${org})` : `Your Staylytics trial ends in 3 days (${org})`;
    const when = r.kind === 'cheque_7d' ? 'due in 7 days' : r.kind === 'cheque_today' ? 'due today' : 'overdue';
    return `Rent cheque ${when}: ${r.details.property}`;
  }
  return `${items.length} reminders for ${org}`;
}

export function buildEmail(items: DueReminder[], appUrl: string) {
  const org = items[0].org_name;
  const lines = items.map(line);
  const base = appUrl.replace(/\/+$/, '');
  const text = [
    `${org}`,
    '',
    ...lines.map(l => `- ${l.text}\n  ${base}${l.link}`),
    '',
    `You receive these because you are an owner or manager of ${org} in Staylytics.`,
    `Turn reminder emails off in Settings > Display: ${base}/app/settings`,
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f6f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a2420">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dce0d9;border-radius:14px;padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#6c766f">Staylytics</p>
<h1 style="margin:0 0 20px;font-size:20px;font-weight:600">${esc(org)}</h1>
${lines.map(l => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${esc(l.text)}<br><a href="${esc(base + l.link)}" style="color:#0e5a4a;font-size:13px">Open in Staylytics</a></p>`).join('\n')}
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6c766f">You receive these because you are an owner or manager of ${esc(org)}. <a href="${esc(base)}/app/settings" style="color:#6c766f">Turn reminder emails off</a>.</p>
</div></body></html>`;
  return { subject: subjectFor(items), text, html };
}
