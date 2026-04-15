/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Calendar as CalendarIcon, 
  TrendingUp, 
  TrendingDown, 
  Filter, 
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, parseISO, isSameDay } from 'date-fns';
import { UserData } from '../types';
import { calculateDailyPL, convertCurrency } from '../services/analytics';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

interface DailyPLProps {
  data: UserData;
  filters: {
    apartmentId: string;
    startDate: string;
    endDate: string;
    displayCurrency: string;
  };
}

export const DailyPL: React.FC<DailyPLProps> = ({ data, filters }) => {
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const dailyData = useMemo(() => {
    const results = calculateDailyPL(
      data, 
      parseISO(filters.startDate), 
      parseISO(filters.endDate),
      filters.apartmentId === 'ALL' ? undefined : filters.apartmentId
    );
    return results;
  }, [data, filters]);

  const chartData = useMemo(() => {
    // Group by date for the chart
    const grouped: Record<string, any> = {};
    dailyData.forEach(d => {
      if (!grouped[d.date]) {
        grouped[d.date] = {
          date: d.date,
          revenue: 0,
          cost: 0,
          profit: 0
        };
      }
      grouped[d.date].revenue += d.daily_revenue_aed;
      grouped[d.date].cost += d.total_daily_cost_aed;
      grouped[d.date].profit += d.daily_profit_aed;
    });
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyData]);

  const totals = useMemo(() => {
    return dailyData.reduce((acc, curr) => ({
      revenue: acc.revenue + curr.daily_revenue_aed,
      cost: acc.cost + curr.total_daily_cost_aed,
      profit: acc.profit + curr.daily_profit_aed,
      lost: acc.lost + curr.lost_revenue_aed
    }), { revenue: 0, cost: 0, profit: 0, lost: 0 });
  }, [dailyData]);

  const formatCurrency = (val: number) => {
    const converted = convertCurrency(val, 'AED', filters.displayCurrency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: filters.displayCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(converted);
  };

  const toggleDay = (date: string) => {
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));
  };

  // Group data by date for the table
  const tableData = useMemo(() => {
    const grouped: Record<string, { date: string, total: any, properties: any[] }> = {};
    dailyData.forEach(d => {
      if (!grouped[d.date]) {
        grouped[d.date] = {
          date: d.date,
          total: {
            revenue: 0,
            lost: 0,
            rent: 0,
            utilities: 0,
            cleaning: 0,
            expenses: 0,
            totalCost: 0,
            profit: 0
          },
          properties: []
        };
      }
      grouped[d.date].total.revenue += d.daily_revenue_aed;
      grouped[d.date].total.lost += d.lost_revenue_aed;
      grouped[d.date].total.rent += d.daily_rent_aed;
      grouped[d.date].total.utilities += (d.daily_electricity_aed + d.daily_internet_aed);
      grouped[d.date].total.cleaning += d.cleaning_allocated_aed;
      grouped[d.date].total.expenses += (d.other_costs_allocated_aed + d.real_time_expenses_aed);
      grouped[d.date].total.totalCost += d.total_daily_cost_aed;
      grouped[d.date].total.profit += d.daily_profit_aed;
      
      grouped[d.date].properties.push(d);
    });
    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
  }, [dailyData]);

  return (
    <div className="space-y-8 pb-20">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={48} className="text-emerald-500" />
          </div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Revenue</span>
          <h3 className="text-3xl font-black mt-2 font-mono tracking-tighter text-zinc-900 dark:text-zinc-100">
            {formatCurrency(totals.revenue)}
          </h3>
          <div className="flex items-center gap-2 mt-4 text-emerald-500">
            <ArrowUpRight size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Gross Inflow</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingDown size={48} className="text-rose-500" />
          </div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Costs</span>
          <h3 className="text-3xl font-black mt-2 font-mono tracking-tighter text-zinc-900 dark:text-zinc-100">
            {formatCurrency(totals.cost)}
          </h3>
          <div className="flex items-center gap-2 mt-4 text-rose-500">
            <ArrowDownRight size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Operational Burn</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={48} className={totals.profit >= 0 ? "text-emerald-500" : "text-rose-500"} />
          </div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Net Profit</span>
          <h3 className={cn(
            "text-3xl font-black mt-2 font-mono tracking-tighter",
            totals.profit >= 0 ? "text-emerald-500" : "text-rose-500"
          )}>
            {formatCurrency(totals.profit)}
          </h3>
          <div className="flex items-center gap-2 mt-4 text-zinc-400">
            <span className="text-[10px] font-black uppercase tracking-widest">Bottom Line</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingDown size={48} className="text-amber-500" />
          </div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Lost Revenue</span>
          <h3 className="text-3xl font-black mt-2 font-mono tracking-tighter text-amber-500">
            {formatCurrency(totals.lost)}
          </h3>
          <div className="flex items-center gap-2 mt-4 text-amber-500">
            <span className="text-[10px] font-black uppercase tracking-widest">Cancellations</span>
          </div>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card title="Daily Profit/Loss Trend">
        <div className="h-[400px] mt-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
                tickFormatter={(val) => `AED ${val}`}
              />
              <RechartsTooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-2xl">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">{label}</p>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-emerald-500 flex justify-between gap-8">
                            Revenue: <span>{formatCurrency(payload[0].value as number)}</span>
                          </p>
                          <p className="text-xs font-bold text-rose-500 flex justify-between gap-8">
                            Cost: <span>{formatCurrency(payload[1].value as number)}</span>
                          </p>
                          <div className="h-px bg-zinc-800 my-2" />
                          <p className="text-xs font-black text-white flex justify-between gap-8">
                            Profit: <span>{formatCurrency(payload[2].value as number)}</span>
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#10b981" 
                fillOpacity={1} 
                fill="url(#colorProfit)" 
                strokeWidth={3}
              />
              <Area 
                type="monotone" 
                dataKey="cost" 
                stroke="#f43f5e" 
                fillOpacity={0} 
                strokeWidth={2}
                strokeDasharray="5 5"
              />
              <Area 
                type="monotone" 
                dataKey="profit" 
                stroke="#18181b" 
                fillOpacity={0} 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Detailed Table */}
      <Card title="Daily P&L Table (Property Breakdown)">
        <div className="mt-8 overflow-x-auto custom-scrollbar">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="pb-4 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                <th className="pb-4 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Property</th>
                <th className="pb-4 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                <th className="pb-4 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Revenue</th>
                <th className="pb-4 text-right text-[10px] font-bold text-rose-500 uppercase tracking-widest">Lost Rev.</th>
                <th className="pb-4 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Rent</th>
                <th className="pb-4 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Utilities</th>
                <th className="pb-4 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cleaning</th>
                <th className="pb-4 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Expenses</th>
                <th className="pb-4 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Cost</th>
                <th className="pb-4 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-900">
              {tableData.map((day) => (
                <React.Fragment key={day.date}>
                  {/* Daily Total Row */}
                  <tr 
                    className="group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                    onClick={() => toggleDay(day.date)}
                  >
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        {expandedDays[day.date] ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
                        <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{day.date}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Daily Total</span>
                    </td>
                    <td className="py-4"></td>
                    <td className="py-4 text-right font-mono text-xs font-black">{formatCurrency(day.total.revenue)}</td>
                    <td className="py-4 text-right font-mono text-xs font-black text-rose-500">{formatCurrency(day.total.lost)}</td>
                    <td className="py-4 text-right font-mono text-xs font-black">{formatCurrency(day.total.rent)}</td>
                    <td className="py-4 text-right font-mono text-xs font-black">{formatCurrency(day.total.utilities)}</td>
                    <td className="py-4 text-right font-mono text-xs font-black">{formatCurrency(day.total.cleaning)}</td>
                    <td className="py-4 text-right font-mono text-xs font-black">{formatCurrency(day.total.expenses)}</td>
                    <td className="py-4 text-right font-mono text-xs font-black">{formatCurrency(day.total.totalCost)}</td>
                    <td className={cn(
                      "py-4 text-right font-mono text-xs font-black",
                      day.total.profit >= 0 ? "text-emerald-500" : "text-rose-500"
                    )}>
                      {formatCurrency(day.total.profit)}
                    </td>
                  </tr>

                  {/* Property Rows (Expanded) */}
                  {expandedDays[day.date] && day.properties.map((prop, idx) => (
                    <tr key={`${day.date}-${prop.apartment_id}`} className="bg-zinc-50/50 dark:bg-zinc-900/20">
                      <td className="py-3 pl-8"></td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Building2 size={12} className="text-zinc-400" />
                          <span className="text-xs font-bold text-zinc-500">{prop.apartment}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border",
                          prop.occupied === 'yes' 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" 
                            : "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                        )}>
                          {prop.occupied === 'yes' ? 'Occupied' : 'Vacant'}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-[10px] text-zinc-500">{formatCurrency(prop.daily_revenue_aed)}</td>
                      <td className="py-3 text-right font-mono text-[10px] text-rose-400">{formatCurrency(prop.lost_revenue_aed)}</td>
                      <td className="py-3 text-right font-mono text-[10px] text-zinc-500">{formatCurrency(prop.daily_rent_aed)}</td>
                      <td className="py-3 text-right font-mono text-[10px] text-zinc-500">{formatCurrency(prop.daily_electricity_aed + prop.daily_internet_aed)}</td>
                      <td className="py-3 text-right font-mono text-[10px] text-zinc-500">{formatCurrency(prop.cleaning_allocated_aed)}</td>
                      <td className="py-3 text-right font-mono text-[10px] text-zinc-500">{formatCurrency(prop.other_costs_allocated_aed + prop.real_time_expenses_aed)}</td>
                      <td className="py-3 text-right font-mono text-[10px] text-zinc-500">{formatCurrency(prop.total_daily_cost_aed)}</td>
                      <td className={cn(
                        "py-3 text-right font-mono text-[10px] font-bold",
                        prop.daily_profit_aed >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {formatCurrency(prop.daily_profit_aed)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
