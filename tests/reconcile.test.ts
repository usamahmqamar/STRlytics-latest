/**
 * Payout reconciliation tests. Run with: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingRecon, expectedPayout, expectedPayoutDate, findCombination, payoutRecon, suggestMatches,
  type Adjustment, type Allocation, type Candidate, type Payout,
} from '../src/lib/reconcile';
import type { Platform, Reservation } from '../src/types';

const airbnb: Platform = {
  platform_id: 'airbnb', name: 'Airbnb', commission_percent: 3, vat_percent: 5, other_charges_percent: 0,
  payout_timing: 'after_checkin', payout_days_offset: 1, processing_days: 0,
};
const booking: Platform = {
  platform_id: 'booking', name: 'Booking.com', commission_percent: 15, vat_percent: 5, other_charges_percent: 0,
  payment_charge_percent: 1.5, payout_timing: 'next_specific_day', payout_day_of_week: 4, payout_days_offset: 0, processing_days: 0,
};
const res = (o: Partial<Reservation>): Reservation => ({
  reservation_code: 'R1', apartment_id: 'a1', platform_id: 'airbnb', channel: 'Airbnb', guest_name: 'Guest',
  check_in: '2026-03-01', check_out: '2026-03-04', num_guests: 2, nights: 3,
  total_booking_revenue_aed: 1000, net_payout_aed: 0, cleaning_cost_aed: 0, status: 'confirmed',
  cancellation_policy: 'refundable', booking_date: '2026-02-01', ...o,
});
const TODAY = '2026-03-20';

test('expected payout is calculated from the platform rates', () => {
  const e = expectedPayout(res({}), airbnb);
  // commission 3% of 1000 = 30; VAT 5% of 30 = 1.5; expected 968.50
  assert.equal(e.basis, 'calculated');
  assert.equal(e.expected, 968.5);
  assert.deepEqual(e.lines.map(l => l.amount), [-30, -1.5]);
});

test('a payout stated by the platform wins, and the gap is shown as its own line', () => {
  const e = expectedPayout(res({ net_payout_aed: 950 }), airbnb);
  assert.equal(e.basis, 'stated');
  assert.equal(e.expected, 950);
  // 1000 - 30 - 1.5 = 968.5; the platform shows 950, so 18.50 more was deducted
  assert.equal(e.lines.at(-1)!.amount, -18.5);
  assert.equal(e.gross + e.lines.reduce((t, l) => t + l.amount, 0), 950);
});

test('payout dates follow each platform rule', () => {
  assert.equal(expectedPayoutDate(res({}), airbnb), '2026-03-02');
  // Booking.com: the Thursday after checkout (Wed 4 Mar 2026) is 5 Mar
  assert.equal(expectedPayoutDate(res({ platform_id: 'booking' }), booking), '2026-03-05');
  assert.equal(expectedPayoutDate(res({ payout_date: '2026-03-09' }), airbnb), '2026-03-09');
});

test('booking statuses', () => {
  const r = res({ net_payout_aed: 950 });
  const alloc = (amount: number): Allocation[] => [{ payout_id: 'p1', reservation_id: 'R1', amount_aed: amount }];
  assert.equal(bookingRecon(r, airbnb, [], [], '2026-02-20').status, 'awaiting');
  assert.equal(bookingRecon(r, airbnb, [], [], TODAY).status, 'missing');
  assert.equal(bookingRecon(r, airbnb, alloc(950), [], TODAY).status, 'reconciled');
  assert.equal(bookingRecon(r, airbnb, alloc(950.6), [], TODAY).status, 'reconciled'); // within 1 AED
  const short = bookingRecon(r, airbnb, alloc(900), [], TODAY);
  assert.equal(short.status, 'difference');
  assert.equal(short.unexplained, -50);
});

test('explaining a difference reconciles it; disputing keeps it open', () => {
  const r = res({ net_payout_aed: 950 });
  const alloc: Allocation[] = [{ payout_id: 'p1', reservation_id: 'R1', amount_aed: 900 }];
  const fee: Adjustment = { reservation_id: 'R1', payout_id: null, amount_aed: -50, reason: 'payment_fee', resolution: 'accepted' };
  assert.equal(bookingRecon(r, airbnb, alloc, [fee], TODAY).status, 'reconciled');
  const disputed = bookingRecon(r, airbnb, alloc, [{ ...fee, reason: 'ota_error', resolution: 'disputed' }], TODAY);
  assert.equal(disputed.status, 'disputed');
  assert.equal(disputed.openDisputes, -50);
  assert.equal(disputed.unexplained, 0);
});

test('a recovered dispute is settled by the later payout', () => {
  const r = res({ net_payout_aed: 950 });
  const recovered: Adjustment = { reservation_id: 'R1', payout_id: null, amount_aed: -50, reason: 'ota_error', resolution: 'recovered' };
  const allocs: Allocation[] = [
    { payout_id: 'p1', reservation_id: 'R1', amount_aed: 900 },
    { payout_id: 'p2', reservation_id: 'R1', amount_aed: 50 },
  ];
  assert.equal(bookingRecon(r, airbnb, allocs, [recovered], TODAY).status, 'reconciled');
  // but if the recovery payout never came, the booking shows a difference again
  assert.equal(bookingRecon(r, airbnb, allocs.slice(0, 1), [recovered], TODAY).status, 'difference');
});

test('a cancelled booking expects nothing; a refund explains money kept', () => {
  const r = res({ status: 'cancelled', net_payout_aed: 950 });
  assert.equal(bookingRecon(r, airbnb, [], [], TODAY).status, 'not_due');
  const kept = bookingRecon(r, airbnb, [{ payout_id: 'p1', reservation_id: 'R1', amount_aed: 200 }], [], TODAY);
  assert.equal(kept.status, 'difference'); // a cancellation fee arrived and needs a reason
});

test('payout statuses', () => {
  const p: Payout = { id: 'p1', platform_id: 'airbnb', received_date: '2026-03-02', amount_aed: 1000, source: 'manual' };
  assert.equal(payoutRecon(p, []).status, 'unmatched');
  assert.equal(payoutRecon(p, [{ payout_id: 'p1', reservation_id: 'R1', amount_aed: 600 }]).status, 'partly_matched');
  assert.equal(payoutRecon(p, [{ payout_id: 'p1', reservation_id: 'R1', amount_aed: 999.5 }]).status, 'matched');
});

const cand = (id: string, outstanding: number, expected_date = '2026-03-05', platform_id = 'booking'): Candidate =>
  ({ reservation_id: id, outstanding, expected_date, platform_id });

test('suggests the booking with the exact amount, nearest date first', () => {
  const p: Payout = { id: 'p', platform_id: 'booking', received_date: '2026-03-05', amount_aed: 812.4, source: 'bank_statement' };
  const s = suggestMatches(p, [cand('A', 500), cand('B', 812.4, '2026-03-20'), cand('C', 812.4, '2026-03-06')]);
  assert.equal(s[0].kind, 'exact');
  assert.equal(s[0].allocations[0].reservation_id, 'C');
});

test('finds batched payouts that cover several bookings', () => {
  const p: Payout = { id: 'p', platform_id: 'booking', received_date: '2026-03-12', amount_aed: 2150, source: 'bank_statement' };
  const s = suggestMatches(p, [cand('A', 700), cand('B', 1000), cand('C', 450), cand('D', 333)]);
  const combo = s.find(x => x.kind === 'combination')!;
  assert.deepEqual(combo.allocations.map(a => a.reservation_id).sort(), ['A', 'B', 'C']);
  assert.equal(combo.allocations.reduce((t, a) => t + a.amount_aed, 0), 2150);
});

test('ignores other platforms and bookings far from the payout date', () => {
  const p: Payout = { id: 'p', platform_id: 'booking', received_date: '2026-03-05', amount_aed: 500, source: 'bank_statement' };
  const s = suggestMatches(p, [cand('A', 500, '2026-03-05', 'airbnb'), cand('B', 500, '2025-12-01')]);
  assert.equal(s.length, 0);
});

test('payout report codes take priority and carry their own amounts', () => {
  const p: Payout = { id: 'p', platform_id: 'booking', received_date: '2026-03-12', amount_aed: 1680, source: 'payout_report' };
  const s = suggestMatches(p, [cand('X1', 1000), cand('X2', 700)], [{ reservation_code: 'X1', amount: 990 }, { reservation_code: 'X2', amount: 690 }]);
  assert.equal(s[0].kind, 'reference');
  assert.deepEqual(s[0].allocations, [{ reservation_id: 'X1', amount_aed: 990 }, { reservation_id: 'X2', amount_aed: 690 }]);
  assert.equal(s[0].difference, -20); // 20 less than the bookings expected, to be explained
});

test('a close but not exact match is offered with its difference', () => {
  const p: Payout = { id: 'p', platform_id: 'airbnb', received_date: '2026-03-02', amount_aed: 930, source: 'bank_statement' };
  const s = suggestMatches(p, [cand('A', 968.5, '2026-03-02', 'airbnb')]);
  assert.equal(s[0].kind, 'close');
  assert.equal(s[0].difference, -38.5);
});

test('combination search prefers fewer bookings and stays bounded', () => {
  const items = [cand('A', 100), cand('B', 200), cand('C', 300), cand('D', 600)];
  assert.deepEqual(findCombination(items, 600, 1)!.map(c => c.reservation_id), ['D']);
  const many = Array.from({ length: 40 }, (_, i) => cand(`R${i}`, 101 + i * 7));
  const t0 = Date.now();
  findCombination(many, 99_999, 1);
  assert.ok(Date.now() - t0 < 2000, 'search is capped');
});
