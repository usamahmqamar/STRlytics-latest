/**
 * Payouts: match money received to bookings, and explain every difference.
 * Owners and managers only (row-level security enforces the same in the database).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Link2, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Sheet, fieldClass } from './ui/Sheet';
import { cn } from '../lib/utils';
import { SUPPORTED_CURRENCIES, convert, formatMoney, isSupportedCurrency, linkFor, type Rates } from '../lib/money';
import {
  REASON_LABELS, STATUS_LABELS, TOLERANCE, bookingRecon, expectedPayout, findPlatform, payoutRecon, suggestMatches,
  type AdjustmentReason, type BookingRecon, type BookingStatus, type Candidate, type Payout, type Resolution,
} from '../lib/reconcile';
import {
  addAdjustment, addAllocations, addPayouts, deleteAdjustment, deletePayout, fileProblem, listDocuments, loadFinance,
  markDocumentSaved, openDocument, readStoredDocument, removeAllocation, updateAdjustment, uploadDocument,
  type FinanceData, type NewPayout, type SourceDocument,
} from '../services/finance';
import type { Reservation, UserData } from '../types';

// Bookings are in their listing's currency, payouts in their own; every amount is shown with its code.
const money = (v: number, currency: string) => formatMoney(v, currency);
const day = (d: string) => format(parseISO(d), 'd MMM yyyy');
const signed = (v: number, currency: string) => (v > 0 ? `+${money(v, currency)}` : money(v, currency));
const r2 = (n: number) => Math.round(n * 100) / 100;


const STATUS_STYLE: Record<BookingStatus, string> = {
  reconciled: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  difference: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  missing: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200',
  disputed: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
  awaiting: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  not_due: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};
const Badge: React.FC<{ status: BookingStatus }> = ({ status }) => (
  <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[status])}>{STATUS_LABELS[status]}</span>
);

interface Props {
  data: UserData;
  orgId: string;
  canManage: boolean;
  filters: { apartmentId: string; startDate: string; endDate: string; displayCurrency: string };
  rates: Rates;
  baseCurrency: string;
}

type Row = { res: Reservation; recon: BookingRecon; unit: string; platform: string; currency: string };

export const Payouts: React.FC<Props> = ({ data, orgId, canManage, filters, rates, baseCurrency }) => {
  const viewCurrency = filters.displayCurrency;
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [docs, setDocs] = useState<SourceDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'bookings' | 'payouts' | 'documents'>('bookings');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'attention' | 'all'>('attention');
  const [bookingCode, setBookingCode] = useState<string | null>(null);
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const [adding, setAdding] = useState<'manual' | 'bank_statement' | 'payout_report' | null>(null);
  const today = format(new Date(), 'yyyy-MM-dd');

  const refresh = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([loadFinance(orgId), listDocuments(orgId)]);
      setFinance(f);
      setDocs(d);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [orgId]);
  useEffect(() => { if (canManage) refresh(); }, [canManage, refresh]);

  const allRows: Row[] = useMemo(() => {
    if (!finance) return [];
    return data.reservations.map(res => {
      const platform = findPlatform(res, data.platforms);
      return {
        res,
        recon: bookingRecon(res, platform, finance.allocations, finance.adjustments, today),
        unit: data.apartments.find(a => a.apartment_id === res.apartment_id)?.name ?? '—',
        platform: platform?.name ?? res.channel ?? '—',
        currency: res.currency || data.apartments.find(a => a.apartment_id === res.apartment_id)?.currency || baseCurrency,
      };
    });
  }, [data, finance, today]);

  const inScope = useMemo(() => allRows.filter(r =>
    (filters.apartmentId === 'ALL' || r.res.apartment_id === filters.apartmentId) &&
    r.recon.expectedDate >= filters.startDate && r.recon.expectedDate <= filters.endDate,
  ), [allRows, filters]);

  const candidates: Candidate[] = useMemo(() => allRows
    .filter(r => r.res.status !== 'cancelled')
    .map(r => ({
      reservation_id: r.res.reservation_code,
      guest_name: r.res.guest_name,
      platform_id: r.res.platform_id ?? null,
      expected_date: r.recon.expectedDate,
      outstanding: Math.round((r.recon.expected - r.recon.received) * 100) / 100,
      currency: r.currency,
    })), [allRows]);

  if (!canManage) {
    return (
      <Card>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Payouts and bank details are visible to owners and managers only.</p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <p className="text-sm text-rose-600" role="alert">{error}</p>
        <Button variant="outline" className="mt-3" onClick={refresh}>Try again</Button>
      </Card>
    );
  }
  if (!finance) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-400" /></div>;
  }

  // Totals across listings: each booking's amount converted to the view currency at its payout date.
  const sum = (f: (r: Row) => number, rows = inScope) =>
    rows.reduce((t, r) => t + (convert(f(r), r.currency, viewCurrency, r.recon.expectedDate, rates) ?? f(r)), 0);
  const attention = inScope.filter(r => r.recon.status === 'difference' || r.recon.status === 'missing');
  const missing = attention.filter(r => r.recon.status === 'missing');
  const differing = attention.filter(r => r.recon.status === 'difference');
  const attentionNote = !attention.length ? 'Nothing outstanding' : [
    missing.length ? `${missing.length} ${missing.length === 1 ? 'payout' : 'payouts'} not received` : '',
    differing.length ? `${money(Math.abs(sum(r => r.recon.unexplained, differing)), viewCurrency)} of differences` : '',
  ].filter(Boolean).join(', ');
  const periodPayouts = finance.payouts.filter(p => p.received_date >= filters.startDate && p.received_date <= filters.endDate);
  const unmatched = periodPayouts.filter(p => payoutRecon(p, finance.allocations).status !== 'matched');
  const shown = inScope
    .filter(r => statusFilter === 'all' ? r.recon.status !== 'not_due'
      : statusFilter === 'attention' ? (r.recon.status === 'difference' || r.recon.status === 'missing')
      : r.recon.status === statusFilter)
    .sort((a, b) => a.recon.expectedDate.localeCompare(b.recon.expectedDate));

  const selectedRow = bookingCode ? allRows.find(r => r.res.reservation_code === bookingCode) ?? null : null;
  const selectedPayout = payoutId ? finance.payouts.find(p => p.id === payoutId) ?? null : null;

  return (
    <div className="space-y-6 pb-20">
      {/* Summary */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 md:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
        {[
          ['Expected', money(sum(r => r.recon.expected), viewCurrency), `${inScope.filter(r => r.recon.status !== 'not_due').length} bookings due in this period`],
          ['Received', money(sum(r => r.recon.received), viewCurrency), `${periodPayouts.length} payouts recorded`],
          ['Needs explaining', String(attention.length), attentionNote],
          ['In dispute', money(sum(r => r.recon.openDisputes), viewCurrency), `${inScope.filter(r => r.recon.status === 'disputed').length} bookings`],
        ].map(([label, value, note]) => (
          <div key={label} className="bg-white p-5 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{note}</p>
          </div>
        ))}
      </section>

      {/* Actions and views */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-850" role="tablist">
          {([['bookings', 'Bookings'], ['payouts', `Payouts${unmatched.length ? ` (${unmatched.length} to match)` : ''}`], ['documents', 'Documents']] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors',
                tab === id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAdding('bank_statement')}><Upload size={14} /> Bank statement</Button>
          <Button variant="outline" onClick={() => setAdding('payout_report')}><Upload size={14} /> Payout report</Button>
          <Button onClick={() => setAdding('manual')}><Plus size={14} /> Add payout</Button>
        </div>
      </div>

      {tab === 'bookings' && (
        <Card className="p-0">
          <div className="flex flex-wrap gap-1.5 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            {([
              ['attention', `Needs explaining (${attention.length})`],
              ['disputed', 'In dispute'],
              ['awaiting', 'Not due yet'],
              ['reconciled', 'Reconciled'],
              ['all', 'All'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setStatusFilter(id)}
                className={cn('rounded-full px-3 py-1 text-xs transition-colors',
                  statusFilter === id ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">
              {statusFilter === 'attention' ? 'Every booking due in this period is reconciled or not due yet.' : 'No bookings here for this period.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500">
                    <th className="px-5 py-2.5 text-left font-medium">Booking</th>
                    <th className="px-3 py-2.5 text-left font-medium">Payout due</th>
                    <th className="px-3 py-2.5 text-right font-medium">Expected</th>
                    <th className="px-3 py-2.5 text-right font-medium">Received</th>
                    <th className="px-3 py-2.5 text-right font-medium">Unexplained</th>
                    <th className="px-5 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.res.reservation_code} onClick={() => setBookingCode(r.res.reservation_code)} className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-850">
                      <td className="px-5 py-3">
                        <span className="block font-medium text-zinc-900 dark:text-zinc-100">{r.res.guest_name}</span>
                        <span className="block text-xs text-zinc-500">{r.res.reservation_code}, {r.platform}, {r.unit}</span>
                      </td>
                      <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400">{day(r.recon.expectedDate)}</td>
                      <td className="px-3 py-3 text-right text-zinc-900 dark:text-zinc-100">{money(r.recon.expected, r.currency)}</td>
                      <td className="px-3 py-3 text-right text-zinc-900 dark:text-zinc-100">{r.recon.received ? money(r.recon.received, r.currency) : '—'}</td>
                      <td className={cn('px-3 py-3 text-right', Math.abs(r.recon.unexplained) > TOLERANCE && r.recon.status === 'difference' ? 'font-medium text-amber-700' : 'text-zinc-400')}>
                        {r.recon.status === 'difference' ? signed(r.recon.unexplained, r.currency) : '—'}
                      </td>
                      <td className="px-5 py-3"><Badge status={r.recon.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'payouts' && (
        <Card className="p-0">
          {finance.payouts.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">No payouts yet. Upload a bank statement or payout report, or add a payout by hand.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500">
                    <th className="px-5 py-2.5 text-left font-medium">Received</th>
                    <th className="px-3 py-2.5 text-left font-medium">From</th>
                    <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-3 py-2.5 text-right font-medium">Matched</th>
                    <th className="px-5 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...finance.payouts].sort((a, b) => b.received_date.localeCompare(a.received_date)).map(p => {
                    const pr = payoutRecon(p, finance.allocations);
                    return (
                      <tr key={p.id} onClick={() => setPayoutId(p.id)} className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-850">
                        <td className="px-5 py-3 text-zinc-900 dark:text-zinc-100">{day(p.received_date)}</td>
                        <td className="px-3 py-3">
                          <span className="block text-zinc-900 dark:text-zinc-100">{data.platforms.find(x => x.platform_id === p.platform_id)?.name ?? 'Unknown platform'}</span>
                          <span className="block max-w-[320px] truncate text-xs text-zinc-500">{p.reference || p.description || (p.source === 'manual' ? 'Added by hand' : '')}</span>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-zinc-900 dark:text-zinc-100">{money(p.amount, p.currency || baseCurrency)}</td>
                        <td className="px-3 py-3 text-right text-zinc-600 dark:text-zinc-400">{pr.allocated ? money(pr.allocated, p.currency || baseCurrency) : '—'}</td>
                        <td className="px-5 py-3">
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium',
                            pr.status === 'matched' ? STATUS_STYLE.reconciled : pr.status === 'partly_matched' ? STATUS_STYLE.difference : STATUS_STYLE.missing)}>
                            {pr.status === 'matched' ? 'Matched' : pr.status === 'partly_matched' ? `${money(pr.remaining, p.currency || baseCurrency)} not matched` : 'Not matched'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'documents' && (
        <Card className="p-0">
          {docs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">Uploaded booking PDFs, bank statements and payout reports appear here.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {docs.map(d => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <FileText size={15} className="text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-zinc-900 dark:text-zinc-100">{d.file_name}</p>
                    <p className="text-xs text-zinc-500">
                      {d.kind === 'bookings' ? 'Booking PDF' : d.kind === 'bank_statement' ? 'Bank statement' : 'Payout report'}
                      {d.apartment_id ? `, ${data.apartments.find(a => a.apartment_id === d.apartment_id)?.name ?? d.apartment_id}` : ''}
                      {`, uploaded ${day(d.created_at.slice(0, 10))}`}
                      {d.status === 'saved' ? `, ${d.rows_saved ?? 0} saved` : d.status === 'read' ? `, ${d.rows_found ?? 0} found, not saved yet` : d.status === 'failed' ? ', could not be read' : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openDocument(d.file_path).catch(e => setError(e.message))}>Open</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {selectedRow && (
        <BookingPanel
          row={selectedRow}
          data={data}
          finance={finance}
          orgId={orgId}
          rates={rates}
          baseCurrency={baseCurrency}
          onClose={() => setBookingCode(null)}
          onChanged={refresh}
          onOpenPayout={id => { setBookingCode(null); setPayoutId(id); }}
        />
      )}
      {selectedPayout && (
        <PayoutPanel
          payout={selectedPayout}
          data={data}
          finance={finance}
          candidates={candidates}
          orgId={orgId}
          rates={rates}
          baseCurrency={baseCurrency}
          onClose={() => setPayoutId(null)}
          onChanged={refresh}
          onOpenBooking={code => { setPayoutId(null); setBookingCode(code); }}
        />
      )}
      {adding && (
        <AddPayouts
          mode={adding}
          data={data}
          orgId={orgId}
          candidates={candidates}
          baseCurrency={baseCurrency}
          onClose={() => setAdding(null)}
          onDone={async () => { await refresh(); setTab('payouts'); }}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Booking: expected vs received, and the explanations                 */
/* ------------------------------------------------------------------ */

const BookingPanel: React.FC<{
  row: Row; data: UserData; finance: FinanceData; orgId: string; rates: Rates; baseCurrency: string;
  onClose: () => void; onChanged: () => Promise<void>; onOpenPayout: (id: string) => void;
}> = ({ row, data, finance, orgId, rates, baseCurrency, onClose, onChanged, onOpenPayout }) => {
  const { res, recon } = row;
  const bc = row.currency;
  const aed = (v: number) => money(v, bc);
  const pcOf = (p?: Payout) => p?.currency || baseCurrency;
  const platform = findPlatform(res, data.platforms);
  const exp = expectedPayout(res, platform);
  const allocations = finance.allocations.filter(a => a.reservation_id === res.reservation_code);
  const adjustments = finance.adjustments.filter(a => a.reservation_id === res.reservation_code);
  const [reason, setReason] = useState<AdjustmentReason>('payment_fee');
  const [amount, setAmount] = useState<number>(recon.unexplained);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'accepted' | 'disputed'>('accepted');
  const [disputeRef, setDisputeRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setAmount(recon.unexplained); }, [recon.unexplained]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); await onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const openPayouts = finance.payouts
    .filter(p => (!p.platform_id || p.platform_id === res.platform_id) && payoutRecon(p, finance.allocations).remaining > TOLERANCE)
    .filter(p => !allocations.some(a => a.payout_id === p.id))
    .slice(0, 8);

  return (
    <Sheet open onClose={onClose} title={`${res.guest_name}, ${res.reservation_code}`}
      description={`${row.platform}, ${row.unit}, ${day(res.check_in)} to ${day(res.check_out)}${res.status === 'cancelled' ? ', cancelled' : ''}`}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Badge status={recon.status} />
          <span className="text-xs text-zinc-500">Payout due {day(recon.expectedDate)}</span>
        </div>

        {/* Expected */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">What should be paid out</h3>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-600 dark:text-zinc-400">Guest paid</dt><dd>{aed(exp.gross)}</dd></div>
            {exp.lines.map(l => (
              <div key={l.label} className="flex justify-between"><dt className="text-zinc-600 dark:text-zinc-400">{l.label}</dt><dd className="text-zinc-600 dark:text-zinc-400">{aed(l.amount)}</dd></div>
            ))}
            <div className="flex justify-between border-t border-zinc-200 pt-1.5 font-semibold dark:border-zinc-700">
              <dt>Expected payout</dt><dd>{aed(recon.expected)}</dd>
            </div>
          </dl>
          <p className="mt-1.5 text-xs text-zinc-500">
            {res.status === 'cancelled' ? 'Cancelled, so nothing is expected unless the platform pays a cancellation fee.'
              : exp.basis === 'stated' ? 'Payout as stated by the platform for this booking.' : `Calculated from ${row.platform}'s rates in Settings; add the stated payout to the booking for an exact figure.`}
          </p>
        </section>

        {/* Received */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Received</h3>
          {allocations.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No payout matched yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {allocations.map(a => {
                const p = finance.payouts.find(x => x.id === a.payout_id);
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2">
                    <button className="min-w-0 flex-1 text-left hover:underline" onClick={() => onOpenPayout(a.payout_id)}>
                      Payout of {p ? `${money(p.amount, pcOf(p))} on ${day(p.received_date)}` : 'unknown date'}
                    </button>
                    <span className="font-medium">
                      {money(a.amount, pcOf(p))}
                      {a.booking_amount != null && pcOf(p) !== bc && <span className="ml-1 text-xs font-normal text-zinc-500">({aed(a.booking_amount)})</span>}
                    </span>
                    <button aria-label="Unlink this payout" disabled={busy} onClick={() => run(() => removeAllocation(orgId, a.id))} className="rounded p-1 text-zinc-400 hover:text-rose-600"><X size={14} /></button>
                  </li>
                );
              })}
            </ul>
          )}
          {openPayouts.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-xs text-emerald-700 dark:text-emerald-300">Link a payout that is not fully matched</summary>
              <ul className="mt-2 space-y-1">
                {openPayouts.map(p => {
                  const left = payoutRecon(p, finance.allocations).remaining;
                  const link = linkFor(p, left, bc, Math.max(0, recon.expected - recon.received), rates);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="text-zinc-600 dark:text-zinc-400">{day(p.received_date)}, {money(p.amount, pcOf(p))} ({money(left, pcOf(p))} free)</span>
                      {link ? (
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => run(() => addAllocations(orgId, p.id!, [{ reservation_id: res.reservation_code, ...link }]))}>
                          <Link2 size={12} /> Link {money(link.amount, pcOf(p))}
                        </Button>
                      ) : <span className="text-xs text-amber-700">No {pcOf(p)}/{bc} rate yet</span>}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </section>

        {/* Difference */}
        <section className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-850">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-zinc-500">Difference</dt><dd className="font-semibold">{signed(recon.difference, bc)}</dd></div>
            <div><dt className="text-xs text-zinc-500">Explained</dt><dd className="font-semibold">{signed(recon.explained, bc)}</dd></div>
            <div><dt className="text-xs text-zinc-500">Unexplained</dt><dd className={cn('font-semibold', Math.abs(recon.unexplained) > TOLERANCE ? 'text-amber-700' : 'text-emerald-700')}>{signed(recon.unexplained, bc)}</dd></div>
          </dl>
        </section>

        {/* Explanations */}
        {adjustments.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Explanations</h3>
            <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {adjustments.map(a => (
                <li key={a.id} className="py-2.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-900 dark:text-zinc-100">{REASON_LABELS[a.reason]}</p>
                      <p className="text-xs text-zinc-500">
                        {a.resolution === 'accepted' ? 'Accepted' : a.resolution === 'disputed' ? `In dispute${a.dispute_reference ? `, case ${a.dispute_reference}` : ''}` : a.resolution === 'recovered' ? 'Recovered from the platform' : 'Written off'}
                        {a.note ? `. ${a.note}` : ''}
                      </p>
                    </div>
                    <span className="font-medium">{signed(a.amount, bc)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.resolution === 'disputed' && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => updateAdjustment(orgId, a.id, { resolution: 'recovered', resolved_at: new Date().toISOString() }))}>
                          Platform paid it back
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => updateAdjustment(orgId, a.id, { resolution: 'written_off', resolved_at: new Date().toISOString() }))}>
                          Write it off
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => deleteAdjustment(orgId, a.id))}><Trash2 size={12} /> Remove</Button>
                  </div>
                  {a.resolution === 'recovered' && (
                    <p className="mt-1 text-xs text-zinc-500">Link the payout that brought the money back; until then this booking shows a difference.</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {Math.abs(recon.unexplained) > TOLERANCE && (recon.received > 0 || recon.status === 'missing') && (
          <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Explain the difference</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">Reason
                <select className={cn(fieldClass, 'mt-1')} value={reason} onChange={e => setReason(e.target.value as AdjustmentReason)}>
                  {(Object.keys(REASON_LABELS) as AdjustmentReason[]).map(k => <option key={k} value={k}>{REASON_LABELS[k]}</option>)}
                </select>
              </label>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">Amount (negative if less was received)
                <input type="number" step="0.01" className={cn(fieldClass, 'mt-1 text-right')} value={amount} onChange={e => setAmount(Number(e.target.value) || 0)} />
              </label>
            </div>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">Note
              <input className={cn(fieldClass, 'mt-1')} maxLength={1000} placeholder="What happened, in a few words" value={note} onChange={e => setNote(e.target.value)} />
            </label>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="sr-only">Outcome</legend>
              <label className="flex items-center gap-2"><input type="radio" className="accent-emerald-600" checked={mode === 'accepted'} onChange={() => setMode('accepted')} /> Accept it</label>
              <label className="flex items-center gap-2"><input type="radio" className="accent-emerald-600" checked={mode === 'disputed'} onChange={() => setMode('disputed')} /> Dispute it with the platform</label>
            </fieldset>
            {mode === 'disputed' && (
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">Case or ticket number (optional)
                <input className={cn(fieldClass, 'mt-1')} maxLength={200} value={disputeRef} onChange={e => setDisputeRef(e.target.value)} />
              </label>
            )}
            <Button
              disabled={busy || !amount}
              onClick={() => run(async () => {
                await addAdjustment(orgId, {
                  reservation_id: res.reservation_code, payout_id: null, currency: bc, amount: Math.round(amount * 100) / 100,
                  reason, note: note.trim() || null, resolution: mode as Resolution, dispute_reference: mode === 'disputed' ? disputeRef.trim() || null : null,
                });
                setNote(''); setDisputeRef('');
              })}
            >
              {mode === 'accepted' ? 'Accept this difference' : 'Open a dispute'}
            </Button>
          </section>
        )}
        {err && <p className="text-sm text-rose-600" role="alert">{err}</p>}
      </div>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Payout: suggested matches and manual matching                       */
/* ------------------------------------------------------------------ */

const PayoutPanel: React.FC<{
  payout: Payout; data: UserData; finance: FinanceData; candidates: Candidate[]; orgId: string;
  rates: Rates; baseCurrency: string;
  onClose: () => void; onChanged: () => Promise<void>; onOpenBooking: (code: string) => void;
}> = ({ payout, data, finance, candidates, orgId, rates, baseCurrency, onClose, onChanged, onOpenBooking }) => {
  const pc = payout.currency || baseCurrency;
  const aed = (v: number) => money(v, pc);
  const pr = payoutRecon(payout, finance.allocations);
  const mine = finance.allocations.filter(a => a.payout_id === payout.id);
  const linked = new Set(mine.map(a => a.reservation_id));
  const open = candidates.filter(c => !linked.has(c.reservation_id));
  const listed = useMemo(() => {
    const codes = new Set(candidates.map(c => c.reservation_id));
    const text = `${payout.description ?? ''} ${payout.reference ?? ''}`;
    return [...new Set(text.split(/[^A-Za-z0-9_\-./#]+/).filter(t => codes.has(t)))].map(c => ({ reservation_code: c, amount: null }));
  }, [payout, candidates]);
  const suggestions = pr.status === 'matched' ? [] : suggestMatches({ ...payout, amount: pr.remaining }, open, listed);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); await onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const nameOf = (code: string) => data.reservations.find(r => r.reservation_code === code)?.guest_name ?? code;
  const searchHits = search.trim().length >= 2
    ? open.filter(c => `${c.reservation_id} ${c.guest_name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <Sheet open onClose={onClose} title={`${aed(payout.amount)} received ${day(payout.received_date)}`}
      description={[data.platforms.find(p => p.platform_id === payout.platform_id)?.name, payout.reference, payout.description].filter(Boolean).join(', ') || undefined}>
      <div className="space-y-6">
        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-850">
          <div><dt className="text-xs text-zinc-500">Payout</dt><dd className="font-semibold">{aed(payout.amount)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Matched</dt><dd className="font-semibold">{aed(pr.allocated)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Left to match</dt><dd className={cn('font-semibold', Math.abs(pr.remaining) > TOLERANCE ? 'text-amber-700' : 'text-emerald-700')}>{aed(pr.remaining)}</dd></div>
        </dl>

        {mine.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Covers</h3>
            <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {mine.map(a => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <button className="min-w-0 flex-1 text-left hover:underline" onClick={() => onOpenBooking(a.reservation_id)}>{nameOf(a.reservation_id)}, {a.reservation_id}</button>
                  <span className="font-medium">{aed(a.amount)}</span>
                  <button aria-label="Unlink" disabled={busy} onClick={() => run(() => removeAllocation(orgId, a.id))} className="rounded p-1 text-zinc-400 hover:text-rose-600"><X size={14} /></button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pr.status !== 'matched' && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Suggested matches</h3>
            {suggestions.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No booking on this platform is due near this date for this amount. Search for the booking below.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {suggestions.map((s, i) => (
                  <li key={i} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <p className="text-sm text-zinc-900 dark:text-zinc-100">{s.explanation}</p>
                    <ul className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {s.allocations.map(a => <li key={a.reservation_id}>{nameOf(a.reservation_id)}, {a.reservation_id}: {aed(a.amount)}</li>)}
                    </ul>
                    {Math.abs(s.difference) > TOLERANCE && (
                      <p className="mt-1.5 text-xs text-amber-700">{signed(s.difference, pc)} compared with what these bookings expected. You can explain it on each booking afterwards.</p>
                    )}
                    <Button size="sm" className="mt-2" disabled={busy} onClick={() => run(() => addAllocations(orgId, payout.id, s.allocations))}>
                      <CheckCircle2 size={13} /> Use this match
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {pr.status !== 'matched' && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Find a booking</h3>
            <input className={cn(fieldClass, 'mt-2')} placeholder="Guest name or reservation code" value={search} onChange={e => setSearch(e.target.value)} />
            <ul className="mt-2 space-y-1 text-sm">
              {searchHits.map(c => {
                const link = linkFor(payout, Math.abs(pr.remaining), c.currency || pc, Math.max(c.outstanding, 0), rates);
                return (
                  <li key={c.reservation_id} className="flex items-center justify-between gap-2">
                    <span className="text-zinc-700 dark:text-zinc-300">{c.guest_name}, {c.reservation_id}, due {day(c.expected_date)}, {money(c.outstanding, c.currency || pc)} outstanding</span>
                    {link ? (
                      <Button size="sm" variant="outline" disabled={busy || link.amount <= 0} onClick={() => run(() => addAllocations(orgId, payout.id, [{ reservation_id: c.reservation_id, ...link }]))}>
                        <Link2 size={12} /> Link {aed(link.amount)}
                      </Button>
                    ) : <span className="text-xs text-amber-700">No {pc}/{c.currency} rate yet</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {err && <p className="text-sm text-rose-600" role="alert">{err}</p>}
        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Button variant="ghost" size="sm" disabled={busy}
            onClick={() => { if (window.confirm('Delete this payout and its matches? Explanations on bookings stay.')) run(async () => { await deletePayout(orgId, payout.id); onClose(); }); }}>
            <Trash2 size={13} /> Delete payout
          </Button>
        </div>
      </div>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Adding payouts: by hand, from a bank statement, from a payout report */
/* ------------------------------------------------------------------ */

interface Draft {
  key: string;
  include: boolean;
  date: string;
  amount: number;          // in `currency`, as received
  original: number | null; // unused; kept for older drafts
  currency: string;
  platformId: string;
  reference: string;
  description: string;
  codes: { reservation_code: string; amount: number | null }[];
}

const AddPayouts: React.FC<{
  mode: 'manual' | 'bank_statement' | 'payout_report';
  data: UserData; orgId: string; candidates: Candidate[]; baseCurrency: string;
  onClose: () => void; onDone: () => Promise<void>;
}> = ({ mode, data, orgId, candidates, baseCurrency, onClose, onDone }) => {
  const known = (c: unknown) => (isSupportedCurrency(c as string) ? (c as string) : baseCurrency);
  const [drafts, setDrafts] = useState<Draft[]>(mode === 'manual'
    ? [{ key: 'm', include: true, date: format(new Date(), 'yyyy-MM-dd'), amount: 0, original: null, currency: baseCurrency, platformId: '', reference: '', description: '', codes: [] }]
    : []);
  const [doc, setDoc] = useState<SourceDocument | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const platformFor = (key: string) => {
    const map: Record<string, string[]> = { airbnb: ['airbnb'], booking: ['booking'], vrbo: ['vrbo'], expedia: ['expedia'] };
    return data.platforms.find(p => (map[key] ?? []).some(k => `${p.platform_id} ${p.name}`.toLowerCase().includes(k)))?.platform_id ?? '';
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    const problem = await fileProblem(file, true);
    if (problem) { setErr(problem); return; }
    setState('working');
    try {
      const up = await uploadDocument(orgId, file, mode as 'bank_statement' | 'payout_report');
      setDoc(up.doc);
      if (up.duplicate && up.doc.status === 'saved') setMsg('This file was imported before; payouts already saved are skipped.');
      const result = await readStoredDocument(orgId, up.doc);
      const rows: Draft[] = mode === 'bank_statement'
        ? result.rows.map((t: any, i: number) => ({
            key: `b${i}`, include: t.platform !== 'other', date: t.date,
            amount: r2(Number(t.amount) || 0), original: null, currency: known(t.currency),
            platformId: platformFor(t.platform), reference: t.reference, description: t.description, codes: [],
          }))
        : result.rows.map((p: any, i: number) => ({
            key: `r${i}`, include: true, date: p.date,
            amount: r2(Number(p.amount) || 0), original: null, currency: known(p.currency),
            platformId: platformFor(result.platform), reference: p.reference,
            description: p.items.length ? `Covers ${p.items.length} ${p.items.length === 1 ? 'booking' : 'bookings'}: ${p.items.map((x: any) => x.reservation_code).join(', ')}`.slice(0, 500) : '',
            codes: p.items.map((x: any) => ({ reservation_code: x.reservation_code, amount: x.amount === null ? null : r2(Number(x.amount)) })),
          }));
      setDrafts(rows);
      if (!rows.length) setErr(mode === 'bank_statement' ? 'No money received was found in this statement.' : 'No payouts were found in this report.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setState('idle');
      if (input.current) input.current.value = '';
    }
  };

  const update = (key: string, patch: Partial<Draft>) => setDrafts(list => list.map(d => (d.key === key ? { ...d, ...patch } : d)));
  const chosen = drafts.filter(d => d.include && d.amount !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date));

  const save = async () => {
    setState('working'); setErr(null);
    try {
      const rows: NewPayout[] = chosen.map(d => ({
        platform_id: d.platformId || null, received_date: d.date, amount: d.amount, currency: d.currency,
        reference: d.reference.trim() || null, description: d.description.trim() || null,
        source: mode, source_document_id: doc?.id ?? null,
      }));
      const { added, duplicates } = await addPayouts(orgId, rows);
      // Payout reports list the bookings each payout covers: match those straight away.
      let matched = 0;
      if (mode === 'payout_report') {
        for (const p of added) {
          const draft = chosen.find(d => d.date === p.received_date && d.amount === p.amount && (d.reference || null) === (p.reference ?? null));
          if (!draft?.codes.length) continue;
          const s = suggestMatches(p, candidates, draft.codes)[0];
          if (s?.kind === 'reference') { await addAllocations(orgId, p.id, s.allocations); matched++; }
        }
      }
      if (doc) await markDocumentSaved(orgId, doc.id, added.length);
      setMsg(`Added ${added.length} ${added.length === 1 ? 'payout' : 'payouts'}${duplicates ? `, skipped ${duplicates} already recorded` : ''}${mode === 'payout_report' ? `, matched ${matched} to bookings by reservation code` : ''}.`);
      setState('done');
      await onDone();
    } catch (e: any) {
      setErr(e.message);
      setState('idle');
    }
  };

  const title = mode === 'manual' ? 'Add a payout' : mode === 'bank_statement' ? 'Payouts from a bank statement' : 'Payouts from a platform payout report';
  const description = mode === 'manual' ? 'Money received from a platform, as it appears in your bank.'
    : mode === 'bank_statement' ? 'Upload the statement as PDF or CSV. Only money received is read; tick the deposits that came from booking platforms.'
    : 'Upload an Airbnb or Booking.com payout report. Bookings listed in it are matched by reservation code.';

  return (
    <Sheet open onClose={() => state !== 'working' && onClose()} title={title} description={description} width={mode === 'manual' ? 'md' : 'xl'}
      footer={state === 'done' ? <Button onClick={onClose}>Done</Button> : drafts.length > 0 && (
        <>
          <p className="mr-auto text-xs text-zinc-500">
            {chosen.length} selected
            {[...new Set(chosen.map(d => d.currency))].map(c => `, ${money(chosen.filter(d => d.currency === c).reduce((t, d) => t + d.amount, 0), c)}`).join('')}
          </p>
          <Button onClick={save} disabled={!chosen.length || state === 'working'}>
            {state === 'working' && <Loader2 size={14} className="animate-spin" />}
            Save {chosen.length === 1 ? 'payout' : `${chosen.length} payouts`}
          </Button>
        </>
      )}>
      <div className="space-y-5">
        {mode !== 'manual' && drafts.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <input ref={input} type="file" accept=".pdf,.csv,application/pdf,text/csv" className="hidden" onChange={e => pick(e.target.files?.[0])} />
            <Button variant="outline" disabled={state === 'working'} onClick={() => input.current?.click()}>
              {state === 'working' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {state === 'working' ? 'Reading the file…' : 'Choose a file'}
            </Button>
            <p className="mt-2 text-xs text-zinc-500">PDF or CSV, up to 20 MB. Stored privately; only owners and managers can open it.</p>
          </div>
        )}

        {mode === 'manual' && drafts[0] && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">Date received
              <input type="date" className={cn(fieldClass, 'mt-1')} value={drafts[0].date} onChange={e => update('m', { date: e.target.value })} />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">Amount received
              <div className="mt-1 flex gap-2">
                <select aria-label="Currency" className={cn(fieldClass, 'w-24')} value={drafts[0].currency} onChange={e => update('m', { currency: e.target.value })}>
                  {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" step="0.01" className={cn(fieldClass, 'text-right')} value={drafts[0].amount || ''} onChange={e => update('m', { amount: Number(e.target.value) || 0 })} />
              </div>
            </label>
            <label className="col-span-2 block text-xs text-zinc-600 dark:text-zinc-400">Platform
              <select className={cn(fieldClass, 'mt-1')} value={drafts[0].platformId} onChange={e => update('m', { platformId: e.target.value })}>
                <option value="">Choose</option>
                {data.platforms.map(p => <option key={p.platform_id} value={p.platform_id}>{p.name}</option>)}
              </select>
            </label>
            <label className="col-span-2 block text-xs text-zinc-600 dark:text-zinc-400">Bank or payout reference
              <input className={cn(fieldClass, 'mt-1')} maxLength={200} value={drafts[0].reference} onChange={e => update('m', { reference: e.target.value })} />
            </label>
            <label className="col-span-2 block text-xs text-zinc-600 dark:text-zinc-400">Reservation codes it covers (optional, separated by commas)
              <input className={cn(fieldClass, 'mt-1')} maxLength={500} value={drafts[0].description} onChange={e => update('m', { description: e.target.value })} />
            </label>
          </div>
        )}

        {mode !== 'manual' && drafts.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-850">
                <tr>
                  <th className="w-8 px-3 py-2"><span className="sr-only">Include</span></th>
                  <th className="px-2 py-2 text-left font-medium">Date</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 text-left font-medium">Platform</th>
                  <th className="px-2 py-2 text-left font-medium">{mode === 'payout_report' ? 'Covers' : 'Description'}</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map(d => (
                  <tr key={d.key} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-1.5"><input type="checkbox" className="accent-emerald-600" aria-label="Include" checked={d.include} onChange={e => update(d.key, { include: e.target.checked })} /></td>
                    <td className="px-2 py-1.5"><input type="date" className={cn(fieldClass, 'h-8')} value={d.date} onChange={e => update(d.key, { date: e.target.value })} /></td>
                    <td className="px-2 py-1.5">
                      <input type="number" step="0.01" className={cn(fieldClass, 'h-8 w-28 text-right')} value={d.amount} onChange={e => update(d.key, { amount: Number(e.target.value) || 0 })} />
                      <span className="block text-right text-[11px] text-zinc-500">{d.currency}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <select className={cn(fieldClass, 'h-8 min-w-[110px]')} value={d.platformId} onChange={e => update(d.key, { platformId: e.target.value })}>
                        <option value="">Unknown</option>
                        {data.platforms.map(p => <option key={p.platform_id} value={p.platform_id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="max-w-[360px] px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">{d.description || d.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {msg && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status">{msg}</p>}
        {err && <p className="flex items-center gap-2 text-sm text-rose-600" role="alert"><AlertTriangle size={14} /> {err}</p>}
      </div>
    </Sheet>
  );
};
