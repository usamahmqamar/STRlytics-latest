/**
 * Money across currencies.
 *
 * Every stored amount stays in its own currency. Totals across listings are converted into one
 * currency for viewing, each amount at the rate for the day it happened (or the latest earlier
 * rate, for weekends and holidays). Rates are "units per 1 US dollar", one row per day.
 */
import type { Apartment, UserData } from '../types';

/** Fixed to the US dollar; also used when no stored rate is available yet. */
export const USD_PEGS: Record<string, number> = { USD: 1, AED: 3.6725, SAR: 3.75, QAR: 3.64, OMR: 0.3845, BHD: 0.376 };

/** Currencies with a daily rate (ECB reference rates, plus the dollar pegs). Matches public.currencies. */
export const SUPPORTED_CURRENCIES = [
  'AED', 'AUD', 'BHD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK',
  'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'OMR', 'PHP', 'PLN', 'QAR', 'RON', 'SAR', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
] as const;
export const isSupportedCurrency = (c: string | undefined | null): c is string => !!c && (SUPPORTED_CURRENCIES as readonly string[]).includes(c);

/** currency -> rows sorted by date ascending */
export type Rates = Map<string, { date: string; perUsd: number }[]>;

export function buildRates(rows: { rate_date: string; currency: string; per_usd: number | string }[]): Rates {
  const out: Rates = new Map();
  for (const r of rows) {
    const list = out.get(r.currency) ?? [];
    list.push({ date: r.rate_date, perUsd: Number(r.per_usd) });
    out.set(r.currency, list);
  }
  for (const list of out.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** Units of `currency` per 1 USD on `date`: the latest rate on or before it, else the earliest after. */
export function perUsd(rates: Rates, currency: string, date: string): { rate: number; date: string | null } | null {
  if (currency === 'USD') return { rate: 1, date: null };
  const list = rates.get(currency);
  if (list?.length) {
    let lo = 0, hi = list.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].date <= date) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const row = list.at(found >= 0 ? found : 0)!;
    return { rate: row.perUsd, date: row.date };
  }
  if (USD_PEGS[currency]) return { rate: USD_PEGS[currency], date: null };
  return null;
}

/** Converts, or returns null when either currency has no rate. */
export function convert(amount: number, from: string, to: string, date: string, rates: Rates): number | null {
  if (!Number.isFinite(amount)) return amount;
  if (from === to || !from || !to) return amount;
  const a = perUsd(rates, from, date);
  const b = perUsd(rates, to, date);
  if (!a || !b) return null;
  return (amount / a.rate) * b.rate;
}

/** The rate used, for labels such as "1 USD = 3.6725 AED on 4 Nov". */
export function rateBetween(from: string, to: string, date: string, rates: Rates): { rate: number; date: string | null } | null {
  if (from === to) return { rate: 1, date };
  const a = perUsd(rates, from, date);
  const b = perUsd(rates, to, date);
  if (!a || !b) return null;
  return { rate: b.rate / a.rate, date: a.date && b.date ? (a.date < b.date ? a.date : b.date) : a.date ?? b.date };
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A copy of the workspace data with every amount in `to`. Used only for viewing: analytics,
 * dashboards and reports. Never saved. `missing` lists currencies that could not be converted
 * (their amounts are left as they were and should be flagged).
 */
export function convertUserData(data: UserData, to: string, rates: Rates, fallback: string): { data: UserData; missing: Set<string> } {
  const missing = new Set<string>();
  const aptCurrency = new Map<string, string>(data.apartments.map(a => [a.apartment_id, a.currency || fallback]));
  const curOf = (row: { currency?: string; apartment_id?: string }) =>
    row.currency || (row.apartment_id && aptCurrency.get(row.apartment_id)) || fallback;
  const cv = (amount: number | undefined | null, from: string, date: string | undefined | null): any => {
    if (amount === undefined || amount === null || from === to) return amount;
    const v = convert(Number(amount), from, to, (date || today()).slice(0, 10), rates);
    if (v === null) { missing.add(from); return amount; }
    return Math.round(v * 100) / 100;
  };

  const apartments: Apartment[] = data.apartments.map(a => {
    const c = a.currency || fallback;
    return {
      ...a,
      currency: to,
      annual_rent: cv(a.annual_rent, c, a.start_operation_date),
      monthly_rent: cv(a.monthly_rent, c, a.start_operation_date),
      utilities_monthly_defaults: a.utilities_monthly_defaults && {
        ...a.utilities_monthly_defaults,
        electricity: cv(a.utilities_monthly_defaults.electricity, c, null),
        internet: cv(a.utilities_monthly_defaults.internet, c, null),
      },
      rent_cheques: (a.rent_cheques || []).map(x => ({ ...x, currency: to, amount: cv(x.amount, x.currency || c, x.due_date) })),
      setup_costs: (a.setup_costs || []).map(x => ({ ...x, currency: to, amount: cv(x.amount, x.currency || c, x.date) })),
      tenancy_history: a.tenancy_history?.map(t => ({
        ...t,
        annual_rent: cv(t.annual_rent, c, t.start_date),
        monthly_rent: cv(t.monthly_rent, c, t.start_date),
        total_revenue: cv(t.total_revenue, c, t.end_date),
        total_expenses: cv(t.total_expenses, c, t.end_date),
        net_payout: cv(t.net_payout, c, t.end_date),
        net_profit: cv(t.net_profit, c, t.end_date),
      })),
    };
  });

  const out: UserData = {
    ...data,
    apartments,
    reservations: data.reservations.map(r => {
      const c = curOf(r);
      return {
        ...r,
        currency: to,
        total_booking_revenue: cv(r.total_booking_revenue, c, r.check_in),
        net_payout: cv(r.net_payout, c, r.check_in),
        cleaning_cost: cv(r.cleaning_cost, c, r.check_out || r.check_in),
        other_booking_costs: r.other_booking_costs?.map(o => ({ ...o, amount: cv(o.amount, c, o.date || r.check_in) })),
      };
    }),
    dailyExpenses: data.dailyExpenses.map(e => ({ ...e, currency: to, amount: cv(e.amount, curOf(e), e.date) })),
    monthlyBills: data.monthlyBills.map(b => ({ ...b, currency: to, amount: cv(b.amount, curOf(b), b.paid_date || `${b.month}-01`) })),
    serviceRecords: data.serviceRecords.map(s => {
      const c = curOf(s);
      return { ...s, currency: to, unit_cost: cv(s.unit_cost, c, s.date), total_cost: cv(s.total_cost, c, s.date) };
    }),
    invoices: data.invoices.map(i => ({ ...i, currency: to, total_amount: cv(i.total_amount, i.currency || fallback, i.date) })),
    payments: data.payments.map(p => ({ ...p, currency: to, amount_paid: cv(p.amount_paid, p.currency || fallback, p.date) })),
    assets: data.assets.map(a => ({ ...a, currency: to, cost: cv(a.cost, curOf(a), a.purchase_date) })),
    maintenanceTasks: data.maintenanceTasks?.map(t => {
      const c = curOf(t);
      return { ...t, cost_estimate: cv(t.cost_estimate, c, t.due_date || t.created_at), actual_cost: cv(t.actual_cost, c, t.due_date || t.created_at) };
    }),
  };
  return { data: out, missing };
}

/** Currencies present across the workspace's listings and money rows. */
export function currenciesInUse(data: UserData, fallback: string): string[] {
  const s = new Set<string>([fallback]);
  for (const a of data.apartments) s.add(a.currency || fallback);
  for (const list of [data.dailyExpenses, data.invoices, data.payments, data.reservations] as { currency?: string }[][]) {
    for (const r of list) if (r.currency) s.add(r.currency);
  }
  return [...s].sort();
}

const DECIMALS: Record<string, number> = { JPY: 0, KRW: 0, ISK: 0, OMR: 3, BHD: 3 };

export function formatMoney(amount: number, currency: string, opts: { compact?: boolean } = {}): string {
  const d = DECIMALS[currency] ?? 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, currencyDisplay: 'code',
      minimumFractionDigits: opts.compact ? 0 : d, maximumFractionDigits: opts.compact ? 0 : d,
    }).format(amount || 0).replace(/ /g, ' ');
  } catch {
    return `${currency} ${(amount || 0).toFixed(d)}`;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How much of a payout to link to a booking. Same currency: the smaller of what is left on the
 * payout and what the booking still expects. Different currencies: the same, converted at the
 * rate on the payout date, and the amount in the booking's currency is recorded beside it so any
 * exchange difference shows on the booking. Null when there is no rate yet.
 */
export function linkFor(
  p: { currency?: string | null; received_date: string },
  left: number, bookingCurrency: string, outstanding: number, rates: Rates,
): { amount: number; booking_amount?: number } | null {
  const pc = p.currency || bookingCurrency;
  if (pc === bookingCurrency) return { amount: round2(Math.min(left, outstanding > 0 ? outstanding : left)) };
  const outInPayout = convert(outstanding, bookingCurrency, pc, p.received_date, rates);
  if (outInPayout === null) return null;
  const amount = round2(Math.min(left, outstanding > 0 ? outInPayout : left));
  const booking = convert(amount, pc, bookingCurrency, p.received_date, rates);
  return booking === null ? null : { amount, booking_amount: round2(booking) };
}
