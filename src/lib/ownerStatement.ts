/**
 * Owner statements: each owner's share of each property's profit for a period.
 *
 * Every property is worked out in its own currency (shared costs included, converted to it).
 * Each day's profit is split by the shares in force that day, so a change of shares mid-month
 * is respected. The owner's part is then converted to the owner's reporting currency at that
 * day's rate. Pure functions; tested in tests/ownerStatement.test.ts.
 */
import { calculateDailyPL } from './pl';
import { convert, convertUserData, type Rates } from './money';
import type { UserData } from '../types';
import type { ListingShare } from '../services/owners';

/** Shares in force on a day for one property: the latest split that started on or before it. */
export function sharesOn(shares: ListingShare[], propertyId: string, date: string): Map<string, number> {
  let start = '';
  for (const s of shares) {
    if (s.property_id === propertyId && s.effective_from <= date && s.effective_from > start) start = s.effective_from;
  }
  const out = new Map<string, number>();
  if (!start) return out;
  for (const s of shares) if (s.property_id === propertyId && s.effective_from === start) out.set(s.entity_id, Number(s.share));
  return out;
}

export interface StatementLine {
  propertyId: string;
  propertyName: string;
  currency: string;
  revenue: number;       // whole property, its currency
  costs: number;         // whole property, its currency
  profit: number;        // whole property, its currency
  nightsBooked: number;
  shareStart: number;    // the owner's % on the first day of the period
  shareEnd: number;      // and on the last day
  ownerProfit: number;   // the owner's part, property currency
  ownerProfitReporting: number; // the owner's part, reporting currency
}

export interface Statement {
  entityId: string;
  start: string;
  end: string;
  reportingCurrency: string;
  lines: StatementLine[];
  totalReporting: number;
  /** Currencies that had no rate on some day; those days are left out of the converted total. */
  missingRates: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildStatement(input: {
  data: UserData;
  rates: Rates;
  baseCurrency: string;
  shares: ListingShare[];
  entityId: string;
  reportingCurrency: string;
  start: string; // yyyy-MM-dd, inclusive
  end: string;   // yyyy-MM-dd, inclusive
}): Statement {
  const { data, rates, baseCurrency, shares, entityId, reportingCurrency, start, end } = input;
  const missing = new Set<string>();
  const lines: StatementLine[] = [];

  const owned = new Set(shares.filter(s => s.entity_id === entityId).map(s => s.property_id));
  for (const apt of data.apartments) {
    if (!owned.has(apt.apartment_id)) continue;
    const currency = apt.currency || baseCurrency;
    const view = convertUserData(data, currency, rates, baseCurrency).data;
    const rows = calculateDailyPL(view, new Date(`${start}T00:00:00`), new Date(`${end}T00:00:00`), apt.apartment_id);

    let revenue = 0, costs = 0, profit = 0, nights = 0, ownerProfit = 0, ownerReporting = 0, touched = false;
    for (const row of rows) {
      const pct = sharesOn(shares, apt.apartment_id, row.date).get(entityId) ?? 0;
      revenue += row.daily_revenue;
      costs += row.total_daily_cost;
      profit += row.daily_profit;
      nights += row.occupied_nights_count;
      if (!pct) continue;
      touched = true;
      const part = (row.daily_profit * pct) / 100;
      ownerProfit += part;
      const conv = convert(part, currency, reportingCurrency, row.date, rates);
      if (conv === null) missing.add(currency); else ownerReporting += conv;
    }
    if (!touched) continue;
    lines.push({
      propertyId: apt.apartment_id,
      propertyName: apt.name || apt.apartment_id,
      currency,
      revenue: r2(revenue),
      costs: r2(costs),
      profit: r2(profit),
      nightsBooked: nights,
      shareStart: sharesOn(shares, apt.apartment_id, start).get(entityId) ?? 0,
      shareEnd: sharesOn(shares, apt.apartment_id, end).get(entityId) ?? 0,
      ownerProfit: r2(ownerProfit),
      ownerProfitReporting: r2(ownerReporting),
    });
  }
  lines.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  return {
    entityId, start, end, reportingCurrency, lines,
    totalReporting: r2(lines.reduce((t, l) => t + l.ownerProfitReporting, 0)),
    missingRates: [...missing],
  };
}

/** The periods an owner's reports cover, for a frequency, ending before `today`. */
export function lastPeriod(frequency: 'monthly' | 'quarterly' | 'monthly_and_yearly', today: Date): { start: string; end: string } {
  const y = today.getFullYear(), m = today.getMonth();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (frequency === 'quarterly') {
    const q = Math.floor(m / 3);
    const startQ = new Date(y, (q - 1) * 3, 1);
    return { start: iso(startQ), end: iso(new Date(startQ.getFullYear(), startQ.getMonth() + 3, 0)) };
  }
  return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
}
