/**
 * Daily P&L tests. Run with: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDailyPL, rentForDay, tenanciesOf } from '../src/lib/pl';
import { getMonthlyKPIs } from '../src/services/analytics';
import type { Apartment, Reservation, UserData } from '../src/types';

const apt = (o: Partial<Apartment> = {}): Apartment => ({
  apartment_id: 'a1', name: 'Marina 1BR', nickname: '', building: '', address: '', specification: '1BR',
  measurement_sqft: 700, start_operation_date: '2026-01-01', tenancy_end_date: '2026-12-31',
  annual_rent: 109_500, monthly_rent: 9_125, num_cheques: 4, rent_cheques: [],
  utilities_monthly_defaults: { electricity: 620, internet: 310 }, setup_costs: [], currency: 'AED',
  status: 'active', ...o,
});
const booking = (o: Partial<Reservation> = {}): Reservation => ({
  reservation_code: 'R1', apartment_id: 'a1', platform_id: 'airbnb', channel: 'Airbnb', guest_name: 'G',
  check_in: '2026-01-30', check_out: '2026-02-02', num_guests: 2, nights: 3,
  total_booking_revenue: 3300, net_payout: 3000, cleaning_cost: 150, status: 'confirmed',
  cancellation_policy: 'refundable', booking_date: '2026-01-01', ...o,
});
const data = (o: Partial<UserData> = {}): UserData => ({
  apartments: [apt()], reservations: [], platforms: [], monthlyBills: [], dailyExpenses: [], ...o,
} as unknown as UserData);
const d = (s: string) => new Date(`${s}T00:00:00`);
const close = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('daily rent is the same in January and February (annual rent / days in the lease year)', () => {
  const rows = calculateDailyPL(data(), d('2026-01-31'), d('2026-02-01'));
  close(rows[0].daily_rent, 300); // 109,500 / 365
  close(rows[1].daily_rent, 300);
});

test('a lease year with 29 February has 366 days', () => {
  const t = tenanciesOf(apt({ start_operation_date: '2027-06-01', tenancy_end_date: '2028-05-31', annual_rent: 109_800 }));
  close(rentForDay(t, '2028-02-29', false)!, 300); // 109,800 / 366
});

test('no rent or default utilities before the unit starts or after it is terminated', () => {
  const rows = calculateDailyPL(
    data({ apartments: [apt({ start_operation_date: '2026-03-10', status: 'terminated', tenancy_end_date: '2026-03-12',
      tenancy_history: [{ tenancy_id: 'h', start_date: '2026-03-10', end_date: '2026-03-12', status: 'terminated',
        annual_rent: 109_500, monthly_rent: 9125, num_cheques: 1, total_revenue: 0, total_expenses: 0,
        net_payout: 0, net_profit: 0, occupancy_rate: 0, num_reservations: 0 }] })] }),
    d('2026-03-09'), d('2026-03-13'),
  );
  assert.deepEqual(rows.map(r => r.operating), [false, true, true, true, false]);
  assert.equal(rows[0].total_daily_cost, 0);
  assert.equal(rows[4].daily_rent, 0);
  close(rows[1].daily_electricity, 20); // 620 / 31 days in March
});

test('after a renewal, past months keep the old rent', () => {
  const renewed = apt({
    start_operation_date: '2027-01-01', tenancy_end_date: '2027-12-31', annual_rent: 146_000,
    tenancy_history: [{ tenancy_id: 'h1', start_date: '2026-01-01', end_date: '2026-12-31', status: 'expired',
      annual_rent: 109_500, monthly_rent: 9125, num_cheques: 4, total_revenue: 0, total_expenses: 0,
      net_payout: 0, net_profit: 0, occupancy_rate: 0, num_reservations: 0 }],
  });
  const rows = calculateDailyPL(data({ apartments: [renewed] }), d('2026-12-31'), d('2027-01-01'));
  close(rows[0].daily_rent, 300); // old lease
  close(rows[1].daily_rent, 400); // 146,000 / 365
});

test('an active unit past its end date keeps paying rent (holdover)', () => {
  const rows = calculateDailyPL(data({ apartments: [apt({ tenancy_end_date: '2026-06-30' })] }), d('2026-07-01'), d('2026-07-01'));
  assert.equal(rows[0].operating, true);
  close(rows[0].daily_rent, 300);
});

test('booking revenue is spread over the nights stayed, not the check-out day', () => {
  const rows = calculateDailyPL(data({ reservations: [booking()] }), d('2026-01-30'), d('2026-02-02'));
  assert.deepEqual(rows.map(r => r.occupied), ['yes', 'yes', 'yes', 'no']);
  close(rows[0].daily_revenue, 1000);
  close(rows[0].cleaning_allocated, 50);
  close(rows[3].daily_revenue, 0);
});

test('nights come from the dates even if the stored night count is wrong', () => {
  const rows = calculateDailyPL(data({ reservations: [booking({ nights: 10 })] }), d('2026-01-30'), d('2026-01-30'));
  close(rows[0].daily_revenue, 1000);
});

test('cancellations: non-refundable payout is kept as revenue, refundable is lost', () => {
  const rows = calculateDailyPL(data({ reservations: [
    booking({ reservation_code: 'N', status: 'cancelled', cancellation_policy: 'non-refundable' }),
    booking({ reservation_code: 'F', status: 'cancelled', cancellation_policy: 'refundable', check_in: '2026-03-01', check_out: '2026-03-03', net_payout: 800 }),
  ] }), d('2026-01-30'), d('2026-03-01'));
  const jan30 = rows.find(r => r.date === '2026-01-30')!;
  assert.equal(jan30.occupied, 'no');
  close(jan30.retained_revenue, 1000);
  close(jan30.daily_revenue, 1000);
  const mar1 = rows.find(r => r.date === '2026-03-01')!;
  close(mar1.lost_revenue, 400);
  close(mar1.daily_revenue, 0);
});

test('a recorded bill replaces the default for that month', () => {
  const rows = calculateDailyPL(data({ monthlyBills: [{ bill_id: 'b', apartment_id: 'a1', month: '2026-02', bill_type: 'electricity', amount: 280 } as any] }),
    d('2026-02-01'), d('2026-02-01'));
  close(rows[0].daily_electricity, 10); // 280 / 28
});

test('portfolio expenses are shared equally across units, even when one unit is shown', () => {
  const two = [apt(), apt({ apartment_id: 'a2', name: 'Downtown 2BR' })];
  const exp = [{ expense_id: 'e', apartment_id: 'PORTFOLIO', date: '2026-01-05', amount: 200 } as any,
               { expense_id: 'f', apartment_id: 'a2', date: '2026-01-05', amount: 75 } as any];
  const rows = calculateDailyPL(data({ apartments: two, dailyExpenses: exp }), d('2026-01-05'), d('2026-01-05'), 'a2');
  assert.equal(rows.length, 1);
  close(rows[0].real_time_expenses, 175);
});

test('occupancy counts only nights the unit was operating', () => {
  const mid = apt({ start_operation_date: '2026-04-16', tenancy_end_date: '2027-04-15' });
  const k = getMonthlyKPIs(data({ apartments: [mid], reservations: [booking({ check_in: '2026-04-20', check_out: '2026-04-25' })] }), '2026-04');
  const unit = k.find((s: any) => s.entity === 'Marina 1BR')!;
  assert.equal(unit.available_nights, 15); // 16 to 30 April
  assert.equal(unit.occupied_nights, 5);
  close(unit.occupancy_rate, 5 / 15);
});

test('profit adds up across a month', () => {
  const rows = calculateDailyPL(data({ reservations: [booking({ check_in: '2026-02-01', check_out: '2026-02-11', net_payout: 10_000, cleaning_cost: 200 })] }),
    d('2026-02-01'), d('2026-02-28'));
  const profit = rows.reduce((t, r) => t + r.daily_profit, 0);
  // 10,000 revenue - rent 28 x 300 - utilities 620 + 310 - cleaning 200
  close(profit, 10_000 - 8_400 - 930 - 200, 0.05);
});
