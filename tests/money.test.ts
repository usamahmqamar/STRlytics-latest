/**
 * Multi-currency tests: rates by date, conversion, the converted view, and the ECB reader.
 * Run with: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRates, convert, convertUserData, perUsd, rateBetween, formatMoney, linkFor as linkForTest, SUPPORTED_CURRENCIES } from '../src/lib/money';
import { chunks, parseEcbXml, pickDays } from '../api/_lib/ecbRates';

import type { UserData } from '../src/types';
import { DEFAULT_USER_DATA } from '../src/constants';

const rates = buildRates([
  { rate_date: '2026-11-10', currency: 'GBP', per_usd: 0.75 },
  { rate_date: '2026-11-12', currency: 'GBP', per_usd: 0.8 },
  { rate_date: '2026-11-10', currency: 'INR', per_usd: 84 },
  { rate_date: '2026-11-12', currency: 'AED', per_usd: '3.6725' as any },
]);

test('uses the latest rate on or before the date (weekends, holidays)', () => {
  assert.deepEqual(perUsd(rates, 'GBP', '2026-11-11'), { rate: 0.75, date: '2026-11-10' });
  assert.deepEqual(perUsd(rates, 'GBP', '2026-11-12'), { rate: 0.8, date: '2026-11-12' });
  assert.deepEqual(perUsd(rates, 'GBP', '2026-12-25'), { rate: 0.8, date: '2026-11-12' });
});

test('before the first stored day, the earliest rate is used', () => {
  assert.equal(perUsd(rates, 'GBP', '2020-01-01')?.rate, 0.75);
});

test('dollar pegs work without stored rates; unknown currencies do not', () => {
  assert.equal(perUsd(new Map(), 'SAR', '2026-01-01')?.rate, 3.75);
  assert.equal(perUsd(new Map(), 'USD', '2026-01-01')?.rate, 1);
  assert.equal(perUsd(new Map(), 'GBP', '2026-01-01'), null);
  assert.equal(convert(100, 'GBP', 'AED', '2026-01-01', new Map()), null);
});

test('converts through the dollar, at each amount\'s own date', () => {
  // 80 GBP on 12 Nov = 100 USD = 367.25 AED
  assert.equal(Math.round(convert(80, 'GBP', 'AED', '2026-11-12', rates)! * 100) / 100, 367.25);
  // same pounds on 10 Nov (0.75 per USD) = 106.67 USD
  assert.equal(Math.round(convert(80, 'GBP', 'USD', '2026-11-10', rates)! * 100) / 100, 106.67);
  assert.equal(convert(50, 'AED', 'AED', '2026-11-10', rates), 50);
  const r = rateBetween('USD', 'AED', '2026-11-12', rates);
  assert.equal(r?.rate, 3.6725);
});

function data(): UserData {
  return {
    ...DEFAULT_USER_DATA,
    apartments: [
      { apartment_id: 'LON', currency: 'GBP', annual_rent: 24000, monthly_rent: 2000, start_operation_date: '2026-11-12',
        rent_cheques: [{ cheque_id: 'c1', due_date: '2026-11-12', amount: 2000, status: 'due' }], setup_costs: [],
        utilities_monthly_defaults: { electricity: 80, internet: 40 } } as any,
      { apartment_id: 'DXB', currency: 'AED', annual_rent: 120000, monthly_rent: 10000, start_operation_date: '2026-11-12',
        rent_cheques: [], setup_costs: [], utilities_monthly_defaults: { electricity: 500, internet: 350 } } as any,
    ],
    reservations: [
      { reservation_code: 'R1', apartment_id: 'LON', check_in: '2026-11-12', check_out: '2026-11-14', total_booking_revenue: 800, net_payout: 720, cleaning_cost: 40 } as any,
      { reservation_code: 'R2', apartment_id: 'DXB', check_in: '2026-11-12', check_out: '2026-11-14', total_booking_revenue: 1000, net_payout: 900, cleaning_cost: 150 } as any,
    ],
    dailyExpenses: [{ expense_id: 'E1', apartment_id: 'PORTFOLIO', date: '2026-11-12', category: 'x', amount: 100 }],
    monthlyBills: [], serviceRecords: [], invoices: [], payments: [], assets: [],
  };
}

test('the converted view puts every listing in one currency and never touches the original', () => {
  const original = data();
  const { data: view, missing } = convertUserData(original, 'AED', rates, 'AED');
  assert.equal(missing.size, 0);
  assert.equal(view.reservations[0].total_booking_revenue, 3672.5); // 800 GBP @ 0.8/USD → 1000 USD → 3672.5 AED
  assert.equal(view.reservations[1].total_booking_revenue, 1000);    // already AED
  assert.equal(view.apartments[0].currency, 'AED');
  assert.equal(view.apartments[0].rent_cheques[0].amount, 9181.25);
  assert.equal(view.dailyExpenses[0].amount, 100);                    // no listing: workspace currency
  assert.equal(original.reservations[0].total_booking_revenue, 800);  // original untouched
  assert.equal(original.apartments[0].currency, 'GBP');
});

test('a single listing selected shows its own amounts unchanged', () => {
  const { data: view } = convertUserData(data(), 'GBP', rates, 'AED');
  assert.equal(view.reservations[0].total_booking_revenue, 800);
});

test('amounts with no rate are left as they are and reported', () => {
  const { data: view, missing } = convertUserData(data(), 'AED', new Map(), 'AED');
  assert.deepEqual([...missing], ['GBP']);
  assert.equal(view.reservations[0].total_booking_revenue, 800);
});

test('formats with the currency code and its usual decimals', () => {
  assert.match(formatMoney(1234.5, 'USD'), /USD\s?1,234\.50/);
  assert.match(formatMoney(1.2345, 'OMR'), /OMR\s?1\.235/);
  assert.equal(SUPPORTED_CURRENCIES.length, 35);
});

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope><Cube>
<Cube time='2026-11-13'><Cube currency='USD' rate='1.1612'/><Cube currency='GBP' rate='0.8734'/><Cube currency='INR' rate='98.12'/></Cube>
<Cube time='2026-11-12'><Cube currency='USD' rate='1.1590'/><Cube currency='GBP' rate='0.8710'/></Cube>
<Cube time='2026-11-11'><Cube currency='GBP' rate='0.8700'/></Cube>
</Cube></gesmes:Envelope>`;

test('reads ECB reference rates; a day without USD is skipped', () => {
  const days = parseEcbXml(XML);
  assert.deepEqual(Object.keys(days).sort(), ['2026-11-12', '2026-11-13']);
  assert.equal(days['2026-11-13'].INR, 98.12);
});

test('picks only days not already stored, and sends them in batches', () => {
  const days = parseEcbXml(XML);
  assert.deepEqual(Object.keys(pickDays(days, { from: '2026-11-13' })), ['2026-11-13']);
  assert.deepEqual(Object.keys(pickDays(days, { from: '2026-11-01', skipFrom: '2026-11-13', skipTo: '9999-12-31' })), ['2026-11-12']);
  const many = Object.fromEntries(Array.from({ length: 900 }, (_, i) => [`d${String(i).padStart(4, '0')}`, { USD: 1 }]));
  assert.deepEqual(chunks(many).map(c => Object.keys(c).length), [400, 400, 100]);
});

test('linking a payout in another currency records the booking-currency amount', () => {
  const usdPayout = { id: 'p', platform_id: null, received_date: '2026-11-12', amount: 1000, currency: 'USD', source: 'manual' as const };
  // Booking in GBP expects 720; payout has 1000 USD free. 720 GBP = 900 USD at 0.8.
  const link = linkForTest(usdPayout, 1000, 'GBP', 720, rates)!;
  assert.equal(link.amount, 900);
  assert.equal(link.booking_amount, 720);
  // Same currency: plain amount, no second figure.
  assert.deepEqual(linkForTest({ ...usdPayout, currency: 'GBP' }, 500, 'GBP', 720, rates), { amount: 500 });
  // No rate for the pair: nothing to link automatically.
  assert.equal(linkForTest(usdPayout, 1000, 'GBP', 720, new Map()), null);
});
