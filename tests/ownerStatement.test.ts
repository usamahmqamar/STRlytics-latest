/**
 * Owner statements: shares by date, splitting profit, converting to the owner's currency.
 * Run with: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement, lastPeriod, sharesOn } from '../src/lib/ownerStatement';
import { statementPdf } from '../src/lib/statementPdf';
import { buildRates } from '../src/lib/money';
import { DEFAULT_USER_DATA } from '../src/constants';
import type { UserData } from '../src/types';
import type { ListingShare } from '../src/services/owners';

const A = 'ent-a', B = 'ent-b';
const shares: ListingShare[] = [
  { property_id: 'MIA', entity_id: A, effective_from: '2026-01-01', share: 60 },
  { property_id: 'MIA', entity_id: B, effective_from: '2026-01-01', share: 40 },
  // From 16 Nov, A owns it all.
  { property_id: 'MIA', entity_id: A, effective_from: '2026-11-16', share: 100 },
  { property_id: 'DXB', entity_id: B, effective_from: '2026-01-01', share: 100 },
];

test('shares in force follow the latest split on or before the day', () => {
  assert.deepEqual([...sharesOn(shares, 'MIA', '2026-11-15')], [[A, 60], [B, 40]]);
  assert.deepEqual([...sharesOn(shares, 'MIA', '2026-11-16')], [[A, 100]]);
  assert.equal(sharesOn(shares, 'MIA', '2025-12-31').size, 0);
});

// One USD property with a single 30-night booking paying 3,000 net and no costs, and one AED property.
function data(): UserData {
  const apt = (id: string, currency: string, name: string) => ({
    apartment_id: id, name, currency, status: 'active', start_operation_date: '2026-01-01',
    annual_rent: 0, monthly_rent: 0, rent_cheques: [], setup_costs: [], utilities_monthly_defaults: { electricity: 0, internet: 0 },
  }) as any;
  return {
    ...DEFAULT_USER_DATA,
    apartments: [apt('MIA', 'USD', 'Miami condo'), apt('DXB', 'AED', 'Marina 1BR')],
    reservations: [
      { reservation_code: 'M1', apartment_id: 'MIA', status: 'confirmed', check_in: '2026-11-01', check_out: '2026-12-01', net_payout: 3000, total_booking_revenue: 3300, cleaning_cost: 0 } as any,
      { reservation_code: 'D1', apartment_id: 'DXB', status: 'confirmed', check_in: '2026-11-01', check_out: '2026-11-11', net_payout: 3672.5, total_booking_revenue: 4000, cleaning_cost: 0 } as any,
    ],
    dailyExpenses: [], monthlyBills: [], serviceRecords: [], invoices: [], payments: [], assets: [],
  };
}
const rates = buildRates([{ rate_date: '2026-10-30', currency: 'INR', per_usd: 84 }]);

test('a share change mid-month splits each day by the shares that day', () => {
  const s = buildStatement({ data: data(), rates, baseCurrency: 'AED', shares, entityId: A, reportingCurrency: 'USD', start: '2026-11-01', end: '2026-11-30' });
  assert.equal(s.lines.length, 1);
  const l = s.lines[0];
  assert.equal(l.propertyId, 'MIA');
  assert.equal(l.profit, 3000);
  // 15 days at 60% of 100/day + 15 days at 100% = 900 + 1500
  assert.equal(l.ownerProfit, 2400);
  assert.equal(l.ownerProfitReporting, 2400);
  assert.equal(l.shareStart, 60);
  assert.equal(l.shareEnd, 100);
  assert.equal(s.totalReporting, 2400);
});

test('an owner across currencies gets one total in their reporting currency', () => {
  const s = buildStatement({ data: data(), rates, baseCurrency: 'AED', shares, entityId: B, reportingCurrency: 'INR', start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(s.lines.map(l => l.propertyId), ['DXB', 'MIA']);
  const dxb = s.lines.find(l => l.propertyId === 'DXB')!;
  const mia = s.lines.find(l => l.propertyId === 'MIA')!;
  assert.equal(dxb.currency, 'AED');
  assert.equal(dxb.ownerProfit, 3672.5);          // all of it, in dirhams
  assert.equal(dxb.ownerProfitReporting, 84000);  // 3,672.50 AED = 1,000 USD = 84,000 INR
  assert.equal(mia.ownerProfit, 600);             // 40% of 15 days only
  assert.equal(mia.ownerProfitReporting, 50400);
  assert.equal(s.totalReporting, 134400);
  assert.deepEqual(s.missingRates, []);
});

test('days without a rate are reported, not guessed', () => {
  const s = buildStatement({ data: data(), rates: new Map(), baseCurrency: 'AED', shares, entityId: B, reportingCurrency: 'GBP', start: '2026-11-01', end: '2026-11-30' });
  assert.ok(s.missingRates.length > 0);
});

test('report periods: last month, or the last full quarter', () => {
  assert.deepEqual(lastPeriod('monthly', new Date(2026, 10, 16)), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(lastPeriod('monthly', new Date(2026, 0, 5)), { start: '2025-12-01', end: '2025-12-31' });
  assert.deepEqual(lastPeriod('quarterly', new Date(2026, 10, 16)), { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(lastPeriod('quarterly', new Date(2026, 1, 1)), { start: '2025-10-01', end: '2025-12-31' });
});

test('the PDF is produced, and names outside the built-in fonts do not break it', async () => {
  const s = buildStatement({ data: data(), rates, baseCurrency: 'AED', shares, entityId: B, reportingCurrency: 'INR', start: '2026-11-01', end: '2026-11-30' });
  const bytes = await statementPdf(s, { ownerName: 'Ünal Şahin محمد', workspaceName: 'Qamar Homes' });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.ok(bytes.length > 1500);
});
