/**
 * Payout reconciliation: what each booking should pay out, what was received, and why they differ.
 * Pure functions, tested in tests/reconcile.test.ts. All amounts in AED.
 *
 *   difference  = received - expected
 *   explained   = sum of adjustments that are accepted, disputed or written off
 *   unexplained = difference - explained      (0 when the booking is reconciled)
 *
 * A "recovered" adjustment no longer counts: the money arrived in a later payout, which is
 * matched to the booking like any other payout.
 */
import { addDays, differenceInCalendarDays, format, getDay, parseISO, subDays } from 'date-fns';
import type { Platform, Reservation } from '../types';

export const TOLERANCE = 1; // AED rounding allowance

export type AdjustmentReason =
  | 'commission' | 'vat' | 'payment_fee' | 'exchange_rate' | 'refund' | 'guest_change'
  | 'damage_claim' | 'tax_withheld' | 'ota_error' | 'other';
export type Resolution = 'accepted' | 'disputed' | 'recovered' | 'written_off';

export const REASON_LABELS: Record<AdjustmentReason, string> = {
  commission: 'Platform commission',
  vat: 'VAT on commission',
  payment_fee: 'Payment processing fee',
  exchange_rate: 'Exchange rate',
  refund: 'Refund to guest',
  guest_change: 'Guest changed or shortened the stay',
  damage_claim: 'Damage or resolution claim',
  tax_withheld: 'Tax withheld',
  ota_error: 'Platform error (to recover)',
  other: 'Other',
};

export interface Payout {
  id: string;
  platform_id: string | null;
  received_date: string;
  amount_aed: number;
  reference?: string | null;
  description?: string | null;
  source: 'bank_statement' | 'payout_report' | 'manual';
}
export interface Allocation { id?: string; payout_id: string; reservation_id: string; amount_aed: number }
export interface Adjustment {
  id?: string;
  reservation_id: string | null;
  payout_id: string | null;
  amount_aed: number;
  reason: AdjustmentReason;
  note?: string | null;
  resolution: Resolution;
  dispute_reference?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0) / 100;

/* ---------- expected payout ---------- */

export interface ExpectedPayout {
  gross: number;
  lines: { label: string; amount: number }[]; // deductions as negative amounts
  expected: number;
  basis: 'stated' | 'calculated';
}

export function findPlatform(res: Pick<Reservation, 'platform_id' | 'channel'>, platforms: Platform[]) {
  return platforms.find(p => p.platform_id === res.platform_id) ?? platforms.find(p => p.name === res.channel) ?? null;
}

/**
 * Expected payout for a booking. When the platform stated the host payout (from the PDF or
 * entered by hand) that figure is used; the platform's rates explain the gap from the guest total.
 */
export function expectedPayout(res: Reservation, platform: Platform | null): ExpectedPayout {
  const gross = round2(Number(res.total_booking_revenue_aed) || 0);
  const commission = round2(gross * pct(platform?.commission_percent));
  const vat = round2(commission * pct(platform?.vat_percent));
  const payment = round2(gross * pct(platform?.payment_charge_percent));
  const other = round2(gross * pct(platform?.other_charges_percent));
  const lines = [
    { label: 'Platform commission', amount: -commission },
    { label: 'VAT on commission', amount: -vat },
    { label: 'Payment processing', amount: -payment },
    { label: 'Other platform charges', amount: -other },
  ].filter(l => Math.abs(l.amount) >= 0.01);

  const stated = Number(res.net_payout_aed) || 0;
  if (stated > 0) {
    const explainedByRates = lines.reduce((t, l) => t + l.amount, 0);
    const rest = round2(stated - gross - explainedByRates);
    if (gross > 0 && Math.abs(rest) > TOLERANCE) {
      lines.push({ label: rest < 0 ? 'Other deductions shown by the platform' : 'Other additions shown by the platform', amount: rest });
    }
    return { gross, lines, expected: round2(stated), basis: 'stated' };
  }
  const expected = round2(gross + lines.reduce((t, l) => t + l.amount, 0));
  return { gross, lines, expected, basis: 'calculated' };
}

/** When the payout should arrive, from the platform's payout rules. */
export function expectedPayoutDate(res: Reservation, platform: Platform | null): string {
  if (res.payout_date) return res.payout_date;
  if (!platform || !res.check_in || !res.check_out) return res.check_out || res.check_in;
  const checkIn = parseISO(res.check_in);
  const checkOut = parseISO(res.check_out);
  let base: Date;
  switch (platform.payout_timing) {
    case 'before_checkin': base = subDays(checkIn, platform.payout_days_offset); break;
    case 'after_checkin': base = addDays(checkIn, platform.payout_days_offset); break;
    case 'after_checkout': base = addDays(checkOut, platform.payout_days_offset); break;
    case 'next_specific_day': {
      const target = platform.payout_day_of_week ?? 4;
      const start = addDays(checkOut, platform.payout_days_offset);
      let add = (target - getDay(start) + 7) % 7;
      if (add === 0) add = 7;
      base = addDays(start, add);
      break;
    }
    default: base = checkOut;
  }
  return format(addDays(base, platform.processing_days || 0), 'yyyy-MM-dd');
}

/* ---------- status of a booking ---------- */

export type BookingStatus = 'awaiting' | 'missing' | 'difference' | 'disputed' | 'reconciled' | 'not_due';

export interface BookingRecon {
  expected: number;
  expectedDate: string;
  received: number;
  difference: number;
  explained: number;
  unexplained: number;
  openDisputes: number;   // amount still being disputed
  status: BookingStatus;
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  awaiting: 'Not due yet',
  missing: 'Payout missing',
  difference: 'Difference to explain',
  disputed: 'In dispute',
  reconciled: 'Reconciled',
  not_due: 'Nothing expected',
};

export function bookingRecon(
  res: Reservation,
  platform: Platform | null,
  allocations: Allocation[],
  adjustments: Adjustment[],
  today: string,
): BookingRecon {
  const exp = expectedPayout(res, platform);
  const expectedDate = expectedPayoutDate(res, platform);
  const mine = allocations.filter(a => a.reservation_id === res.reservation_code);
  const adj = adjustments.filter(a => a.reservation_id === res.reservation_code);
  const received = round2(mine.reduce((t, a) => t + a.amount_aed, 0));
  const expected = res.status === 'cancelled' ? 0 : exp.expected;
  const difference = round2(received - expected);
  const counted = adj.filter(a => a.resolution !== 'recovered');
  const explained = round2(counted.reduce((t, a) => t + a.amount_aed, 0));
  const unexplained = round2(difference - explained);
  const openDisputes = round2(adj.filter(a => a.resolution === 'disputed').reduce((t, a) => t + a.amount_aed, 0));

  let status: BookingStatus;
  if (expected === 0 && received === 0 && counted.length === 0) status = 'not_due';
  else if (Math.abs(unexplained) <= TOLERANCE) status = Math.abs(openDisputes) > 0 ? 'disputed' : 'reconciled';
  else if (received === 0 && Math.abs(explained) === 0) status = expectedDate > today ? 'awaiting' : 'missing';
  else status = 'difference';

  return { expected, expectedDate, received, difference, explained, unexplained, openDisputes, status };
}

/* ---------- status of a payout ---------- */

export type PayoutStatus = 'unmatched' | 'partly_matched' | 'matched';

export function payoutRecon(payout: Payout, allocations: Allocation[]) {
  const allocated = round2(allocations.filter(a => a.payout_id === payout.id).reduce((t, a) => t + a.amount_aed, 0));
  const remaining = round2(payout.amount_aed - allocated);
  const status: PayoutStatus = allocated === 0 ? 'unmatched' : Math.abs(remaining) <= TOLERANCE ? 'matched' : 'partly_matched';
  return { allocated, remaining, status };
}

/* ---------- match suggestions ---------- */

export interface Candidate {
  reservation_id: string;
  guest_name?: string;
  platform_id: string | null;
  expected_date: string;
  outstanding: number; // expected minus already received
}

export interface Suggestion {
  kind: 'reference' | 'exact' | 'combination' | 'close';
  allocations: { reservation_id: string; amount_aed: number }[];
  difference: number; // payout amount minus what the bookings expected
  explanation: string;
}

const WINDOW_BEFORE = 14; // days a payout may arrive before the expected date
const WINDOW_AFTER = 30;  // and after it

/**
 * Suggests which bookings a payout covers, best first:
 *  1. reservation codes listed for the payout (from an OTA payout report)
 *  2. one booking whose outstanding amount equals the payout
 *  3. several bookings that add up to the payout (batched payouts, e.g. Booking.com)
 *  4. the closest single booking, with the difference left to explain
 */
export function suggestMatches(
  payout: Payout,
  candidates: Candidate[],
  listedCodes: { reservation_code: string; amount: number | null }[] = [],
): Suggestion[] {
  const amount = payout.amount_aed;
  const tol = Math.max(TOLERANCE, Math.abs(amount) * 0.001);
  const out: Suggestion[] = [];

  if (listedCodes.length) {
    const byCode = new Map(candidates.map(c => [c.reservation_id, c]));
    const found = listedCodes.filter(l => byCode.has(l.reservation_code));
    if (found.length) {
      const allocations = found.map(l => ({
        reservation_id: l.reservation_code,
        amount_aed: round2(l.amount ?? byCode.get(l.reservation_code)!.outstanding),
      }));
      const total = allocations.reduce((t, a) => t + a.amount_aed, 0);
      const expectedTotal = found.reduce((t, l) => t + byCode.get(l.reservation_code)!.outstanding, 0);
      fitToAmount(allocations, amount);
      out.push({
        kind: 'reference',
        allocations,
        difference: round2(amount - expectedTotal),
        explanation: `${found.length} of ${listedCodes.length} reservation codes in the payout report match your bookings` +
          (Math.abs(total - amount) > tol ? '; amounts adjusted to the payout total' : ''),
      });
      return out;
    }
  }

  const pool = candidates
    .filter(c => c.outstanding > 0 && (!payout.platform_id || !c.platform_id || c.platform_id === payout.platform_id))
    .map(c => ({ c, gap: differenceInCalendarDays(parseISO(payout.received_date), parseISO(c.expected_date)) }))
    .filter(x => x.gap >= -WINDOW_BEFORE && x.gap <= WINDOW_AFTER)
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));

  const exact = pool.filter(x => Math.abs(x.c.outstanding - amount) <= tol);
  if (exact.length) {
    const best = exact[0].c;
    out.push({
      kind: 'exact',
      allocations: [{ reservation_id: best.reservation_id, amount_aed: round2(amount) }],
      difference: round2(amount - best.outstanding),
      explanation: exact.length > 1
        ? `${exact.length} bookings expect this amount; the one due closest to the payout date is suggested`
        : 'Amount matches the expected payout',
    });
  }

  const combo = findCombination(pool.slice(0, 18).map(x => x.c), amount, tol);
  if (combo && combo.length > 1) {
    const allocations = combo.map(c => ({ reservation_id: c.reservation_id, amount_aed: round2(c.outstanding) }));
    const expectedTotal = allocations.reduce((t, a) => t + a.amount_aed, 0);
    fitToAmount(allocations, amount);
    out.push({
      kind: 'combination',
      allocations,
      difference: round2(amount - expectedTotal),
      explanation: `${combo.length} bookings add up to this payout`,
    });
  }

  if (!out.length && pool.length) {
    const nearest = [...pool].sort((a, b) => Math.abs(a.c.outstanding - amount) - Math.abs(b.c.outstanding - amount))[0].c;
    const diff = round2(amount - nearest.outstanding);
    if (Math.abs(diff) <= Math.max(50, nearest.outstanding * 0.25)) {
      out.push({
        kind: 'close',
        allocations: [{ reservation_id: nearest.reservation_id, amount_aed: round2(amount) }],
        difference: diff,
        explanation: `Closest booking: AED ${Math.abs(diff).toFixed(2)} ${diff < 0 ? 'less' : 'more'} than expected`,
      });
    }
  }
  return out;
}

/** Spread a small rounding gap onto the last allocation so allocations equal the payout exactly. */
function fitToAmount(allocations: { amount_aed: number }[], amount: number) {
  const total = allocations.reduce((t, a) => t + a.amount_aed, 0);
  const gap = round2(amount - total);
  if (allocations.length && Math.abs(gap) <= Math.max(TOLERANCE, Math.abs(amount) * 0.001)) {
    allocations[allocations.length - 1].amount_aed = round2(allocations[allocations.length - 1].amount_aed + gap);
  }
}

/** Smallest set of bookings whose outstanding amounts sum to the target, within tolerance. */
export function findCombination(items: Candidate[], target: number, tol: number, maxSteps = 200_000): Candidate[] | null {
  const sorted = [...items].sort((a, b) => b.outstanding - a.outstanding);
  const suffix = sorted.map((_, i) => sorted.slice(i).reduce((t, c) => t + c.outstanding, 0));
  let best: Candidate[] | null = null;
  let steps = 0;
  const pick: Candidate[] = [];
  const walk = (i: number, sum: number) => {
    if (++steps > maxSteps) return;
    if (Math.abs(sum - target) <= tol && pick.length > 0) {
      if (!best || pick.length < best.length) best = [...pick];
      return;
    }
    if (i >= sorted.length || sum > target + tol || sum + suffix[i] < target - tol) return;
    if (best && pick.length + 1 >= best.length) return;
    pick.push(sorted[i]);
    walk(i + 1, sum + sorted[i].outstanding);
    pick.pop();
    walk(i + 1, sum);
  };
  walk(0, 0);
  return best;
}
