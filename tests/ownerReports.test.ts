/**
 * Owner report scheduling and emails. Run with: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerEmail, duePeriods, localToday, periodLabel, planAll, type ReportPayload } from '../src/server/ownerReports';

test('the workspace\'s own date decides what is due', () => {
  // 21:30 UTC on 31 Oct is already 1 Nov in Dubai, still 31 Oct in London.
  const now = new Date('2026-10-31T21:30:00Z');
  assert.equal(localToday('Asia/Dubai', now), '2026-11-01');
  assert.equal(localToday('Europe/London', now), '2026-10-31');
  assert.equal(localToday('Not/AZone', now), '2026-10-31');
});

test('periods due by frequency', () => {
  assert.deepEqual(duePeriods('monthly', '2026-11-25').map(p => `${p.kind} ${p.start} ${p.end}`), [
    'month_to_date 2026-11-01 2026-11-24',
    'monthly 2026-10-01 2026-10-31',
  ]);
  // On the 1st there is no month-to-date yet.
  assert.deepEqual(duePeriods('monthly', '2026-03-01').map(p => p.kind), ['monthly']);
  assert.deepEqual(duePeriods('monthly', '2026-03-01')[0], { kind: 'monthly', start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(duePeriods('quarterly', '2026-11-25').find(p => p.kind === 'quarterly'), { kind: 'quarterly', start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(duePeriods('quarterly', '2026-01-15').find(p => p.kind === 'quarterly'), { kind: 'quarterly', start: '2025-10-01', end: '2025-12-31' });
  assert.deepEqual(duePeriods('monthly_and_yearly', '2026-01-02').map(p => `${p.kind} ${p.start}`), [
    'month_to_date 2026-01-01', 'monthly 2025-12-01', 'yearly 2025-01-01',
  ]);
});

function payload(): ReportPayload {
  return {
    rates: [],
    workspaces: [{
      org_id: 'o1', name: 'Qamar Homes', base_currency: 'AED', timezone: 'Asia/Dubai',
      entities: [
        { id: 'e1', name: 'Emma', reporting_currency: 'AED', report_email: 'e@x.test', report_frequency: 'monthly', opted_out: false },
        { id: 'e2', name: 'No shares', reporting_currency: 'AED', report_email: null, report_frequency: 'monthly', opted_out: false },
        { id: 'e3', name: 'Late joiner', reporting_currency: 'AED', report_email: null, report_frequency: 'monthly', opted_out: false },
      ],
      shares: [
        { property_id: 'P1', entity_id: 'e1', effective_from: '2026-01-01', share: 100 },
        // e3 owns from 15 Nov only: nothing for October.
        { property_id: 'P1', entity_id: 'e3', effective_from: '2026-11-15', share: 50 },
        { property_id: 'P1', entity_id: 'e1', effective_from: '2026-11-15', share: 50 },
      ],
      properties: [{ id: 'P1', name: 'Marina 1BR', currency: 'AED', start_operation_date: '2026-01-01', annual_rent: 0, status: 'active' }],
      reservations: [{ id: 'R1', apartment_id: 'P1', status: 'confirmed', check_in: '2026-10-01', check_out: '2026-10-11', net_payout: 1000 }],
      daily_expenses: [], monthly_bills: [],
      statements: [],
    }],
  };
}

test('plans month-to-date and last month for owners with shares only', () => {
  const plan = planAll(payload(), new Date('2026-11-25T06:00:00Z'));
  assert.deepEqual(plan.map(p => `${p.entity_id} ${p.kind} ${p.period_start}`).sort(), [
    'e1 month_to_date 2026-11-01',
    'e1 monthly 2026-10-01',
    'e3 month_to_date 2026-11-01',
  ]);
  assert.equal(plan.find(p => p.entity_id === 'e1' && p.kind === 'monthly')!.total, 1000);
});

test('a statement already prepared is not prepared again; month-to-date always is', () => {
  const p = payload();
  p.workspaces[0].statements = [{ entity_id: 'e1', kind: 'monthly', period_start: '2026-10-01', emailed_at: null }];
  const plan = planAll(p, new Date('2026-11-25T06:00:00Z'));
  assert.ok(!plan.some(x => x.kind === 'monthly'));
  assert.ok(plan.some(x => x.entity_id === 'e1' && x.kind === 'month_to_date'));
});

test('period labels', () => {
  assert.equal(periodLabel('monthly', '2026-10-01'), 'October 2026');
  assert.equal(periodLabel('quarterly', '2026-07-01'), 'Q3 2026');
  assert.equal(periodLabel('yearly', '2025-01-01'), '2025');
});

test('the email escapes names and links to the owner portal', () => {
  const e = buildOwnerEmail({
    ownerName: '<script>x</script>', workspaceName: 'Qamar & Co', kind: 'monthly', periodStart: '2026-10-01',
    total: 1234.5, currency: 'GBP', appUrl: 'https://app.test/',
  });
  assert.equal(e.subject, 'Your owner statement for October 2026 from Qamar & Co');
  assert.ok(!e.html.includes('<script>'));
  assert.ok(e.html.includes('&lt;script&gt;'));
  assert.ok(e.html.includes('https://app.test/owner'));
  assert.ok(e.text.includes('GBP 1,234.50'));
  assert.equal(e.filename, 'owner-statement-october-2026.pdf');
});
