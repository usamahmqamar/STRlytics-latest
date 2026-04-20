/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, BarChart3, PieChart as PieIcon, 
  ArrowUpRight, ArrowDownLeft, Target, 
  Activity, Zap, Clock, Star, Building2
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
  ComposedChart, Line
} from 'recharts';
import { Card } from './ui/Card';
import { UserData } from '../types';
import { format, parseISO, subMonths, differenceInDays } from 'date-fns';
import { calculateDailyPL, getMonthlyKPIs, convertCurrency } from '../services/analytics';
import { cn } from '../lib/utils';

interface AnalyticsProps {
  data: UserData;
  filters: {
    apartmentId: string;
    startDate: string;
    endDate: string;
    displayCurrency: string;
  };
}

export const Analytics: React.FC<AnalyticsProps> = ({ data, filters }) => {
  const formatValue = (val: number) => {
    const converted = convertCurrency(val, 'AED', filters.displayCurrency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: filters.displayCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(converted);
  };

  const monthlyStats = useMemo(() => {
    const stats = [];
    const entityName = filters.apartmentId === 'ALL' 
      ? 'PORTFOLIO' 
      : data.apartments.find(a => a.apartment_id === filters.apartmentId)?.name;

    for (let i = 5; i >= 0; i--) {
      const month = format(subMonths(new Date(), i), 'yyyy-MM');
      const monthKPIs = getMonthlyKPIs(data, month);
      const target = monthKPIs.find(s => s.entity === entityName);
      if (target) stats.push(target);
    }
    return stats;
  }, [data, filters.apartmentId]);

  const channelData = useMemo(() => {
    const channels: Record<string, number> = {};
    data.reservations.forEach(res => {
      if (res.status === 'cancelled') return;
      channels[res.channel] = (channels[res.channel] || 0) + res.total_booking_revenue_aed;
    });
    return Object.entries(channels).map(([name, value]) => ({ name, value }));
  }, [data.reservations]);

  const COLORS = ['#18181b', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

  const roiData = useMemo(() => {
    return data.apartments.map(apt => {
      const setupInvestment = apt.setup_costs.reduce((sum, cost) => sum + cost.amount_aed, 0);
      
      // Calculate total profit to date for this apartment
      // For simplicity, we'll use historical monthly KPIs we already have
      // In a real app, we'd calculate from start_operation_date to now
      let totalRevenue = 0;
      let totalCost = 0;
      
      // Let's look back at the last 12 months (or since start date)
      for (let i = 0; i < 12; i++) {
        const month = format(subMonths(new Date(), i), 'yyyy-MM');
        if (month < apt.start_operation_date.substring(0, 7)) continue;
        
        const monthKPIs = getMonthlyKPIs(data, month);
        const aptKPI = monthKPIs.find(s => s.entity === apt.name);
        if (aptKPI) {
          totalRevenue += aptKPI.revenue_aed;
          totalCost += aptKPI.total_cost_aed;
        }
      }
      
      const totalProfit = totalRevenue - totalCost;
      const roi = setupInvestment > 0 ? (totalProfit / setupInvestment) * 100 : 0;
      const monthlyAvgProfit = totalProfit / Math.max(1, Math.min(12, differenceInDays(new Date(), parseISO(apt.start_operation_date)) / 30));
      const paybackMonths = monthlyAvgProfit > 0 ? setupInvestment / monthlyAvgProfit : Infinity;

      return {
        name: apt.name,
        investment: setupInvestment,
        profit: totalProfit,
        roi,
        payback: paybackMonths
      };
    });
  }, [data]);

  return (
    <div className="space-y-8">
      {/* ROI Tracking Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-emerald-500 rounded-full" />
          <h2 className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100 uppercase italic">ROI Tracking</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {roiData.map((roi, i) => (
            <Card key={i} className="relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Target size={48} className="text-emerald-500" />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="text-zinc-400" size={14} />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{roi.name}</span>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Return on Investment</p>
                  <h3 className={cn(
                    "text-xl font-black font-mono tracking-tighter mt-1",
                    roi.roi >= 0 ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {roi.roi.toFixed(1)}%
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div>
                    <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Investment</p>
                    <p className="text-xs font-bold font-mono">{formatValue(roi.investment)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Net Profit</p>
                    <p className="text-xs font-bold font-mono">{formatValue(roi.profit)}</p>
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Est. Payback</p>
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                    {roi.payback === Infinity ? 'N/A' : `${roi.payback.toFixed(1)} Months`}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Revenue & Profit Trend (6 Months)">
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickFormatter={(val) => `${filters.displayCurrency} ${(val / 1000).toFixed(0)}k`}
                />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => [formatValue(val), ""]}
                />
                <Bar dataKey="revenue_aed" fill="#18181b" radius={[4, 4, 0, 0]} barSize={40} name="Revenue" />
                <Line type="monotone" dataKey="net_profit_aed" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} name="Net Profit" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Occupancy Rate Trend (%)">
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyStats}>
                <defs>
                  <linearGradient id="colorOcc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  domain={[0, 1]}
                  tickFormatter={(val) => `${Math.round(val * 100)}%`}
                />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => [`${Math.round(val * 100)}%`, "Occupancy"]}
                />
                <Area 
                  type="monotone" 
                  dataKey="occupancy_rate" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#colorOcc)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Revenue by Channel" className="lg:col-span-1">
          <div className="h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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

        <Card title="Monthly KPI Summary" className="lg:col-span-2">
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 font-bold text-zinc-400 uppercase tracking-widest">Month</th>
                  <th className="pb-4 font-bold text-zinc-400 uppercase tracking-widest">Revenue</th>
                  <th className="pb-4 font-bold text-zinc-400 uppercase tracking-widest">Occupancy</th>
                  <th className="pb-4 font-bold text-zinc-400 uppercase tracking-widest">ADR</th>
                  <th className="pb-4 font-bold text-zinc-400 uppercase tracking-widest">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {monthlyStats.slice().reverse().map((s, i) => (
                  <tr key={i} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-4 font-bold text-zinc-900">{s.month}</td>
                    <td className="py-4 font-mono">{formatValue(s.revenue_aed)}</td>
                    <td className="py-4">{Math.round(s.occupancy_rate * 100)}%</td>
                    <td className="py-4 font-mono">{formatValue(s.ADR_aed)}</td>
                    <td className="py-4">
                      <span className={cn(
                        "font-bold",
                        s.net_profit_aed >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {formatValue(s.net_profit_aed)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};
