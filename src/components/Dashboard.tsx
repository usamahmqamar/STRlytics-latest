/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, TrendingDown, Calendar, 
  AlertTriangle, CheckCircle2, Zap, Trophy,
  PieChart as PieIcon, BarChart3, Info, RefreshCw,
  Clock, CreditCard, ShieldAlert, Target,
  Layout, CheckSquare, BarChart as BarIcon,
  ChevronRight, ArrowUpRight, ArrowDownRight,
  Search, Filter, Plus, X, RotateCcw, Bell
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { GettingStarted } from './GettingStarted';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { UserData } from '../types';
import { format, parseISO, differenceInDays, isWithinInterval, addDays, subDays, startOfMonth } from 'date-fns';
import { cn } from '../lib/utils';
import { 
  calculateDailyPL, 
  getMonthlyKPIs, 

  getRevenueForecast,
  getMarketBenchmarks,
  getRiskAssessment,
  getCancellationExposure,
  getUpcomingTasks,
  getActionReminders,
  getStrategicGoals,
  getOpportunityScore,
  getOccupancyTrend,
  getRevenueByChannel,
  getBookingLeadTime,
  getADRTrendByProperty,
  getQuarterlyPerformance
} from '../services/analytics';

interface DashboardProps {
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
  filters: {
    apartmentId: string;
    startDate: string;
    endDate: string;
    displayCurrency: string;
  };
  onTabChange: (tab: string) => void;
  onImportPdfs?: () => void;
  /** Stored data (each amount in its own currency), for reminders that quote a specific amount. */
  rawData?: UserData;
}

const StatCard: React.FC<{
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down';
  conversionInfo?: string;
}> = ({ label, value, subValue, trend, conversionInfo }) => (
  <div className="flex flex-col group">
    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tracking-tight group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors duration-300">
      {label}
    </span>
    <div className="flex items-baseline gap-2 mt-1">
      <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
      {trend && (
        <div className={cn(
          "flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md",
          trend === 'up' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
        )}>
          {trend === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        </div>
      )}
    </div>
    {subValue && (
      <span className={cn(
        "text-xs mt-1.5 font-normal tracking-normal text-zinc-500 dark:text-zinc-400"
      )}>
        {subValue}
      </span>
    )}
    {conversionInfo && (
      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 italic font-medium opacity-70">
        {conversionInfo}
      </span>
    )}
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ data, setData, filters, onTabChange, onImportPdfs, rawData }) => {
  // Reminders quote a cheque or invoice as written, in its own currency, not converted.
  const source = rawData ?? data;
  const [isCustomizing, setIsCustomizing] = React.useState(false);

  const formatValue = (val: number) => {
    const converted = val;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: filters.displayCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(converted);
  };

  const StyledValue: React.FC<{ value: number }> = ({ value }) => (
    <span>{formatValue(value)}</span>
  );

  const currentKPIs = useMemo(() => {
    const month = format(parseISO(filters.endDate), 'yyyy-MM');
    const stats = getMonthlyKPIs(data, month);
    return stats.find(s => s.entity === (filters.apartmentId === 'ALL' ? 'PORTFOLIO' : data.apartments.find(a => a.apartment_id === filters.apartmentId)?.name));
  }, [data, filters]);

  const dailyPL = useMemo(() => {
    return calculateDailyPL(data, parseISO(filters.startDate), parseISO(filters.endDate), filters.apartmentId === 'ALL' ? undefined : filters.apartmentId);
  }, [data, filters]);

  // Period totals for the summary panel, from the same daily P&L the charts use.
  const summary = useMemo(() => {
    const revenue = dailyPL.reduce((t, d) => t + d.daily_revenue, 0);
    const costs = dailyPL.reduce((t, d) => t + d.total_daily_cost, 0);
    const profit = dailyPL.reduce((t, d) => t + d.daily_profit, 0);
    const nights = dailyPL.filter((d: any) => d.operating !== false).length;
    const booked = dailyPL.filter(d => d.occupied === 'yes').length;
    const nightlyRate = booked ? revenue / booked : 0;
    const days = new Set(dailyPL.map(d => d.date)).size;
    return {
      revenue, costs, profit, nights, booked, nightlyRate, days,
      occupancy: nights ? booked / nights : 0,
      breakEven: nightlyRate > 0 && nights ? costs / nightlyRate / nights : null,
    };
  }, [dailyPL]);

  const forecast = useMemo(() => getRevenueForecast(data), [data]);

  // Rent cheques from the leases themselves (previously a hard-coded example).
  const cheques = useMemo(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const in90 = format(addDays(today, 90), 'yyyy-MM-dd');
    const all = data.apartments.flatMap(a => a.rent_cheques || []);
    const isPaid = (c: any) => c.status === 'paid'; // due, postponed and bounced are all still owed
    const months = Array.from({ length: 6 }, (_, i) => {
      const m = format(addDays(startOfMonth(today), i * 31), 'yyyy-MM');
      return {
        label: format(parseISO(`${m}-01`), 'MMM'),
        rent: all.filter(c => !isPaid(c) && c.due_date?.startsWith(m)).reduce((t, c) => t + (c.amount || 0), 0),
        revenue: data.reservations.filter(r => r.status === 'confirmed' && r.check_in?.startsWith(m)).reduce((t, r) => t + (r.net_payout || 0), 0),
      };
    });
    return {
      total: all.reduce((t, c) => t + (c.amount || 0), 0),
      paid: all.filter(isPaid).reduce((t, c) => t + (c.amount || 0), 0),
      overdueCount: all.filter(c => !isPaid(c) && c.due_date && c.due_date < todayStr).length,
      upcomingCount: all.filter(c => !isPaid(c) && c.due_date && c.due_date >= todayStr && c.due_date <= in90).length,
      months,
    };
  }, [data]);
  const benchmarks = useMemo(() => getMarketBenchmarks(), []);
  const risk = useMemo(() => getRiskAssessment(data), [data]);
  const exposure = useMemo(() => getCancellationExposure(data), [data]);
  const upcomingTasks = useMemo(() => getUpcomingTasks(source), [source]);
  const actionReminders = useMemo(() => getActionReminders(source), [source]);
  // One list of things that cost money if ignored; overdue first, then soonest.
  const attention = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const items = [
      ...upcomingTasks.map((t: any) => ({
        id: `task-${t.id}`, title: t.title, detail: t.description, date: t.date,
        amount: null as number | null, overdue: t.date < today, tab: t.type === 'cheque' ? 'setup' : 'operations',
      })),
      ...actionReminders.filter((r: any) => r.type === 'payment').map((r: any) => ({
        id: `pay-${r.id}`, title: r.title.replace('Vendor Payment:', 'Pay'), detail: r.description, date: r.date,
        amount: r.amount as number | null, overdue: r.status === 'overdue', tab: 'operations',
      })),
    ];
    return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date));
  }, [upcomingTasks, actionReminders]);
  const strategicGoals = useMemo(() => getStrategicGoals(data), [data]);
  const opportunity = useMemo(() => getOpportunityScore(data), [data]);
  const occupancyTrend = useMemo(() => getOccupancyTrend(data), [data]);
  const channelRevenue = useMemo(() => getRevenueByChannel(data), [data]);
  const leadTimeData = useMemo(() => getBookingLeadTime(data), [data]);
  const adrTrend = useMemo(() => getADRTrendByProperty(data), [data]);

  const toggleWidget = (id: string) => {
    setData(prev => ({
      ...prev,
      dashboardWidgets: prev.dashboardWidgets.map(w => 
        w.id === id ? { ...w, visible: !w.visible } : w
      )
    }));
  };

  const resetWidgets = () => {
    setData(prev => ({
      ...prev,
      dashboardWidgets: prev.dashboardWidgets.map(w => ({ ...w, visible: true }))
    }));
  };

  const widgets = {
    'financial-health': (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
            <TrendingUp size={16} className="text-emerald-500" />
            <h3 className="text-base font-semibold">Profit and costs by day</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-zinc-550 dark:text-zinc-400 font-medium">Profit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span className="text-xs text-zinc-550 dark:text-zinc-400 font-medium">Costs</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Profit & Loss Summary */}
          <Card>
            <div className="h-[300px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyPL.reduce((acc: any[], curr) => {
                  const date = curr.date;
                  const existing = acc.find(a => a.date === date);
                  if (existing) {
                    existing.profit += curr.daily_profit;
                    existing.opex += curr.total_daily_cost;
                  } else {
                    acc.push({ date, profit: curr.daily_profit, opex: curr.total_daily_cost });
                  }
                  return acc;
                }, []).sort((a, b) => a.date.localeCompare(b.date))}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0e5a4a" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0e5a4a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceee9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 600, fill: '#949d95' }}
                    tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                  />
                  <YAxis hide />
                  <RechartsTooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white border border-zinc-200 p-3 rounded-xl shadow-xl">
                            <p className="text-[11px] font-semibold text-zinc-400 mb-2">{format(parseISO(String(label)), 'MMMM d, yyyy')}</p>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-emerald-600 flex justify-between gap-4">
                                Profit: <span>{formatValue(payload[0].value as number)}</span>
                              </p>
                              <p className="text-xs font-bold text-rose-600 flex justify-between gap-4">
                                Opex: <span>{formatValue(payload[1].value as number)}</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="profit" stroke="#0e5a4a" fill="url(#profitGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="opex" stroke="#b0472f" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-zinc-100">
              <div>
                <span className="text-xs text-zinc-500">Average daily profit</span>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{formatValue(summary.days ? summary.profit / summary.days : 0)}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Profit margin</span>
                <p className={cn("mt-1 text-lg font-semibold", summary.profit < 0 ? "text-rose-600" : "text-zinc-900")}>{summary.revenue > 0 ? `${Math.round((summary.profit / summary.revenue) * 100)}%` : '—'}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Break-even occupancy</span>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{summary.breakEven === null ? '—' : `${Math.round(summary.breakEven * 100)}%`}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{summary.breakEven === null ? 'Needs at least one booked night' : summary.breakEven > 1 ? 'Costs exceed full-occupancy revenue at this rate' : 'Nights you need booked to cover costs'}</p>
              </div>
            </div>
          </Card>

        </div>
      </div>
    ),
    'task-reminders': (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Needs attention</h3>
          <span className="text-xs text-zinc-500">{attention.length === 0 ? 'Nothing due' : `${attention.length} ${attention.length === 1 ? 'item' : 'items'}`}</span>
        </div>
        {attention.length === 0 ? (
          <p className="py-6 text-sm text-zinc-500">No overdue cheques, unpaid invoices or unbilled services. You are up to date.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {attention.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.tab)}
                  className="group flex w-full items-center gap-4 py-3 text-left"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", item.overdue ? "bg-rose-500" : "bg-amber-500")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{item.detail}</span>
                  </span>
                  <span className="hidden text-xs text-zinc-500 sm:block">{format(parseISO(item.date), 'd MMM yyyy')}</span>
                  {item.amount !== null && <span className="w-28 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">{formatValue(item.amount)}</span>}
                  <ChevronRight size={15} className="text-zinc-300 transition-colors group-hover:text-zinc-600" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    'reminders': (
      <Card title="Task Reminders" className="h-full">
        <p className="text-[11px] font-medium text-zinc-400 mb-6">{actionReminders.length} items requiring attention</p>
        <div className="space-y-4">
          {actionReminders.map(reminder => (
            <div key={reminder.id} className="flex items-center gap-4 p-3 bg-zinc-50 rounded-2xl border border-zinc-100 group hover:border-emerald-500/30 transition-all">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                reminder.type === 'payment' ? "bg-rose-50 text-rose-600" : 
                reminder.type === 'subscription' ? "bg-zinc-100 text-zinc-600" : "bg-rose-50 text-rose-600"
              )}>
                {reminder.type === 'payment' ? <CreditCard size={18} /> : 
                 reminder.type === 'subscription' ? <Bell size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-zinc-900 truncate">{reminder.title}</h4>
                  <span className={cn(
                    "text-[8px] font-semibold px-1.5 py-0.5 rounded",
                    reminder.status === 'overdue' ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"
                  )}>
                    {reminder.status}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">{reminder.description}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] font-bold text-zinc-400">
                    {format(parseISO(reminder.date), 'MMM d, yyyy')}
                  </span>
                  <span className="text-[11px] font-semibold text-zinc-900">
                    {formatValue(reminder.amount)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="w-full mt-6 py-2 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
          View All Tasks
        </button>
      </Card>
    ),
    'risk-assessment': (
      <Card title="Risk Assessment" className="h-full">
        <div className="space-y-4 mt-4">
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-rose-600">Financial Risk</span>
              <ShieldAlert size={14} className="text-rose-500" />
            </div>
            <h4 className="text-lg font-semibold text-rose-700">High Exposure</h4>
            <p className="text-[11px] font-medium text-rose-600/70 mt-1">
              {formatValue(risk.refundableRevenue)} in refundable bookings next 14 days.
            </p>
          </div>
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-amber-600">Operational Risk</span>
              <Zap size={14} className="text-amber-500" />
            </div>
            <h4 className="text-lg font-semibold text-amber-700">Maintenance Backlog</h4>
            <p className="text-[11px] font-medium text-amber-600/70 mt-1">
              3 critical AC repairs pending in Marina properties.
            </p>
          </div>
        </div>
      </Card>
    ),
    'kpi-stats': (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="col-span-1">
          <StatCard 
            label="Total Revenue" 
            value={formatValue(currentKPIs?.revenue || 0)} 
            subValue="Net Payout"
          />
        </Card>
        <Card className="col-span-1">
          <StatCard 
            label="Lost Revenue" 
            value={formatValue(currentKPIs?.lost_revenue || 0)} 
            subValue="Cancelled Bookings"
            trend="down"
          />
        </Card>
        <Card className="col-span-1">
          <StatCard 
            label="Occupancy Rate" 
            value={`${Math.round((currentKPIs?.occupancy_rate || 0) * 100)}%`} 
            subValue={`${currentKPIs?.occupied_nights || 0} / ${currentKPIs?.available_nights || 0} nights`}
            trend={(currentKPIs?.occupancy_rate || 0) > 0.7 ? 'up' : 'down'}
          />
        </Card>
        <Card className="col-span-1">
          <StatCard 
            label="ADR" 
            value={formatValue(currentKPIs?.ADR || 0)} 
            subValue="Average Daily Rate"
          />
        </Card>
        <Card className="col-span-1">
          <StatCard 
            label="Net Profit" 
            value={formatValue(currentKPIs?.net_profit || 0)} 
            subValue={`${Math.round((currentKPIs?.profit_margin || 0) * 100)}% Margin`}
            trend={(currentKPIs?.net_profit || 0) > 0 ? 'up' : 'down'}
          />
        </Card>
      </div>
    ),
    'cancellation-policy': (
      <Card title="Booking revenue by cancellation policy" className="h-full">
        <dl className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
          <div className="flex items-baseline justify-between py-4">
            <div>
              <dt className="text-sm text-zinc-900 dark:text-zinc-100">Non-refundable</dt>
              <dd className="text-xs text-zinc-500">{exposure.nonRefundable.count} {exposure.nonRefundable.count === 1 ? 'booking' : 'bookings'}, secured</dd>
            </div>
            <dd className="text-xl font-semibold text-zinc-900 dark:text-zinc-50"><StyledValue value={exposure.nonRefundable.amount} /></dd>
          </div>
          <div className="flex items-baseline justify-between py-4">
            <div>
              <dt className="text-sm text-zinc-900 dark:text-zinc-100">Refundable</dt>
              <dd className="text-xs text-zinc-500">{exposure.refundable.count} {exposure.refundable.count === 1 ? 'booking' : 'bookings'}, can still be cancelled</dd>
            </div>
            <dd className={cn("text-xl font-semibold", exposure.refundable.amount > 0 ? "text-amber-700" : "text-zinc-900 dark:text-zinc-50")}><StyledValue value={exposure.refundable.amount} /></dd>
          </div>
        </dl>
      </Card>
    ),
    'expense-breakdown': (
      <Card title="Where costs go" className="h-full">
        <div className="h-[300px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: 'Rent', value: 12000 },
                  { name: 'Utilities', value: 1200 },
                  { name: 'Cleaning', value: 800 },
                  { name: 'Maintenance', value: 450 },
                  { name: 'Platform', value: 1500 }
                ]}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {['#1a2420', '#0e5a4a', '#4f7a8c', '#a9843a', '#b0472f'].map((color, index) => (
                  <Cell key={`cell-${index}`} fill={color} />
                ))}
              </Pie>
              <RechartsTooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(val: number) => [formatValue(val), ""]}
              />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    'cheque-management': (
      <Card title="Rent cheques">
        <div className="mt-2 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-5">
            <div>
              <p className="text-xs text-zinc-500">Committed rent across all leases</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{formatValue(cheques.total)}</p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className="h-full bg-emerald-600" style={{ width: `${cheques.total ? Math.round((cheques.paid / cheques.total) * 100) : 0}%` }} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {formatValue(cheques.paid)} cleared, {cheques.total ? Math.round((cheques.paid / cheques.total) * 100) : 0}% of the total
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div>
                <dt className="text-xs text-zinc-500">Overdue</dt>
                <dd className={cn("mt-0.5 text-lg font-semibold", cheques.overdueCount ? "text-rose-600" : "text-zinc-900 dark:text-zinc-50")}>{cheques.overdueCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Due in 90 days</dt>
                <dd className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{cheques.upcomingCount}</dd>
              </div>
            </dl>
          </div>
          <div className="lg:col-span-2">
            <p className="mb-2 text-xs text-zinc-500">Rent due against confirmed booking revenue, next 6 months</p>
            <div className="h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cheques.months} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceee9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6c766f' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6c766f' }} width={56} />
                  <RechartsTooltip formatter={(val: number) => formatValue(val)} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" fill="#0e5a4a" name="Confirmed revenue" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="rent" fill="#a9843a" name="Rent due" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>
    ),
    'revenue-trend': (
      <Card title="Revenue & Profit Trend" className="h-full">
        <div className="h-[300px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyPL}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a2420" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#1a2420" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0e5a4a" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#0e5a4a" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceee9" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#949d95' }}
                minTickGap={30}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#949d95' }}
                tickFormatter={(val) => `${filters.displayCurrency} ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
              />
              <RechartsTooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(val: number) => [formatValue(val), ""]}
              />
              <Area 
                type="monotone" 
                dataKey="daily_revenue" 
                stroke="#1a2420" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#colorRev)" 
                name="Revenue"
              />
              <Area 
                type="monotone" 
                dataKey="daily_profit" 
                stroke="#0e5a4a" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#colorProfit)" 
                name="Profit"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    'apartment-performance': (
      <Card title="Apartment Performance">
        <div className="h-[300px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.apartments.map(apt => {
              const kpi = getMonthlyKPIs(data, format(new Date(), 'yyyy-MM')).find(k => k.entity === apt.name);
              return {
                name: apt.nickname || apt.name,
                revenue: kpi?.revenue || 0,
                profit: kpi?.net_profit || 0
              };
            })} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eceee9" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} width={100} />
              <RechartsTooltip />
              <Bar dataKey="revenue" fill="#0e5a4a" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    'kpi-summary': (
      <Card title="Monthly KPI Summary">
        <div className="overflow-x-auto mt-6">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="pb-4 text-[11px] font-semibold text-zinc-400">Entity</th>
                <th className="pb-4 text-[11px] font-semibold text-zinc-400 text-right">Occupancy</th>
                <th className="pb-4 text-[11px] font-semibold text-zinc-400 text-right">Revenue</th>
                <th className="pb-4 text-[11px] font-semibold text-zinc-400 text-right">ADR</th>
                <th className="pb-4 text-[11px] font-semibold text-zinc-400 text-right">RevPAR</th>
                <th className="pb-4 text-[11px] font-semibold text-zinc-400 text-right">Rating</th>
                <th className="pb-4 text-[11px] font-semibold text-zinc-400 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {getMonthlyKPIs(data, format(new Date(), 'yyyy-MM')).map((kpi, i) => (
                <tr key={i} className={cn(
                  "group hover:bg-zinc-50 transition-colors",
                  kpi.entity === 'PORTFOLIO' && "bg-zinc-50/50 font-bold"
                )}>
                  <td className="py-4 text-xs font-bold text-zinc-900">{kpi.entity}</td>
                  <td className="py-4 text-xs text-zinc-600 text-right">{Math.round(kpi.occupancy_rate * 100)}%</td>
                  <td className="py-4 text-xs text-zinc-600 text-right">{formatValue(kpi.revenue)}</td>
                  <td className="py-4 text-xs text-zinc-600 text-right">{formatValue(kpi.ADR)}</td>
                  <td className="py-4 text-xs text-zinc-600 text-right">{formatValue(kpi.RevPAR)}</td>
                  <td className="py-4 text-[11px] font-bold text-zinc-300 text-right italic">N/A</td>
                  <td className={cn(
                    "py-4 text-xs text-right font-bold",
                    kpi.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {formatValue(kpi.net_profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    ),
    'strategic-goals': (
      <Card title="Strategic Goals">
        <div className="space-y-8 mt-8">
          {strategicGoals.map(goal => (
            <div key={goal.id} className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-zinc-400">{goal.title}</span>
                <span className="text-xs font-semibold text-zinc-900">{goal.current}{goal.unit}</span>
              </div>
              <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-1000",
                    goal.id === 'expansion' ? "bg-emerald-500" : 
                    goal.id === 'revenue' ? "bg-emerald-500" : "bg-amber-500"
                  )} 
                  style={{ width: `${(goal.current / goal.target) * 100}%` }} 
                />
              </div>
              <div className="flex justify-end">
                <span className="text-[11px] font-bold text-zinc-400">Target: {goal.target}{goal.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    ),
    'occupancy-rate': (
      <Card title="Occupancy Rate Trend">
        <div className="h-[250px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={occupancyTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceee9" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} tickFormatter={(v) => `${v}%`} />
              <RechartsTooltip />
              <Area type="monotone" dataKey="rate" stroke="#0e5a4a" fill="#0e5a4a" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    'revenue-channel': (
      <Card title="Revenue by Channel">
        <div className="h-[250px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={channelRevenue}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {channelRevenue.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#1a2420', '#0e5a4a', '#4f7a8c', '#a9843a'][index % 4]} />
                ))}
              </Pie>
              <RechartsTooltip formatter={(val: number) => formatValue(val)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    'revenue-forecast': (
      <Card title="Confirmed revenue, next 3 months">
        <div className="h-[300px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={forecast}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceee9" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} />
              <RechartsTooltip />
              <Bar dataKey="confirmed" fill="#0e5a4a" name="Confirmed revenue" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Payouts from confirmed bookings checking in each month.</p>
      </Card>
    ),
    'market-benchmark': (
      <Card title="Market Benchmarking">
        <div className="h-[300px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
              { subject: 'Occupancy', A: 82, B: 75, fullMark: 100 },
              { subject: 'ADR', A: 850, B: 780, fullMark: 1000 },
              { subject: 'RevPAR', A: 697, B: 585, fullMark: 1000 }
            ]}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#949d95' }} />
              <Radar name="Market Average" dataKey="B" stroke="#0e5a4a" fill="#0e5a4a" fillOpacity={0.1} />
              <Radar name="Your Portfolio" dataKey="A" stroke="#1a2420" fill="#1a2420" fillOpacity={0.1} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-zinc-400">ADR vs Market</span>
            <span className="text-xs font-semibold text-emerald-600">+8.2%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-zinc-400">Occ. vs Market</span>
            <span className="text-xs font-semibold text-rose-600">-4.1%</span>
          </div>
        </div>
      </Card>
    ),
    'lead-time': (
      <Card title="Booking Lead Time">
        <div className="h-[250px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leadTimeData.data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceee9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} />
              <RechartsTooltip />
              <Bar dataKey="value" fill="#1a2420" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center gap-3">
          <Info size={16} className="text-zinc-400" />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Guests book <span className="font-semibold text-zinc-900">{leadTimeData.avg} days</span> ahead on average.
          </p>
        </div>
      </Card>
    ),
    'adr-by-property': (
      <Card title="ADR by Property (Monthly Trend)">
        <div className="h-[300px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={adrTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceee9" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#949d95' }} />
              <RechartsTooltip />
              <Legend />
              {data.apartments.map((apt, i) => (
                <Area 
                  key={apt.apartment_id} 
                  type="monotone" 
                  dataKey={apt.name} 
                  stroke={['#1a2420', '#0e5a4a', '#4f7a8c', '#a9843a'][i % 4]} 
                  fill={['#1a2420', '#0e5a4a', '#4f7a8c', '#a9843a'][i % 4]} 
                  fillOpacity={0.05} 
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    'opportunity-score': (
      <Card title="Opportunity Score">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle className="text-zinc-100" strokeWidth="8" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
              <circle 
                className="text-emerald-500" 
                strokeWidth="8" 
                strokeDasharray={2 * Math.PI * 40} 
                strokeDashoffset={2 * Math.PI * 40 * (1 - opportunity.score / 100)} 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
                r="40" 
                cx="50" 
                cy="50" 
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-semibold text-zinc-900">{opportunity.score}</span>
              <span className="text-[11px] font-semibold text-zinc-400">Score</span>
            </div>
          </div>
          <div className="mt-8 text-center px-6">
            <h4 className="text-sm font-semibold text-zinc-900">{opportunity.label}</h4>
            <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">{opportunity.insight}</p>
          </div>
        </div>
      </Card>
    )
  };

  const categories = [
    { id: 'urgent_reminders', name: 'Needs attention', icon: <AlertTriangle size={16} />, showHeading: false },
    { id: 'financial', name: 'Money', icon: <CreditCard size={16} />, showHeading: true },
    { id: 'operations', name: 'Rent cheques', icon: <Zap size={16} />, showHeading: false },
    { id: 'portfolio', name: 'Properties', icon: <Layout size={16} />, showHeading: true },
    { id: 'analytics', name: 'Bookings', icon: <BarIcon size={16} />, showHeading: true }
  ];
  // Retired: placeholder widgets with invented figures, and blocks now covered by the summary panel.
  const RETIRED = new Set(['strategic-goals', 'market-benchmark', 'opportunity-score', 'kpi-stats', 'reminders', 'risk-assessment', 'revenue-trend']);
  const isShown = (w: { id: string; visible: boolean }) => w.visible && !RETIRED.has(w.id);

  return (
    <div className="space-y-10 pb-20">
      <GettingStarted data={data} onTabChange={onTabChange} onImportPdfs={onImportPdfs ?? (() => onTabChange('reservations'))} />
      {data.apartments.length > 0 && <>
      {/* Summary: the one bold element on the page */}
      <section aria-label="Summary for the selected period" className="rounded-3xl bg-emerald-900 p-5 sm:p-7 text-white dark:border dark:border-emerald-800/60 dark:bg-emerald-950">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm text-emerald-200/80">Net profit, {format(parseISO(filters.startDate), 'd MMM')} to {format(parseISO(filters.endDate), 'd MMM yyyy')}</p>
            <p className={cn("mt-2 text-[34px] sm:text-[44px] font-semibold leading-none tracking-[-0.03em]", summary.profit < 0 && "text-rose-200")}>
              {formatValue(summary.profit)}
            </p>
            <p className="mt-3 text-sm text-emerald-100/80">
              {summary.revenue > 0
                ? `${Math.round((summary.profit / summary.revenue) * 100)}% of revenue kept after rent, fees and costs`
                : 'No booking revenue in this period yet'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCustomizing(!isCustomizing)}
              className="text-emerald-100 hover:bg-white/10 hover:text-white"
            >
              {isCustomizing ? <CheckSquare size={14} /> : <Layout size={14} />}
              {isCustomizing ? 'Done' : 'Choose sections'}
            </Button>
          </div>
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/15 pt-6 md:grid-cols-4">
          <div>
            <dt className="text-xs text-emerald-200/80">Revenue</dt>
            <dd className="mt-1 text-xl font-semibold">{formatValue(summary.revenue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-200/80">Costs</dt>
            <dd className="mt-1 text-xl font-semibold">{formatValue(summary.costs)}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-200/80">Occupancy</dt>
            <dd className="mt-1 text-xl font-semibold">{Math.round(summary.occupancy * 100)}%</dd>
            <dd className="text-xs text-emerald-200/70">{summary.booked} of {summary.nights} nights</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-200/80">Average nightly rate</dt>
            <dd className="mt-1 text-xl font-semibold">{summary.booked ? formatValue(summary.nightlyRate) : '—'}</dd>
          </div>
        </dl>
      </section>

      {/* Customization Panel */}
      {isCustomizing && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-base font-semibold">Choose dashboard sections</h3>
              <p className="mt-1 text-xs text-zinc-500">Your choice is saved for your account in this workspace.</p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={resetWidgets}
              className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-900"
            >
              <RotateCcw size={14} className="mr-2" />
              Show all
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map(cat => (
              <div key={cat.id} className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-500">
                  {cat.icon}
                  <span className="text-[11px] font-semibold">{cat.name}</span>
                </div>
                <div className="space-y-2">
                  {data.dashboardWidgets.filter(w => w.category === cat.id && !RETIRED.has(w.id)).map(widget => (
                    <label 
                      key={widget.id} 
                      className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-50 cursor-pointer transition-colors group"
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all",
                        widget.visible 
                          ? "bg-emerald-500 border-emerald-500" 
                          : "border-zinc-200 group-hover:border-zinc-400"
                      )}>
                        {widget.visible && <CheckSquare size={12} className="text-white" />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={widget.visible} 
                        onChange={() => toggleWidget(widget.id)}
                      />
                      <span className="text-xs font-bold">{widget.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard Grid */}
      <div className="space-y-12">
        {categories.map((category, catIndex) => {
          const visibleWidgets = data.dashboardWidgets.filter(w => w.category === category.id && isShown(w));
          if (visibleWidgets.length === 0) return null;

          return (
            <motion.div 
              key={category.id} 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: catIndex * 0.08 }}
              className="space-y-4"
            >
              {category.showHeading && (
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{category.name}</h2>
              )}

              <div className="grid grid-cols-12 gap-4">
                {visibleWidgets.map((widget, widgetIndex) => (
                  <div
                    key={widget.id}
                    className={cn(
                      widget.colSpan === 12 ? "col-span-12" :
                      widget.colSpan === 8 ? "col-span-12 lg:col-span-6" :
                      widget.colSpan === 6 ? "col-span-12 md:col-span-6" :
                      widget.colSpan === 4 ? "col-span-12 md:col-span-6 lg:col-span-4" :
                      "col-span-12"
                    )}
                  >
                    {(widgets as any)[widget.id] || null}
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
      </>}
    </div>
  );
};
