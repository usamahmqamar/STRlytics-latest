/**
 * Daily profit and loss per property, the base of the Dashboard, Daily P&L, Analytics and Cash flow.
 * Pure and tested (tests/pl.test.ts). All amounts in AED.
 *
 * Rules
 * - Rent belongs to the tenancy that covers the day: annual rent / days in that lease year,
 *   so January and February days cost the same and past months keep their old rent after a renewal.
 * - No rent or default utilities on days outside every tenancy (before the unit started, after it
 *   was terminated). An active unit past its end date without a renewal keeps paying the current
 *   rent (holdover), so costs are never silently dropped.
 * - Booking revenue is the net payout spread evenly over the nights stayed (check-out day excluded).
 * - Cancelled non-refundable bookings keep their payout as retained revenue on the original nights,
 *   without counting the unit as occupied; refundable cancellations count as lost revenue.
 * - Utilities: the month's recorded bill if there is one, otherwise the property default,
 *   spread over the days of that month (only days the unit was operating).
 */
import { addDays, addYears, differenceInCalendarDays, format, getDaysInMonth, parseISO } from 'date-fns';
import type { Apartment, Reservation, UserData } from '../types';

export interface DailyPLRow {
  date: string;
  apartment: string;
  apartment_id: string;
  operating: boolean;
  occupied: 'yes' | 'no';
  occupied_nights_count: number;
  daily_revenue: number;
  retained_revenue: number;
  lost_revenue: number;
  daily_rent: number;
  daily_electricity: number;
  daily_internet: number;
  cleaning_allocated: number;
  other_costs_allocated: number;
  real_time_expenses: number;
  total_daily_cost: number;
  daily_profit: number;
}

export interface Tenancy { start: string; end: string | null; annualRent: number }

const dayStr = (d: Date) => format(d, 'yyyy-MM-dd');
const nightsOf = (r: Reservation) => Math.max(1, differenceInCalendarDays(parseISO(r.check_out), parseISO(r.check_in)));

/** Every tenancy of a property, oldest first: archived ones plus the current one if still running. */
export function tenanciesOf(apt: Apartment): Tenancy[] {
  const history = (apt.tenancy_history || [])
    .filter(h => h.start_date)
    .map(h => ({ start: h.start_date, end: h.end_date || null, annualRent: Number(h.annual_rent) || 0 }));
  const finished = apt.status === 'terminated' || apt.status === 'expired';
  const currentRent = Number(apt.annual_rent) || (apt.rent_cheques || []).reduce((t, c) => t + (Number(c.amount) || 0), 0)
    || (Number(apt.monthly_rent) || 0) * 12;
  const list = [...history];
  if (!finished && apt.start_operation_date && !history.some(h => h.start === apt.start_operation_date)) {
    list.push({ start: apt.start_operation_date, end: apt.tenancy_end_date || null, annualRent: currentRent });
  }
  if (!list.length) {
    // Older records without dates: treat as always operating at the current rent.
    list.push({ start: '0000-01-01', end: null, annualRent: currentRent });
  }
  return list.sort((a, b) => a.start.localeCompare(b.start));
}

/** Rent for one day, or null when no tenancy covers it. */
export function rentForDay(tenancies: Tenancy[], date: string, holdover: boolean): number | null {
  for (let i = tenancies.length - 1; i >= 0; i--) {
    const t = tenancies[i];
    if (date < t.start) continue;
    const isLast = i === tenancies.length - 1;
    if (t.end && date > t.end && !(isLast && holdover)) continue;
    if (t.start === '0000-01-01') return t.annualRent / 365;
    // Lease year containing this day, counted from the tenancy start (365 or 366 days).
    const start = parseISO(t.start);
    const years = Math.max(0, Math.floor(differenceInCalendarDays(parseISO(date), start) / 366));
    let anniv = addYears(start, years);
    while (dayStr(addYears(anniv, 1)) <= date) anniv = addYears(anniv, 1);
    const yearLength = differenceInCalendarDays(addYears(anniv, 1), anniv);
    return t.annualRent / yearLength;
  }
  return null;
}

export function calculateDailyPL(data: UserData, startDate: Date, endDate: Date, apartmentId?: string): DailyPLRow[] {
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) return [];
  const from = dayStr(startDate);
  const to = dayStr(endDate);
  const apartments = apartmentId ? data.apartments.filter(a => a.apartment_id === apartmentId) : data.apartments;

  // Index everything once per property and date, instead of scanning all records every day.
  const byNight = new Map<string, { booked?: Reservation; retained: number; lost: number }>();
  const cost = new Map<string, number>(); // other booking costs, keyed apt|date
  for (const r of data.reservations) {
    if (!r.check_in || !r.check_out) continue;
    const nights = nightsOf(r);
    const perNight = (Number(r.net_payout) || 0) / nights;
    for (let i = 0; i < nights; i++) {
      const d = dayStr(addDays(parseISO(r.check_in), i));
      if (d < from || d > to) continue;
      const key = `${r.apartment_id}|${d}`;
      const slot = byNight.get(key) ?? { retained: 0, lost: 0 };
      if (r.status !== 'cancelled') { if (!slot.booked) slot.booked = r; }
      else if (r.cancellation_policy === 'non-refundable') slot.retained += perNight;
      else slot.lost += perNight;
      byNight.set(key, slot);
    }
    if (r.status !== 'cancelled') {
      for (const c of r.other_booking_costs || []) {
        const d = (c.date || r.check_out).slice(0, 10);
        if (d < from || d > to) continue;
        const key = `${r.apartment_id}|${d}`;
        cost.set(key, (cost.get(key) ?? 0) + (Number(c.amount) || 0));
      }
    }
  }
  const expenses = new Map<string, number>();
  for (const e of data.dailyExpenses) {
    const d = (e.date || '').slice(0, 10);
    if (d < from || d > to) continue;
    const key = `${e.apartment_id}|${d}`;
    expenses.set(key, (expenses.get(key) ?? 0) + (Number(e.amount) || 0));
  }
  const bills = new Map<string, number>();
  for (const b of data.monthlyBills) bills.set(`${b.apartment_id}|${b.month}|${b.bill_type}`, Number(b.amount) || 0);

  const totalUnits = data.apartments.length;
  const rows: DailyPLRow[] = [];
  for (let t = parseISO(from); dayStr(t) <= to; t = addDays(t, 1)) {
    const date = dayStr(t);
    const month = date.slice(0, 7);
    const daysInMonth = getDaysInMonth(t);
    const shared = totalUnits ? (expenses.get(`PORTFOLIO|${date}`) ?? 0) / totalUnits : 0;

    for (const apt of apartments) {
      const key = `${apt.apartment_id}|${date}`;
      const holdover = apt.status !== 'terminated' && apt.status !== 'expired';
      const rent = rentForDay(tenanciesOf(apt), date, holdover);
      const operating = rent !== null;
      const night = byNight.get(key);
      const booked = night?.booked;

      const elecBill = bills.get(`${apt.apartment_id}|${month}|electricity`);
      const netBill = bills.get(`${apt.apartment_id}|${month}|internet`);
      const elecMonthly = elecBill ?? (operating ? Number(apt.utilities_monthly_defaults?.electricity) || 0 : 0);
      const netMonthly = netBill ?? (operating ? Number(apt.utilities_monthly_defaults?.internet) || 0 : 0);

      const revenue = booked ? (Number(booked.net_payout) || 0) / nightsOf(booked) : 0;
      const retained = night?.retained ?? 0;
      const cleaning = booked ? (Number(booked.cleaning_cost) || 0) / nightsOf(booked) : 0;
      const other = cost.get(key) ?? 0;
      const direct = (expenses.get(key) ?? 0) + shared;
      const dailyRent = rent ?? 0;
      const total = dailyRent + elecMonthly / daysInMonth + netMonthly / daysInMonth + cleaning + other + direct;

      rows.push({
        date,
        apartment: apt.name,
        apartment_id: apt.apartment_id,
        operating,
        occupied: booked ? 'yes' : 'no',
        occupied_nights_count: booked ? 1 : 0,
        daily_revenue: revenue + retained,
        retained_revenue: retained,
        lost_revenue: night?.lost ?? 0,
        daily_rent: dailyRent,
        daily_electricity: elecMonthly / daysInMonth,
        daily_internet: netMonthly / daysInMonth,
        cleaning_allocated: cleaning,
        other_costs_allocated: other,
        real_time_expenses: direct,
        total_daily_cost: total,
        daily_profit: revenue + retained - total,
      });
    }
  }
  return rows;
}
