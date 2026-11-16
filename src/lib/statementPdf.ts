/**
 * Owner statement as a PDF (pdf-lib, loaded only when a statement is made). The same code can
 * run on the server when monthly emails are switched on.
 */
import type { Statement } from './ownerStatement';

// The built-in PDF fonts cover Western characters only; anything else is shown as "?".
const safe = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');

const money = (v: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(v).replace(/ /g, ' ');
  } catch { return `${currency} ${v.toFixed(2)}`; }
};
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const pct = (a: number, b: number) => (a === b ? `${a}%` : `${a}% to ${b}%`);

export async function statementPdf(s: Statement, meta: { ownerName: string; workspaceName: string }): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Owner statement - ${meta.ownerName} - ${s.start} to ${s.end}`));
  doc.setProducer('Staylytics');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.09, 0.11), quiet = rgb(0.42, 0.42, 0.46), rule = rgb(0.85, 0.85, 0.87);

  let page = doc.addPage([595.28, 841.89]); // A4
  const left = 48, right = 547;
  let y = 790;
  const text = (t: string, x: number, size = 10, f = font, color = ink) => page.drawText(safe(t), { x, y, size, font: f, color });
  const textRight = (t: string, xRight: number, size = 10, f = font, color = ink) => {
    const w = f.widthOfTextAtSize(safe(t), size);
    page.drawText(safe(t), { x: xRight - w, y, size, font: f, color });
  };
  const line = () => page.drawLine({ start: { x: left, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 0.6, color: rule });
  const newPageIfNeeded = (need: number) => { if (y - need < 60) { page = doc.addPage([595.28, 841.89]); y = 790; } };

  text('Owner statement', left, 20, bold); y -= 26;
  text(meta.ownerName, left, 12, bold); y -= 16;
  text(`${day(s.start)} to ${day(s.end)}`, left, 10, font, quiet); y -= 14;
  text(`Prepared by ${meta.workspaceName} on ${day(new Date().toISOString().slice(0, 10))}`, left, 9, font, quiet); y -= 34;

  // Summary
  text('Your share of profit', left, 10, font, quiet); y -= 22;
  text(money(s.totalReporting, s.reportingCurrency), left, 22, bold); y -= 36;

  // Table per property
  const cols = { name: left, rev: 300, cost: 370, profit: 440, share: 482, mine: right };
  text('Property', cols.name, 9, bold, quiet);
  textRight('Revenue', cols.rev, 9, bold, quiet);
  textRight('Costs', cols.cost, 9, bold, quiet);
  textRight('Profit', cols.profit, 9, bold, quiet);
  textRight('Share', cols.share, 9, bold, quiet);
  textRight('Your part', cols.mine, 9, bold, quiet);
  y -= 8; line(); y -= 14;

  for (const l of s.lines) {
    newPageIfNeeded(48);
    text(l.propertyName.slice(0, 40), cols.name, 10, bold);
    textRight(money(l.revenue, l.currency), cols.rev, 9);
    textRight(money(l.costs, l.currency), cols.cost, 9);
    textRight(money(l.profit, l.currency), cols.profit, 9);
    textRight(pct(l.shareStart, l.shareEnd), cols.share, 9);
    textRight(money(l.ownerProfit, l.currency), cols.mine, 9, bold);
    y -= 13;
    text(`${l.nightsBooked} nights booked`, cols.name, 8, font, quiet);
    if (l.currency !== s.reportingCurrency) textRight(`= ${money(l.ownerProfitReporting, s.reportingCurrency)}`, cols.mine, 8, font, quiet);
    y -= 10; line(); y -= 14;
  }
  if (!s.lines.length) { text('No property income or costs in this period.', left, 10, font, quiet); y -= 20; }

  newPageIfNeeded(110);
  y -= 10;
  text('Total, your share', left, 11, bold);
  textRight(money(s.totalReporting, s.reportingCurrency), right, 11, bold);
  y -= 30;

  const notes = [
    'Each property is worked out in its own currency. Your part follows the shares in force on each day.',
    s.lines.some(l => l.currency !== s.reportingCurrency)
      ? `Amounts in other currencies are converted to ${s.reportingCurrency} at the daily reference rate for each day.`
      : '',
    s.missingRates.length ? `No exchange rate was available for ${s.missingRates.join(', ')} on some days; those days are left out of the ${s.reportingCurrency} total.` : '',
    'This statement summarises the records kept in Staylytics. It is not tax advice.',
  ].filter(Boolean);
  for (const n of notes) { newPageIfNeeded(14); text(n, left, 8, font, quiet); y -= 12; }

  return doc.save();
}
