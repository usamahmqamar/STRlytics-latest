/**
 * Rent-to-rent feasibility model for a short-term rental unit.
 *
 * Pure functions only, so every number on the Feasibility screen can be tested.
 * All money is in AED. A "month" is a calendar month starting from `startMonth`.
 */

export interface FeasibilityInputs {
  /** First month the unit takes bookings, 'yyyy-MM'. */
  startMonth: string;
  /** Average nightly rate across the year, before platform fees. */
  nightlyRate: number;
  /** Expected average occupancy across the year, 0-100. */
  occupancy: number;
  /** Optional month-by-month multipliers (12 entries, January first); 1 = average. */
  seasonality?: { adr: number; occ: number }[] | null;

  annualRent: number;
  /** Number of rent cheques per year (1, 2, 4, 6 or 12), paid evenly from the start. */
  cheques: number;
  /** Refundable security deposit, as % of annual rent. */
  depositPercent: number;
  /** One-off furnishing and setup. */
  setupCost: number;

  /** Utilities, internet, supplies, maintenance: per month. */
  monthlyRunningCosts: number;
  /** Booking platform commission, % of booking revenue. */
  platformFeePercent: number;
  /** Management company fee, % of revenue after platform commission (0 if self-managed). */
  managementFeePercent: number;
  /** Cleaning and linen cost per stay. */
  cleaningPerStay: number;
  /** Average length of a stay in nights (to count cleanings). */
  averageStayNights: number;
  /** Tourism dirham and similar per-night charges the operator pays. */
  perNightCharges: number;
  /** Holiday-home permit and other yearly licences. */
  yearlyLicences: number;

  /** Profit the operator wants per year; used for the target nightly rate. */
  targetProfit: number;
}

export interface MonthRow {
  month: string;            // 'yyyy-MM'
  label: string;            // 'Jan 2027'
  days: number;
  occupancy: number;        // 0-100
  nightlyRate: number;
  nights: number;           // booked nights
  revenue: number;          // booking revenue before platform commission
  variableCosts: number;    // commission + management + cleaning + per-night charges
  fixedCosts: number;       // running costs + rent (spread evenly) + licences (spread evenly)
  profit: number;           // revenue - variable - fixed (operating, excludes setup)
  rentPaid: number;         // rent cheques actually paid this month
  cashFlow: number;         // cash in minus cash out this month (cheques, licences up front)
  cumulativeCash: number;   // after upfront cash; recovered when >= 0
}

export interface FeasibilityResult {
  months: MonthRow[];
  revenue: number;
  platformFees: number;
  managementFees: number;
  cleaning: number;
  perNight: number;
  rent: number;
  running: number;
  licences: number;
  operatingProfit: number;          // a full year, before setup cost
  firstYearProfit: number;          // after writing off setup in year one
  upfrontCash: number;              // setup + deposit + first rent cheque
  returnOnCash: number | null;      // operatingProfit / upfrontCash
  paybackMonth: number | null;      // 1-based month in which cumulative cash turns positive
  breakEvenOccupancy: number | null; // 0-100, at the nightly rate entered
  breakEvenRate: number | null;     // at the occupancy entered
  targetRate: number | null;        // nightly rate needed for targetProfit
  bookedNights: number;
  verdict: Verdict;
}

export type VerdictLevel = 'viable' | 'marginal' | 'not_viable';
export interface Verdict {
  level: VerdictLevel;
  reasons: string[];
}

/** The rules behind the verdict, shown on screen so the result is never a black box. */
export const VERDICT_RULES = {
  minReturnOnCash: 30,      // % per year on the cash put in
  maxPaybackMonths: 12,
  minOccupancyCushion: 10,  // expected occupancy must beat break-even by this many points
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (n: unknown, fallback = 0) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

function monthsFrom(start: string, count: number) {
  const [y, m] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const year = y + Math.floor((m - 1 + i) / 12);
    const month = ((m - 1 + i) % 12) + 1;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { key: `${year}-${String(month).padStart(2, '0')}`, monthIndex: month - 1, year, days };
  });
}

/** Months (0-11 from the start) in which each rent cheque is paid. First cheque is paid up front. */
export function chequeMonths(cheques: number): number[] {
  const n = clamp(Math.round(num(cheques, 1)), 1, 12);
  return Array.from({ length: n }, (_, k) => Math.floor((k * 12) / n));
}

/** Variable cost per booked night, at a given nightly rate. */
function variablePerNight(i: FeasibilityInputs, rate: number) {
  const platform = rate * (num(i.platformFeePercent) / 100);
  const management = (rate - platform) * (num(i.managementFeePercent) / 100);
  const cleaning = num(i.cleaningPerStay) / Math.max(1, num(i.averageStayNights, 1));
  return platform + management + cleaning + num(i.perNightCharges);
}

/** What one booked night earns after variable costs. */
function contributionPerNight(i: FeasibilityInputs, rate: number) {
  return rate - variablePerNight(i, rate);
}

/** Share of each booked night's rate kept after percentage fees. */
function keptShare(i: FeasibilityInputs) {
  return (1 - num(i.platformFeePercent) / 100) * (1 - num(i.managementFeePercent) / 100);
}

export function calculateFeasibility(input: FeasibilityInputs): FeasibilityResult {
  const i = { ...input };
  const occ = clamp(num(i.occupancy), 0, 100);
  const rate = Math.max(0, num(i.nightlyRate));
  const rent = Math.max(0, num(i.annualRent));
  const running = Math.max(0, num(i.monthlyRunningCosts)) * 12;
  const licences = Math.max(0, num(i.yearlyLicences));
  const setup = Math.max(0, num(i.setupCost));
  const deposit = rent * (Math.max(0, num(i.depositPercent)) / 100);
  const cal = monthsFrom(i.startMonth, 12);
  const totalDays = cal.reduce((t, c) => t + c.days, 0);
  const season = Array.isArray(i.seasonality) && i.seasonality.length === 12 ? i.seasonality : null;

  // Seasonal multipliers are normalised so the year still averages the rate and occupancy entered.
  // Without this, the yearly total and the monthly table would disagree.
  const rawOcc = cal.map(c => occ * num(season?.[c.monthIndex]?.occ, 1));
  const occScale = rawOcc.reduce((t, o, k) => t + o * cal[k].days, 0) / (occ * totalDays || 1);
  const monthOcc = rawOcc.map(o => clamp(occScale ? o / occScale : o, 0, 98));
  const rawAdr = cal.map(c => rate * num(season?.[c.monthIndex]?.adr, 1));
  const nightsRaw = cal.map((c, k) => (monthOcc[k] / 100) * c.days);
  const revenueRaw = rawAdr.reduce((t, r, k) => t + r * nightsRaw[k], 0);
  const plainRevenue = rate * nightsRaw.reduce((t, n) => t + n, 0);
  const adrScale = revenueRaw > 0 ? plainRevenue / revenueRaw : 1;

  const paidIn = new Set(chequeMonths(i.cheques));
  const chequeAmount = rent / paidIn.size;
  const upfrontCash = setup + deposit + chequeAmount;

  let cumulative = -(setup + deposit);
  let paybackMonth: number | null = null;
  const months: MonthRow[] = cal.map((c, k) => {
    const nights = nightsRaw[k];
    const nightlyRate = rawAdr[k] * adrScale;
    const revenue = nightlyRate * nights;
    const variableCosts = variablePerNight(i, nightlyRate) * nights;
    const fixedCosts = running / 12 + rent / 12 + licences / 12;
    const profit = revenue - variableCosts - fixedCosts;
    const rentPaid = paidIn.has(k) ? chequeAmount : 0;
    const cashFlow = revenue - variableCosts - running / 12 - rentPaid - (k === 0 ? licences : 0);
    cumulative += cashFlow;
    if (paybackMonth === null && cumulative >= 0) paybackMonth = k + 1;
    return {
      month: c.key, label: `${MONTH_NAMES[c.monthIndex]} ${c.year}`, days: c.days,
      occupancy: monthOcc[k], nightlyRate, nights, revenue, variableCosts, fixedCosts, profit,
      rentPaid, cashFlow, cumulativeCash: cumulative,
    };
  });

  const sum = (f: (m: MonthRow) => number) => months.reduce((t, m) => t + f(m), 0);
  const revenue = sum(m => m.revenue);
  const bookedNights = sum(m => m.nights);
  const platformFees = revenue * (num(i.platformFeePercent) / 100);
  const managementFees = (revenue - platformFees) * (num(i.managementFeePercent) / 100);
  const cleaning = (num(i.cleaningPerStay) / Math.max(1, num(i.averageStayNights, 1))) * bookedNights;
  const perNight = num(i.perNightCharges) * bookedNights;
  const operatingProfit = revenue - platformFees - managementFees - cleaning - perNight - rent - running - licences;
  const fixed = rent + running + licences;

  // Break-even occupancy at the entered rate: booked nights needed to cover fixed costs.
  const contribution = contributionPerNight(i, rate);
  const breakEvenOccupancy = contribution > 0 ? clamp((fixed / contribution / totalDays) * 100, 0, 999) : null;

  // Nightly rate needed at the entered occupancy, for zero profit and for the target profit.
  // contribution(rate) = rate * kept - fixedPerNight  =>  rate = (fixed/nights + fixedPerNight) / kept
  const nightsAtOcc = (occ / 100) * totalDays;
  const perNightFixed = num(i.cleaningPerStay) / Math.max(1, num(i.averageStayNights, 1)) + num(i.perNightCharges);
  const kept = keptShare(i);
  const rateFor = (profit: number) =>
    nightsAtOcc > 0 && kept > 0 ? ((fixed + profit) / nightsAtOcc + perNightFixed) / kept : null;

  const result = {
    months, revenue, platformFees, managementFees, cleaning, perNight, rent, running, licences,
    operatingProfit,
    firstYearProfit: operatingProfit - setup,
    upfrontCash,
    returnOnCash: upfrontCash > 0 ? (operatingProfit / upfrontCash) * 100 : null,
    paybackMonth,
    breakEvenOccupancy,
    breakEvenRate: rateFor(0),
    targetRate: rateFor(Math.max(0, num(i.targetProfit))),
    bookedNights,
  };
  return { ...result, verdict: judge(result, occ) };
}

function judge(r: Omit<FeasibilityResult, 'verdict'>, occupancy: number): Verdict {
  const rules = VERDICT_RULES;
  const reasons: string[] = [];
  if (r.operatingProfit <= 0) {
    reasons.push('Costs are higher than booking income at this rate and occupancy.');
    return { level: 'not_viable', reasons };
  }
  if (r.breakEvenOccupancy !== null && r.breakEvenOccupancy >= occupancy) {
    reasons.push(`You would need ${Math.round(r.breakEvenOccupancy)}% occupancy just to cover costs.`);
    return { level: 'not_viable', reasons };
  }
  let level: VerdictLevel = 'viable';
  const cushion = r.breakEvenOccupancy === null ? Infinity : occupancy - r.breakEvenOccupancy;
  if (cushion < rules.minOccupancyCushion) {
    level = 'marginal';
    reasons.push(`Only ${Math.round(cushion)} points of occupancy between profit and loss.`);
  } else {
    reasons.push(`Occupancy can fall ${Math.round(cushion)} points before the unit loses money.`);
  }
  if (r.returnOnCash !== null && r.returnOnCash < rules.minReturnOnCash) {
    level = 'marginal';
    reasons.push(`Returns ${Math.round(r.returnOnCash)}% a year on the cash you put in, below ${rules.minReturnOnCash}%.`);
  } else if (r.returnOnCash !== null) {
    reasons.push(`Returns ${Math.round(r.returnOnCash)}% a year on the cash you put in.`);
  }
  if (r.paybackMonth === null || r.paybackMonth > rules.maxPaybackMonths) {
    level = 'marginal';
    reasons.push('Your upfront cash is not back within the first 12 months.');
  } else {
    reasons.push(`Upfront cash is back by month ${r.paybackMonth}.`);
  }
  return { level, reasons };
}

/** Yearly operating profit for a grid of occupancy and rate changes, for the "what if" table. */
export function sensitivity(
  inputs: FeasibilityInputs,
  occupancySteps = [-10, -5, 0, 5, 10],
  rateSteps = [-10, 0, 10],
) {
  return rateSteps.map(rs => ({
    rateChange: rs,
    cells: occupancySteps.map(os => {
      const occupancy = clamp(inputs.occupancy + os, 0, 100);
      const nightlyRate = inputs.nightlyRate * (1 + rs / 100);
      return { occupancyChange: os, occupancy, profit: calculateFeasibility({ ...inputs, occupancy, nightlyRate }).operatingProfit };
    }),
  }));
}

/** True when the inputs are complete enough to calculate. */
export function isReady(i: FeasibilityInputs) {
  return num(i.nightlyRate) > 0 && num(i.occupancy) > 0 && num(i.annualRent) > 0 && /^\d{4}-\d{2}$/.test(i.startMonth);
}
