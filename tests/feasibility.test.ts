/**
 * Feasibility model tests: each expected number is worked out by hand in the comment beside it.
 * Run with: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFeasibility, chequeMonths, isReady, sensitivity, type FeasibilityInputs } from '../src/lib/feasibility';

// A plain year (2027 is not a leap year) with no percentage fees, to make the arithmetic easy to check.
const base: FeasibilityInputs = {
  startMonth: '2027-01',
  nightlyRate: 500,
  occupancy: 80,
  seasonality: null,
  annualRent: 100_000,
  cheques: 4,
  depositPercent: 5,
  setupCost: 40_000,
  monthlyRunningCosts: 1_000,
  platformFeePercent: 0,
  managementFeePercent: 0,
  cleaningPerStay: 0,
  averageStayNights: 4,
  perNightCharges: 0,
  yearlyLicences: 0,
  targetProfit: 50_000,
};
const close = (a: number | null, b: number, tol = 0.5) => assert.ok(a !== null && Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('a simple year adds up', () => {
  const r = calculateFeasibility(base);
  // 365 days x 80% = 292 nights; 292 x 500 = 146,000
  close(r.bookedNights, 292, 0.01);
  close(r.revenue, 146_000);
  // 146,000 - rent 100,000 - running 12,000 = 34,000
  close(r.operatingProfit, 34_000);
  close(r.firstYearProfit, -6_000);
  // Upfront: setup 40,000 + deposit 5,000 + first of 4 cheques 25,000 = 70,000
  close(r.upfrontCash, 70_000);
  // 34,000 / 70,000 = 48.6%
  close(r.returnOnCash, 48.57, 0.05);
});

test('monthly rows add up to the yearly totals', () => {
  const r = calculateFeasibility({ ...base, platformFeePercent: 15, cleaningPerStay: 150, perNightCharges: 15 });
  const monthsRevenue = r.months.reduce((t, m) => t + m.revenue, 0);
  const monthsProfit = r.months.reduce((t, m) => t + m.profit, 0);
  close(monthsRevenue, r.revenue);
  close(monthsProfit, r.operatingProfit, 1);
});

test('seasonality moves money between months but keeps the yearly average', () => {
  const season = Array.from({ length: 12 }, (_, k) => ({ adr: k < 3 ? 1.4 : 0.9, occ: k < 3 ? 1.15 : 0.95 }));
  const flat = calculateFeasibility(base);
  const seasonal = calculateFeasibility({ ...base, seasonality: season });
  close(seasonal.revenue, flat.revenue, 50);
  assert.ok(seasonal.months[0].revenue > seasonal.months[6].revenue, 'January should earn more than July');
  assert.ok(seasonal.months.every(m => m.occupancy <= 98), 'occupancy is capped');
});

test('fees and per-stay costs reduce profit as expected', () => {
  const r = calculateFeasibility({ ...base, platformFeePercent: 15, managementFeePercent: 20, cleaningPerStay: 200, averageStayNights: 4, perNightCharges: 10 });
  // platform 15% of 146,000 = 21,900; management 20% of 124,100 = 24,820
  close(r.platformFees, 21_900);
  close(r.managementFees, 24_820);
  // cleaning 200 / 4 nights x 292 = 14,600; per night 10 x 292 = 2,920
  close(r.cleaning, 14_600);
  close(r.perNight, 2_920);
  close(r.operatingProfit, 146_000 - 21_900 - 24_820 - 14_600 - 2_920 - 100_000 - 12_000);
});

test('break-even occupancy and rates', () => {
  const r = calculateFeasibility(base);
  // fixed 112,000 / 500 per night = 224 nights; 224 / 365 = 61.4%
  close(r.breakEvenOccupancy, 61.37, 0.05);
  // at 292 nights: 112,000 / 292 = 383.56
  close(r.breakEvenRate, 383.56, 0.05);
  // target 50,000: 162,000 / 292 = 554.79
  close(r.targetRate, 554.79, 0.05);
});

test('break-even rate accounts for percentage fees', () => {
  const r = calculateFeasibility({ ...base, platformFeePercent: 20 });
  // need 112,000 / 292 = 383.56 kept per night; kept share 80% => 479.45
  close(r.breakEvenRate, 479.45, 0.05);
  // and at that rate the model really does break even
  const check = calculateFeasibility({ ...base, platformFeePercent: 20, nightlyRate: r.breakEvenRate! });
  close(check.operatingProfit, 0, 2);
});

test('rent cheques are paid on schedule and drive the cash curve', () => {
  assert.deepEqual(chequeMonths(1), [0]);
  assert.deepEqual(chequeMonths(4), [0, 3, 6, 9]);
  assert.deepEqual(chequeMonths(6), [0, 2, 4, 6, 8, 10]);
  const r = calculateFeasibility(base);
  assert.deepEqual(r.months.map(m => (m.rentPaid > 0 ? 1 : 0)), [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0]);
  // Before rent: January (31 nights x 80% x 500 = 12,400) - running 1,000 - cheque 25,000; starts at -45,000
  close(r.months[0].cumulativeCash, -45_000 + 12_400 - 1_000 - 25_000, 1);
  // One cheque up front needs more cash at the start than four
  const oneCheque = calculateFeasibility({ ...base, cheques: 1 });
  assert.ok(oneCheque.upfrontCash > r.upfrontCash);
});

test('verdicts follow the stated rules', () => {
  assert.equal(calculateFeasibility(base).verdict.level, 'marginal'); // cash back after month 12
  assert.equal(calculateFeasibility({ ...base, nightlyRate: 700, setupCost: 20_000 }).verdict.level, 'viable');
  const loss = calculateFeasibility({ ...base, nightlyRate: 300 });
  assert.equal(loss.verdict.level, 'not_viable');
  assert.equal(loss.paybackMonth, null);
});

test('a loss never shows a payback month or a positive return', () => {
  const r = calculateFeasibility({ ...base, occupancy: 30 });
  assert.equal(r.paybackMonth, null);
  assert.ok((r.returnOnCash ?? 0) < 0);
});

test('what-if grid matches single runs', () => {
  const grid = sensitivity(base);
  const centre = grid[1].cells[2];
  close(centre.profit, calculateFeasibility(base).operatingProfit);
  assert.ok(grid[2].cells[4].profit > grid[0].cells[0].profit);
});

test('incomplete inputs are not calculated', () => {
  assert.equal(isReady(base), true);
  assert.equal(isReady({ ...base, nightlyRate: 0 }), false);
  assert.equal(isReady({ ...base, annualRent: 0 }), false);
});

// ---------- turning a scenario into a property ----------
import { apartmentFromScenario } from '../src/services/scenarios';

test('a scenario becomes a property with a one-year lease and cheques that add up', () => {
  const apt = apartmentFromScenario('Marina 1BR', { ...base, annualRent: 100_000, cheques: 6, startMonth: '2027-03', bedrooms: 1, location: 'Dubai Marina' },
    new Set(['marina-1br']), []);
  assert.equal(apt.apartment_id, 'marina-1br-2');
  assert.equal(apt.start_operation_date, '2027-03-01');
  assert.equal(apt.tenancy_end_date, '2028-02-29'); // one year, ending the day before
  assert.equal(apt.rent_cheques.length, 6);
  assert.deepEqual(apt.rent_cheques.map(c => c.due_date), ['2027-03-01', '2027-05-01', '2027-07-01', '2027-09-01', '2027-11-01', '2028-01-01']);
  assert.equal(apt.rent_cheques.reduce((t, c) => t + c.amount, 0), 100_000);
  assert.equal(apt.setup_costs.find(c => c.category === 'Deposit')!.amount, 5_000);
  assert.equal(apt.setup_costs.find(c => c.category === 'Deposit')!.is_refundable, true);
});
