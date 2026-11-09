/**
 * Feasibility: should I take this unit on as a rent-to-rent holiday home?
 * Calculates as you type (src/lib/feasibility.ts). AI market estimates are optional.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, RotateCcw, Sparkles } from 'lucide-react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import { format, addMonths, startOfMonth } from 'date-fns';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { getMarketIntelligence } from '../services/ai';
import { cn } from '../lib/utils';
import {
  VERDICT_RULES, calculateFeasibility, isReady, sensitivity,
  type FeasibilityInputs, type VerdictLevel,
} from '../lib/feasibility';

const STORAGE_KEY = 'staylytics.feasibility.v2';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface FormState extends FeasibilityInputs {
  location: string;
  bedrooms: number;
  useSeasonality: boolean;
  marketNote: string;
  estimatedAt: string | null;
}

const DEFAULTS: FormState = {
  location: '',
  bedrooms: 1,
  startMonth: format(startOfMonth(addMonths(new Date(), 1)), 'yyyy-MM'),
  nightlyRate: 0,
  occupancy: 75,
  seasonality: null,
  useSeasonality: true,
  annualRent: 0,
  cheques: 4,
  depositPercent: 5,
  setupCost: 0,
  monthlyRunningCosts: 0,
  platformFeePercent: 15,
  managementFeePercent: 0,
  cleaningPerStay: 0,
  averageStayNights: 4,
  perNightCharges: 0,
  yearlyLicences: 0,
  targetProfit: 50000,
  marketNote: '',
  estimatedAt: null,
};

function loadSaved(): FormState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const aed = (v: number, digits = 0) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : `${Math.round(v)}%`);

/* ---------- small form pieces ---------- */

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <label className={cn('block', className)}>
    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
    <div className="mt-1.5">{children}</div>
    {hint && <span className="mt-1 block text-[11px] leading-snug text-zinc-500">{hint}</span>}
  </label>
);

const inputClass =
  'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

const NumberInput: React.FC<{
  value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; min?: number; max?: number; step?: number; placeholder?: string;
}> = ({ value, onChange, prefix, suffix, min = 0, max, step = 1, placeholder }) => (
  <div className="relative">
    {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">{prefix}</span>}
    <input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder ?? '0'}
      value={value === 0 ? '' : value}
      onChange={e => {
        const n = Number(e.target.value);
        onChange(Number.isFinite(n) ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : 0);
      }}
      className={cn(inputClass, prefix && 'pl-11', suffix && 'pr-12')}
    />
    {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">{suffix}</span>}
  </div>
);

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <fieldset className="space-y-4 border-t border-zinc-100 pt-5 first:border-t-0 first:pt-0 dark:border-zinc-800">
    <legend className="sr-only">{title}</legend>
    <p aria-hidden className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
    {children}
  </fieldset>
);

const VERDICT_STYLE: Record<VerdictLevel, { title: string; panel: string; sub: string }> = {
  viable: { title: 'Worth pursuing', panel: 'bg-emerald-900 text-white', sub: 'text-emerald-100/80' },
  marginal: { title: 'Marginal: proceed with care', panel: 'bg-amber-800 text-white', sub: 'text-amber-100/85' },
  not_viable: { title: 'Not viable at these numbers', panel: 'bg-rose-700 text-white', sub: 'text-rose-100/85' },
};

/* ---------- screen ---------- */

export const Projections: React.FC = () => {
  const [form, setForm] = useState<FormState>(loadSaved);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* storage unavailable */ }
  }, [form]);

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => setForm(f => ({ ...f, [key]: value }));

  const inputs: FeasibilityInputs = useMemo(
    () => ({ ...form, seasonality: form.useSeasonality ? form.seasonality : null }),
    [form],
  );
  const ready = isReady(inputs);
  const result = useMemo(() => (ready ? calculateFeasibility(inputs) : null), [inputs, ready]);
  const grid = useMemo(() => (ready ? sensitivity(inputs) : null), [inputs, ready]);

  const fillFromMarket = async () => {
    if (!form.location.trim()) { setEstimateError('Enter the area first, for example Dubai Marina.'); return; }
    setEstimating(true);
    setEstimateError(null);
    try {
      const m = await getMarketIntelligence(form.location.trim(), form.bedrooms);
      const months = Array.isArray(m.seasonality) ? m.seasonality : [];
      const season = MONTHS.map(name => {
        const hit = months.find((s: any) => typeof s?.month === 'string' && s.month.toLowerCase().startsWith(name.toLowerCase()));
        return { adr: Number(hit?.adrMultiplier) || 1, occ: Number(hit?.occMultiplier) || 1 };
      });
      setForm(f => ({
        ...f,
        nightlyRate: Math.round(m.adr) || f.nightlyRate,
        occupancy: Math.round(m.occupancy) || f.occupancy,
        annualRent: Math.round(m.typicalRent) || f.annualRent,
        setupCost: Math.round(m.furnishingCost) || f.setupCost,
        monthlyRunningCosts: Math.round(m.monthlyOpEx) || f.monthlyRunningCosts,
        seasonality: months.length ? season : null,
        marketNote: typeof m.marketInsight === 'string' ? m.marketInsight : '',
        estimatedAt: new Date().toISOString(),
      }));
    } catch (err: any) {
      setEstimateError(err?.message || 'Market estimates are not available right now. Enter the figures yourself.');
    } finally {
      setEstimating(false);
    }
  };

  const startLabel = (() => {
    const [y, m] = form.startMonth.split('-').map(Number);
    return y && m ? `${MONTHS[m - 1]} ${y}` : '';
  })();

  return (
    <div className="grid grid-cols-1 gap-6 pb-20 lg:grid-cols-12">
      {/* ---------------- Inputs ---------------- */}
      <div className="lg:col-span-4 print:hidden">
        <Card className="space-y-5 lg:sticky lg:top-6">
          <Group title="The unit">
            <Field label="Area">
              <input className={inputClass} placeholder="e.g. Dubai Marina" value={form.location} onChange={e => set('location')(e.target.value.slice(0, 100))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Size">
                <select className={inputClass} value={form.bedrooms} onChange={e => set('bedrooms')(Number(e.target.value))}>
                  <option value={0}>Studio</option>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} bedroom{n > 1 ? 's' : ''}</option>)}
                </select>
              </Field>
              <Field label="First month of bookings">
                <input type="month" className={inputClass} value={form.startMonth} onChange={e => e.target.value && set('startMonth')(e.target.value)} />
              </Field>
            </div>
            <Button variant="secondary" className="w-full" onClick={fillFromMarket} disabled={estimating}>
              {estimating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {estimating ? 'Estimating…' : 'Fill in market estimates'}
            </Button>
            {estimateError && <p className="text-xs text-rose-600" role="alert">{estimateError}</p>}
            {form.estimatedAt && !estimateError && (
              <p className="text-[11px] leading-snug text-zinc-500">
                Rate, occupancy, rent, setup and running costs were filled from an AI estimate on {format(new Date(form.estimatedAt), 'd MMM yyyy')}. Check them against real listings and quotes.
              </p>
            )}
          </Group>

          <Group title="Income">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Average nightly rate">
                <NumberInput prefix="AED" value={form.nightlyRate} onChange={set('nightlyRate')} />
              </Field>
              <Field label="Expected occupancy">
                <NumberInput suffix="%" max={100} value={form.occupancy} onChange={set('occupancy')} />
              </Field>
            </div>
            {form.seasonality && (
              <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" className="mt-0.5 accent-emerald-600" checked={form.useSeasonality} onChange={e => set('useSeasonality')(e.target.checked)} />
                <span>Apply the seasonal pattern from the market estimate (busier, pricier winter months)</span>
              </label>
            )}
          </Group>

          <Group title="Lease">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Annual rent">
                <NumberInput prefix="AED" value={form.annualRent} onChange={set('annualRent')} />
              </Field>
              <Field label="Rent cheques">
                <select className={inputClass} value={form.cheques} onChange={e => set('cheques')(Number(e.target.value))}>
                  {[1, 2, 4, 6, 12].map(n => <option key={n} value={n}>{n} {n === 1 ? 'cheque' : 'cheques'}</option>)}
                </select>
              </Field>
              <Field label="Furnishing and setup">
                <NumberInput prefix="AED" value={form.setupCost} onChange={set('setupCost')} />
              </Field>
              <Field label="Security deposit" hint="Refundable; counted as cash tied up">
                <NumberInput suffix="% rent" max={100} step={0.5} value={form.depositPercent} onChange={set('depositPercent')} />
              </Field>
            </div>
          </Group>

          <Group title="Running costs">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly running costs" hint="Utilities, internet, supplies, repairs">
                <NumberInput prefix="AED" value={form.monthlyRunningCosts} onChange={set('monthlyRunningCosts')} />
              </Field>
              <Field label="Platform commission" hint="Share the booking sites keep">
                <NumberInput suffix="%" max={50} step={0.5} value={form.platformFeePercent} onChange={set('platformFeePercent')} />
              </Field>
              <Field label="Cleaning per stay">
                <NumberInput prefix="AED" value={form.cleaningPerStay} onChange={set('cleaningPerStay')} />
              </Field>
              <Field label="Average stay">
                <NumberInput suffix="nights" min={1} value={form.averageStayNights} onChange={v => set('averageStayNights')(Math.max(1, v))} />
              </Field>
              <Field label="Per-night charges" hint="Tourism dirham and similar, per booked night">
                <NumberInput prefix="AED" value={form.perNightCharges} onChange={set('perNightCharges')} />
              </Field>
              <Field label="Yearly licences" hint="Holiday-home permit and renewals">
                <NumberInput prefix="AED" value={form.yearlyLicences} onChange={set('yearlyLicences')} />
              </Field>
              <Field label="Management fee" hint="Leave at 0 if you manage it yourself" className="col-span-2">
                <NumberInput suffix="% of income" max={60} step={0.5} value={form.managementFeePercent} onChange={set('managementFeePercent')} />
              </Field>
            </div>
          </Group>

          <Group title="Your goal">
            <Field label="Profit you want per year">
              <NumberInput prefix="AED" value={form.targetProfit} onChange={set('targetProfit')} />
            </Field>
          </Group>

          <button
            onClick={() => { setForm({ ...DEFAULTS }); setEstimateError(null); }}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <RotateCcw size={12} /> Start over
          </button>
        </Card>
      </div>

      {/* ---------------- Results ---------------- */}
      <div className="space-y-6 lg:col-span-8">
        {!result ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Test a unit before you sign the lease</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
              Enter the nightly rate, occupancy and annual rent, or type the area and use <span className="font-medium text-zinc-700 dark:text-zinc-300">Fill in market estimates</span>.
              You will see the cash you need up front, your yearly profit and the month your money comes back.
            </p>
            <ul className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-2 text-xs">
              {[
                ['Nightly rate', form.nightlyRate > 0],
                ['Occupancy', form.occupancy > 0],
                ['Annual rent', form.annualRent > 0],
              ].map(([label, done]) => (
                <li key={label as string} className={cn('rounded-full px-3 py-1', done ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800')}>
                  {done ? '✓ ' : ''}{label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {/* Verdict */}
            <section className={cn('rounded-3xl p-6 sm:p-7', VERDICT_STYLE[result.verdict.level].panel)} aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className={cn('text-sm', VERDICT_STYLE[result.verdict.level].sub)}>
                    {form.bedrooms === 0 ? 'Studio' : `${form.bedrooms}-bedroom`}{form.location ? ` in ${form.location}` : ''}, from {startLabel}
                  </p>
                  <h2 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">{VERDICT_STYLE[result.verdict.level].title}</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => window.print()} className="text-white/85 hover:bg-white/10 hover:text-white print:hidden">
                  <Printer size={14} /> Print or save as PDF
                </Button>
              </div>
              <ul className={cn('mt-4 space-y-1 text-sm', VERDICT_STYLE[result.verdict.level].sub)}>
                {result.verdict.reasons.map(r => <li key={r}>{r}</li>)}
              </ul>
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/15 pt-5 md:grid-cols-4">
                <div>
                  <dt className={cn('text-xs', VERDICT_STYLE[result.verdict.level].sub)}>Profit per year</dt>
                  <dd className="mt-1 text-xl font-semibold">{aed(result.operatingProfit)}</dd>
                  <dd className={cn('text-xs', VERDICT_STYLE[result.verdict.level].sub)}>before setup costs</dd>
                </div>
                <div>
                  <dt className={cn('text-xs', VERDICT_STYLE[result.verdict.level].sub)}>Cash needed up front</dt>
                  <dd className="mt-1 text-xl font-semibold">{aed(result.upfrontCash)}</dd>
                  <dd className={cn('text-xs', VERDICT_STYLE[result.verdict.level].sub)}>setup, deposit, first cheque</dd>
                </div>
                <div>
                  <dt className={cn('text-xs', VERDICT_STYLE[result.verdict.level].sub)}>Return on that cash</dt>
                  <dd className="mt-1 text-xl font-semibold">{pct(result.returnOnCash)}</dd>
                  <dd className={cn('text-xs', VERDICT_STYLE[result.verdict.level].sub)}>per year</dd>
                </div>
                <div>
                  <dt className={cn('text-xs', VERDICT_STYLE[result.verdict.level].sub)}>Cash back by</dt>
                  <dd className="mt-1 text-xl font-semibold">{result.paybackMonth ? result.months[result.paybackMonth - 1].label : 'Not in year one'}</dd>
                  <dd className={cn('text-xs', VERDICT_STYLE[result.verdict.level].sub)}>{result.paybackMonth ? `month ${result.paybackMonth}` : 'after rent cheques'}</dd>
                </div>
              </dl>
            </section>
            <p className="-mt-3 text-[11px] text-zinc-500">
              "Worth pursuing" means at least {VERDICT_RULES.minReturnOnCash}% a year on the cash you put in, that cash back within {VERDICT_RULES.maxPaybackMonths} months,
              and occupancy at least {VERDICT_RULES.minOccupancyCushion} points above break-even. Estimates only; not financial advice.
            </p>

            {/* Cash curve */}
            <Card title="Your cash, month by month">
              <p className="-mt-2 mb-3 text-xs text-zinc-500">Bars show each month's cash in minus cash out, including rent cheques when they are paid. The line is your running position after the money you put in.</p>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={result.months.map(m => ({ ...m, short: m.label.split(' ')[0] }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceee9" />
                    <XAxis dataKey="short" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6c766f' }} />
                    <YAxis axisLine={false} tickLine={false} width={56} tick={{ fontSize: 11, fill: '#6c766f' }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                    <RechartsTooltip formatter={(v: number, name: string) => [aed(v), name]} labelFormatter={(_, p: any) => p?.[0]?.payload?.label ?? ''} />
                    <ReferenceLine y={0} stroke="#949d95" />
                    <Bar dataKey="cashFlow" name="Cash this month" radius={[3, 3, 0, 0]}>
                      {result.months.map(m => <Cell key={m.month} fill={m.cashFlow >= 0 ? '#7db4a0' : '#dc9280'} />)}
                    </Bar>
                    <Line type="monotone" dataKey="cumulativeCash" name="Running position" stroke="#0e5a4a" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Pricing */}
              <Card title="Pricing you need">
                <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  <div className="flex items-baseline justify-between py-3">
                    <dt>
                      <span className="block text-sm text-zinc-900 dark:text-zinc-100">Break-even nightly rate</span>
                      <span className="block text-xs text-zinc-500">at {Math.round(form.occupancy)}% occupancy</span>
                    </dt>
                    <dd className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{result.breakEvenRate === null ? '—' : aed(result.breakEvenRate)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between py-3">
                    <dt>
                      <span className="block text-sm text-zinc-900 dark:text-zinc-100">Rate for your goal</span>
                      <span className="block text-xs text-zinc-500">{aed(form.targetProfit)} profit a year</span>
                    </dt>
                    <dd className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{result.targetRate === null ? '—' : aed(result.targetRate)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between py-3">
                    <dt>
                      <span className="block text-sm text-zinc-900 dark:text-zinc-100">Break-even occupancy</span>
                      <span className="block text-xs text-zinc-500">at {aed(form.nightlyRate)} a night</span>
                    </dt>
                    <dd className={cn('text-lg font-semibold', (result.breakEvenOccupancy ?? 999) >= form.occupancy ? 'text-rose-600' : 'text-zinc-900 dark:text-zinc-50')}>
                      {result.breakEvenOccupancy === null || result.breakEvenOccupancy > 100 ? 'Above 100%' : pct(result.breakEvenOccupancy)}
                    </dd>
                  </div>
                </dl>
              </Card>

              {/* Year P&L */}
              <Card title="First year, in full">
                <dl className="space-y-2 text-sm">
                  {[
                    ['Booking income', result.revenue, `${Math.round(result.bookedNights)} nights booked`],
                    ['Platform commission', -result.platformFees],
                    ...(result.managementFees ? [['Management fee', -result.managementFees] as const] : []),
                    ['Cleaning', -result.cleaning],
                    ...(result.perNight ? [['Per-night charges', -result.perNight] as const] : []),
                    ['Rent', -result.rent],
                    ['Running costs', -result.running],
                    ...(result.licences ? [['Licences', -result.licences] as const] : []),
                  ].map(([label, value, note]) => (
                    <div key={label as string} className="flex items-baseline justify-between">
                      <dt className="text-zinc-600 dark:text-zinc-400">{label}{note && <span className="ml-1.5 text-xs text-zinc-400">{note}</span>}</dt>
                      <dd className={cn((value as number) < 0 ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-900 dark:text-zinc-100')}>{aed(value as number)}</dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between border-t border-zinc-200 pt-2 font-semibold dark:border-zinc-700">
                    <dt className="text-zinc-900 dark:text-zinc-50">Profit before setup</dt>
                    <dd className={result.operatingProfit < 0 ? 'text-rose-600' : 'text-zinc-900 dark:text-zinc-50'}>{aed(result.operatingProfit)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between text-zinc-600 dark:text-zinc-400">
                    <dt>Setup, paid once</dt>
                    <dd>{aed(-form.setupCost)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between font-semibold">
                    <dt className="text-zinc-900 dark:text-zinc-50">Profit in year one</dt>
                    <dd className={result.firstYearProfit < 0 ? 'text-rose-600' : 'text-zinc-900 dark:text-zinc-50'}>{aed(result.firstYearProfit)}</dd>
                  </div>
                </dl>
              </Card>
            </div>

            {/* What if */}
            {grid && (
              <Card title="What if occupancy or rates move?">
                <p className="-mt-2 mb-3 text-xs text-zinc-500">Yearly profit before setup. The middle cell is your plan.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="py-2 pr-3 text-left text-xs font-medium text-zinc-500">Nightly rate</th>
                        {grid[0].cells.map(c => (
                          <th key={c.occupancyChange} className="px-2 py-2 text-right text-xs font-medium text-zinc-500">
                            {Math.round(c.occupancy)}% occupied
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.map(row => (
                        <tr key={row.rateChange} className="border-t border-zinc-100 dark:border-zinc-800">
                          <th scope="row" className="py-2.5 pr-3 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            {aed(form.nightlyRate * (1 + row.rateChange / 100))}
                            <span className="ml-1 text-zinc-400">{row.rateChange === 0 ? '(plan)' : `(${row.rateChange > 0 ? '+' : ''}${row.rateChange}%)`}</span>
                          </th>
                          {row.cells.map(c => (
                            <td
                              key={c.occupancyChange}
                              className={cn(
                                'px-2 py-2.5 text-right',
                                c.profit < 0 ? 'text-rose-600' : 'text-zinc-900 dark:text-zinc-100',
                                row.rateChange === 0 && c.occupancyChange === 0 && 'rounded-md bg-emerald-50 font-semibold dark:bg-emerald-950',
                              )}
                            >
                              {aed(c.profit)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Monthly detail */}
            <Card title="Month by month" className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-zinc-100 text-xs text-zinc-500 dark:border-zinc-800">
                      <th className="px-5 py-2.5 text-left font-medium">Month</th>
                      <th className="px-3 py-2.5 text-right font-medium">Occupancy</th>
                      <th className="px-3 py-2.5 text-right font-medium">Nightly rate</th>
                      <th className="px-3 py-2.5 text-right font-medium">Income</th>
                      <th className="px-3 py-2.5 text-right font-medium">Profit</th>
                      <th className="px-3 py-2.5 text-right font-medium">Rent cheque</th>
                      <th className="px-5 py-2.5 text-right font-medium">Cash position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.months.map(m => (
                      <tr key={m.month} className="border-b border-zinc-50 last:border-0 dark:border-zinc-800/60">
                        <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-100">{m.label}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{Math.round(m.occupancy)}%</td>
                        <td className="px-3 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{aed(m.nightlyRate)}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-900 dark:text-zinc-100">{aed(m.revenue)}</td>
                        <td className={cn('px-3 py-2.5 text-right', m.profit < 0 ? 'text-rose-600' : 'text-zinc-900 dark:text-zinc-100')}>{aed(m.profit)}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{m.rentPaid ? aed(m.rentPaid) : ''}</td>
                        <td className={cn('px-5 py-2.5 text-right font-medium', m.cumulativeCash < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-300')}>{aed(m.cumulativeCash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 pb-4 pt-2 text-[11px] text-zinc-500">
                Profit spreads rent evenly across the year; cash position follows the actual cheque dates. The deposit is assumed to come back only at the end of the lease.
              </p>
            </Card>

            {form.marketNote && (
              <Card title="Market notes (AI estimate)">
                <p className="max-w-prose text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{form.marketNote}</p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};
