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
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { UserData } from '../types';
import { format, parseISO, differenceInDays, isWithinInterval, addDays, subDays, startOfMonth } from 'date-fns';
import { cn } from '../lib/utils';
import { 
  calculateDailyPL, 
  getMonthlyKPIs, 
  convertCurrency,
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
}

const StatCard: React.FC<{
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down';
  conversionInfo?: string;
}> = ({ label, value, subValue, trend, conversionInfo }) => (
  <div className="flex flex-col group">
    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest group-hover:text-emerald-500 transition-colors duration-500">
      {label}
    </span>
    <div className="flex items-baseline gap-2 mt-2">
      <span className="text-3xl font-black text-zinc-900 dark:text-zinc-100 font-mono tracking-tighter">
        {value}
      </span>
      {trend && (
        <div className={cn(
          "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md",
          trend === 'up' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
        )}>
          {trend === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        </div>
      )}
    </div>
    {subValue && (
      <span className={cn(
        "text-[10px] mt-2 font-black uppercase tracking-[0.2em]",
        trend === 'up' ? "text-emerald-500/80" : trend === 'down' ? "text-rose-500/80" : "text-zinc-500"
      )}>
        {subValue}
      </span>
    )}
    {conversionInfo && (
      <span className="text-[9px] text-zinc-500 mt-1 italic font-medium opacity-60">
        {conversionInfo}
      </span>
    )}
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ data, setData, filters, onTabChange }) => {
  const [isCustomizing, setIsCustomizing] = React.useState(false);

  const formatValue = (val: number) => {
    const converted = convertCurrency(val, 'AED', filters.displayCurrency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: filters.displayCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(converted);
  };

  const StyledValue: React.FC<{ value: number }> = ({ value }) => (
    <span className="font-mono tracking-tighter">{formatValue(value)}</span>
  );

  const currentKPIs = useMemo(() => {
    const month = format(parseISO(filters.endDate), 'yyyy-MM');
    const stats = getMonthlyKPIs(data, month);
    return stats.find(s => s.entity === (filters.apartmentId === 'ALL' ? 'PORTFOLIO' : data.apartments.find(a => a.apartment_id === filters.apartmentId)?.name));
  }, [data, filters]);

  const dailyPL = useMemo(() => {
    return calculateDailyPL(data, parseISO(filters.startDate), parseISO(filters.endDate), filters.apartmentId === 'ALL' ? undefined : filters.apartmentId);
  }, [data, filters]);

  const forecast = useMemo(() => getRevenueForecast(data), [data]);
  const benchmarks = useMemo(() => getMarketBenchmarks(), []);
  const risk = useMemo(() => getRiskAssessment(data), [data]);
  const exposure = useMemo(() => getCancellationExposure(data), [data]);
  const upcomingTasks = useMemo(() => getUpcomingTasks(data), [data]);
  const actionReminders = useMemo(() => getActionReminders(data), [data]);
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
          <div className="flex items-center gap-2 text-zinc-900">
            <TrendingUp size={18} className="text-emerald-500" />
            <h3 className="text-sm font-black uppercase tracking-widest">Financial Health & P&L Analysis</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Profit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Opex</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profit & Loss Summary */}
          <Card className="lg:col-span-2">
            <div className="h-[300px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyPL.reduce((acc: any[], curr) => {
                  const date = curr.date;
                  const existing = acc.find(a => a.date === date);
                  if (existing) {
                    existing.profit += curr.daily_profit_aed;
                    existing.opex += curr.total_daily_cost_aed;
                  } else {
                    acc.push({ date, profit: curr.daily_profit_aed, opex: curr.total_daily_cost_aed });
                  }
                  return acc;
                }, []).sort((a, b) => a.date.localeCompare(b.date))}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 600, fill: '#a1a1aa' }}
                    tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                  />
                  <YAxis hide />
                  <RechartsTooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white border border-zinc-200 p-3 rounded-xl shadow-xl">
                            <p className="text-[10px] font-black text-zinc-400 uppercase mb-2">{format(parseISO(String(label)), 'MMMM d, yyyy')}</p>
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
                  <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#profitGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="opex" stroke="#f43f5e" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-zinc-100">
              <div>
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Avg. Daily Profit</span>
                <p className="text-lg font-black text-zinc-900 mt-1">
                  {formatValue(dailyPL.reduce((sum, d) => sum + d.daily_profit_aed, 0) / (dailyPL.length || 1))}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Opex Efficiency</span>
                <p className="text-lg font-black text-emerald-600 mt-1">
                  {Math.round((dailyPL.reduce((sum, d) => sum + d.daily_profit_aed, 0) / (dailyPL.reduce((sum, d) => sum + d.daily_revenue_aed, 0) || 1)) * 100)}%
                </p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Break-even Occ.</span>
                <p className="text-lg font-black text-zinc-900 mt-1">
                  {Math.round((dailyPL.reduce((sum, d) => sum + d.total_daily_cost_aed, 0) / (dailyPL.reduce((sum, d) => sum + d.daily_revenue_aed, 0) / (dailyPL.filter(d => d.occupied === 'yes').length || 1) || 1)) / (dailyPL.length / data.apartments.length || 1) * 100)}%
                </p>
              </div>
            </div>
          </Card>

          {/* Efficiency & Insights */}
          <div className="space-y-6">
            <Card className="bg-zinc-900 text-white border-none shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-20">
                <Target size={40} className="text-emerald-400" />
              </div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Profit Maximizer</h4>
              <div className="mt-4">
                <p className="text-xs font-medium text-zinc-400 leading-relaxed">
                  Your portfolio efficiency is <span className="text-white font-bold">82%</span>. 
                  Increasing weekend ADR by <span className="text-emerald-400 font-bold">12%</span> could yield an extra <span className="text-white font-bold">{formatValue(5400)}</span> this month.
                </p>
              </div>
              <Button className="w-full mt-6 bg-emerald-500 hover:bg-emerald-400 text-zinc-900 font-black text-[10px] uppercase tracking-widest py-4">
                View Optimization Plan
              </Button>
            </Card>

            <Card title="Opex Minimization" className="border-rose-100">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                      <Zap size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-900">Utilities Spike</p>
                      <p className="text-[9px] text-zinc-500">Apt 101 - DEWA</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-rose-600">+15% vs Avg</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-900">Cleaning Optimized</p>
                      <p className="text-[9px] text-zinc-500">Portfolio-wide</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-emerald-600">-5% vs Last Mo</span>
                </div>
              </div>
              <p className="text-[9px] text-zinc-400 mt-6 italic font-medium">
                * Identifying these leaks can save you up to {formatValue(1200)} monthly.
              </p>
            </Card>
          </div>
        </div>
      </div>
    ),
    'task-reminders': (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-900">
            <Bell size={18} className="text-emerald-500" />
            <h3 className="text-sm font-black uppercase tracking-widest">Urgent Reminders</h3>
          </div>
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full">
            {upcomingTasks.length} Tasks
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {upcomingTasks.map(task => (
            <Card key={task.id} className="p-4 hover:border-emerald-500/30 transition-all cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  task.type === 'cheque' ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                )}>
                  {task.type === 'cheque' ? <CreditCard size={20} /> : <Clock size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-zinc-900 truncate">{task.title}</h4>
                    {task.urgent && <AlertTriangle size={14} className="text-rose-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{task.description}</p>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-2">
                    {format(parseISO(task.date), 'MMM d, yyyy')}
                  </p>
                </div>
                <ChevronRight size={16} className="text-zinc-300 group-hover:text-emerald-500 transition-colors" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    ),
    'reminders': (
      <Card title="Task Reminders" className="h-full">
        <p className="text-[10px] font-medium text-zinc-400 mb-6">{actionReminders.length} items requiring attention</p>
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
                    "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                    reminder.status === 'overdue' ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"
                  )}>
                    {reminder.status}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5">{reminder.description}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] font-bold text-zinc-400">
                    {format(parseISO(reminder.date), 'MMM d, yyyy')}
                  </span>
                  <span className="text-[10px] font-black text-zinc-900">
                    {formatValue(reminder.amount)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="w-full mt-6 py-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:bg-emerald-50 rounded-xl transition-all">
          View All Tasks
        </button>
      </Card>
    ),
    'risk-assessment': (
      <Card title="Risk Assessment" className="h-full">
        <div className="space-y-4 mt-4">
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Financial Risk</span>
              <ShieldAlert size={14} className="text-rose-500" />
            </div>
            <h4 className="text-lg font-black text-rose-700">High Exposure</h4>
            <p className="text-[10px] font-medium text-rose-600/70 mt-1">
              {formatValue(risk.refundableRevenue)} in refundable bookings next 14 days.
            </p>
          </div>
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Operational Risk</span>
              <Zap size={14} className="text-amber-500" />
            </div>
            <h4 className="text-lg font-black text-amber-700">Maintenance Backlog</h4>
            <p className="text-[10px] font-medium text-amber-600/70 mt-1">
              3 critical AC repairs pending in Marina properties.
            </p>
          </div>
        </div>
      </Card>
    ),
    'kpi-stats': (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="col-span-1">
          <StatCard 
            label="Total Revenue" 
            value={formatValue(currentKPIs?.revenue_aed || 0)} 
            subValue="Net Payout"
          />
        </Card>
        <Card className="col-span-1">
          <StatCard 
            label="Lost Revenue" 
            value={formatValue(currentKPIs?.lost_revenue_aed || 0)} 
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
            value={formatValue(currentKPIs?.ADR_aed || 0)} 
            subValue="Average Daily Rate"
          />
        </Card>
        <Card className="col-span-1">
          <StatCard 
            label="Net Profit" 
            value={formatValue(currentKPIs?.net_profit_aed || 0)} 
            subValue={`${Math.round((currentKPIs?.profit_margin || 0) * 100)}% Margin`}
            trend={(currentKPIs?.net_profit_aed || 0) > 0 ? 'up' : 'down'}
          />
        </Card>
      </div>
    ),
    'cancellation-policy': (
      <Card title="Cancellation Policy Exposure">
        <div className="grid grid-cols-1 gap-6 mt-6">
          <div className="p-6 bg-zinc-50 rounded-[2rem] border border-zinc-100">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Non-Refundable</span>
              <span className="text-xs font-black text-zinc-900">{exposure.nonRefundable.count}</span>
            </div>
            <h3 className="text-3xl font-black text-zinc-900"><StyledValue value={exposure.nonRefundable.amount} /></h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Confirmed Revenue</p>
          </div>
          <div className="p-6 bg-zinc-50 rounded-[2rem] border border-zinc-100">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Refundable</span>
              <span className="text-xs font-black text-zinc-900">{exposure.refundable.count}</span>
            </div>
            <h3 className="text-3xl font-black text-zinc-900"><StyledValue value={exposure.refundable.amount} /></h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">At Risk (Flexible)</p>
          </div>
        </div>
      </Card>
    ),
    'expense-breakdown': (
      <Card title="Expense Breakdown">
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
                {['#18181b', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'].map((color, index) => (
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
      <Card title="Cheque Management & Coverage">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          <div className="space-y-6">
            <div className="p-6 bg-zinc-50 rounded-[2rem] border border-zinc-100">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Committed Rent</p>
              <h3 className="text-3xl font-black text-zinc-900">{formatValue(72000)}</h3>
              <div className="mt-4 space-y-2">
                <div className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: '50%' }} />
                </div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                  <span className="text-zinc-400">Paid: {formatValue(36000)}</span>
                  <span className="text-zinc-900">50.0%</span>
                </div>
              </div>
            </div>
            <div className="p-6 bg-zinc-50 rounded-[2rem] border border-zinc-100">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Upcoming Cheques</p>
                <span className="text-xs font-black text-zinc-900">0</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[
                  { month: 'Apr', revenue: 35000, rent: 36000 },
                  { month: 'May', revenue: 38000, rent: 0 },
                  { month: 'Jun', revenue: 42000, rent: 0 },
                  { month: 'Jul', revenue: 40000, rent: 0 },
                  { month: 'Aug', revenue: 38000, rent: 0 },
                  { month: 'Sep', revenue: 45000, rent: 0 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.1} name="Projected Revenue" />
                  <Bar dataKey="rent" fill="#ef4444" radius={[4, 4, 0, 0]} name="Rent Due" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900">Coverage Health: Excellent</p>
                <p className="text-[10px] text-emerald-700">Projected revenue covers 100% of upcoming rent cheques for the next 4 months.</p>
              </div>
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
                  <stop offset="5%" stopColor="#18181b" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#a1a1aa' }}
                minTickGap={30}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#a1a1aa' }}
                tickFormatter={(val) => `${filters.displayCurrency} ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
              />
              <RechartsTooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(val: number) => [formatValue(val), ""]}
              />
              <Area 
                type="monotone" 
                dataKey="daily_revenue_aed" 
                stroke="#18181b" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#colorRev)" 
                name="Revenue"
              />
              <Area 
                type="monotone" 
                dataKey="daily_profit_aed" 
                stroke="#10b981" 
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
                revenue: kpi?.revenue_aed || 0,
                profit: kpi?.net_profit_aed || 0
              };
            })} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f4f4f5" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} width={100} />
              <RechartsTooltip />
              <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
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
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Entity</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Occupancy</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Revenue</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">ADR</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">RevPAR</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Rating</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Profit</th>
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
                  <td className="py-4 text-xs text-zinc-600 text-right">{formatValue(kpi.revenue_aed)}</td>
                  <td className="py-4 text-xs text-zinc-600 text-right">{formatValue(kpi.ADR_aed)}</td>
                  <td className="py-4 text-xs text-zinc-600 text-right">{formatValue(kpi.RevPAR_aed)}</td>
                  <td className="py-4 text-[10px] font-bold text-zinc-300 text-right italic">N/A</td>
                  <td className={cn(
                    "py-4 text-xs text-right font-bold",
                    kpi.net_profit_aed >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {formatValue(kpi.net_profit_aed)}
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
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{goal.title}</span>
                <span className="text-xs font-black text-zinc-900">{goal.current}{goal.unit}</span>
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
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Target: {goal.target}{goal.unit}</span>
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
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(v) => `${v}%`} />
              <RechartsTooltip />
              <Area type="monotone" dataKey="rate" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
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
                  <Cell key={`cell-${index}`} fill={['#18181b', '#10b981', '#3b82f6', '#f59e0b'][index % 4]} />
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
      <Card title="Revenue Forecast (3-Month Projection)">
        <div className="h-[300px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={forecast}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <RechartsTooltip />
              <Legend />
              <Bar dataKey="confirmed" stackId="a" fill="#18181b" name="Current Month" />
              <Bar dataKey="projected" stackId="a" fill="#10b981" name="Projected Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-900">Growth Insight</p>
            <p className="text-[10px] text-emerald-700">Based on your last 3 months, we project a <span className="font-bold text-emerald-600">~5.2% monthly growth</span>. Optimizing weekend pricing could increase this to 7.5%.</p>
          </div>
        </div>
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
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <Radar name="Market Average" dataKey="B" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
              <Radar name="Your Portfolio" dataKey="A" stroke="#18181b" fill="#18181b" fillOpacity={0.1} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-400 uppercase">ADR vs Market</span>
            <span className="text-xs font-black text-emerald-600">+8.2%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-400 uppercase">Occ. vs Market</span>
            <span className="text-xs font-black text-rose-600">-4.1%</span>
          </div>
        </div>
      </Card>
    ),
    'lead-time': (
      <Card title="Booking Lead Time">
        <div className="h-[250px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leadTimeData.data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <RechartsTooltip />
              <Bar dataKey="value" fill="#18181b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center gap-3">
          <Info size={16} className="text-zinc-400" />
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            Average lead time is <span className="font-bold text-zinc-900">{leadTimeData.avg} days</span>. Last minute bookings (0-3 days) account for 15% of total volume.
          </p>
        </div>
      </Card>
    ),
    'adr-by-property': (
      <Card title="ADR by Property (Monthly Trend)">
        <div className="h-[300px] w-full mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={adrTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <RechartsTooltip />
              <Legend />
              {data.apartments.map((apt, i) => (
                <Area 
                  key={apt.apartment_id} 
                  type="monotone" 
                  dataKey={apt.name} 
                  stroke={['#18181b', '#10b981', '#3b82f6', '#f59e0b'][i % 4]} 
                  fill={['#18181b', '#10b981', '#3b82f6', '#f59e0b'][i % 4]} 
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
              <span className="text-4xl font-black text-zinc-900">{opportunity.score}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Score</span>
            </div>
          </div>
          <div className="mt-8 text-center px-6">
            <h4 className="text-sm font-black text-zinc-900 uppercase tracking-widest">{opportunity.label}</h4>
            <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">{opportunity.insight}</p>
          </div>
        </div>
      </Card>
    )
  };

  const categories = [
    { id: 'urgent_reminders', name: 'Urgent Reminders', icon: <AlertTriangle size={16} /> },
    { id: 'financial', name: 'Financial', icon: <CreditCard size={16} /> },
    { id: 'operations', name: 'Operations', icon: <Zap size={16} /> },
    { id: 'portfolio', name: 'Portfolio', icon: <Layout size={16} /> },
    { id: 'analytics', name: 'Analytics', icon: <BarIcon size={16} /> }
  ];

  return (
    <div className="space-y-12 pb-20 grid-pattern min-h-screen">
      {/* Controls - Moved to sub-header style */}
      <div className="flex items-center justify-end gap-3 mb-8">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setIsCustomizing(!isCustomizing)}
          className={cn(
            "gap-2 px-4",
            isCustomizing && "bg-zinc-900 text-white"
          )}
        >
          {isCustomizing ? <CheckSquare size={14} /> : <Layout size={14} />}
          {isCustomizing ? 'Done' : 'Customize'}
        </Button>
        <Button variant="outline" size="sm" className="gap-2 px-4">
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* Customization Panel */}
      {isCustomizing && (
        <div className="p-8 bg-white border border-zinc-200 rounded-3xl text-zinc-900 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black tracking-tight">Customize Your View</h3>
              <p className="text-xs font-medium text-zinc-400 mt-1">Toggle widgets to build your perfect workspace</p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={resetWidgets}
              className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900"
            >
              <RotateCcw size={14} className="mr-2" />
              Reset to Default
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {categories.map(cat => (
              <div key={cat.id} className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-500">
                  {cat.icon}
                  <span className="text-[10px] font-black uppercase tracking-widest">{cat.name}</span>
                </div>
                <div className="space-y-2">
                  {data.dashboardWidgets.filter(w => w.category === cat.id).map(widget => (
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
      <div className="space-y-24">
        {categories.map((category, catIndex) => {
          const visibleWidgets = data.dashboardWidgets.filter(w => w.category === category.id && w.visible);
          if (visibleWidgets.length === 0) return null;

          return (
            <motion.div 
              key={category.id} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: catIndex * 0.1 }}
              className="space-y-10"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-white shadow-xl">
                  {category.icon}
                </div>
                <div>
                  <h2 className="text-xl font-black text-zinc-900 uppercase tracking-[0.3em]">{category.name}</h2>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">System Module {catIndex + 1}</p>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-zinc-200 via-zinc-100 to-transparent ml-6" />
              </div>

              <div className="grid grid-cols-12 gap-10">
                {visibleWidgets.map((widget, widgetIndex) => (
                  <motion.div 
                    key={widget.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (catIndex * 0.1) + (widgetIndex * 0.05) }}
                    className={cn(
                      widget.colSpan === 12 ? "col-span-12" :
                      widget.colSpan === 8 ? "col-span-12 lg:col-span-8" :
                      widget.colSpan === 6 ? "col-span-12 md:col-span-6" :
                      widget.colSpan === 4 ? "col-span-12 md:col-span-6 lg:col-span-4" :
                      "col-span-12"
                    )}
                  >
                    {(widgets as any)[widget.id] || null}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
