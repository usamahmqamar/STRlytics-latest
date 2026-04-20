/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, Download, Filter, ChevronRight, 
  TrendingUp, TrendingDown, DollarSign,
  Building2, Calendar, CheckCircle2, Info
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { UserData } from '../types';
import { format, parseISO, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { getMonthlyKPIs } from '../services/analytics';

interface InvestorReportsProps {
  data: UserData;
}

export const InvestorReports: React.FC<InvestorReportsProps> = ({ data }) => {
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const reportData = useMemo(() => {
    const stats = getMonthlyKPIs(data, selectedMonth);
    const target = selectedProperty === 'all' ? 'PORTFOLIO' : data.apartments.find(a => a.apartment_id === selectedProperty)?.name;
    return stats.find(s => s.entity === target);
  }, [data, selectedMonth, selectedProperty]);

  const propertyStats = useMemo(() => {
    const stats = getMonthlyKPIs(data, selectedMonth);
    return stats.filter(s => s.entity !== 'PORTFOLIO');
  }, [data, selectedMonth]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Investor Reporting Suite</h2>
          <p className="text-zinc-500 text-sm font-medium">Generate and export monthly performance statements for property owners.</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 focus:outline-none"
          >
            <option value="all">All Properties</option>
            {data.apartments.map(apt => (
              <option key={apt.apartment_id} value={apt.apartment_id}>{apt.name}</option>
            ))}
          </select>
          <input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 focus:outline-none"
          />
          <Button>
            <Download size={18} />
            Export All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-emerald-50 border-emerald-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest">Gross Revenue</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{formatCurrency(reportData?.revenue_aed || 0)}</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-1">+{reportData?.occupied_nights || 0} Bookings</div>
        </Card>
        <Card className="bg-rose-50 border-rose-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-rose-600/60 uppercase tracking-widest">Expenses</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-700">{formatCurrency(reportData?.total_cost_aed || 0)}</div>
          <div className="text-[10px] text-rose-600 font-bold mt-1">Maintenance & Utilities</div>
        </Card>
        <Card className="bg-zinc-50 border-zinc-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Management Fee</span>
            <FileText className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-black text-zinc-900">{formatCurrency((reportData?.revenue_aed || 0) * 0.2)}</div>
          <div className="text-[10px] text-zinc-400 font-bold mt-1">20% Service Fee</div>
        </Card>
        <Card className="bg-zinc-900 border-none text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Owner Payout</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{formatCurrency(reportData?.net_profit_aed || 0)}</div>
          <div className="text-[10px] text-emerald-400 font-bold mt-1">Net Profit for {format(parseISO(`${selectedMonth}-01`), 'MMM yyyy')}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Property</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Gross Revenue</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Expenses</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Fee (20%)</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Net Payout</th>
                <th className="p-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {propertyStats.map((s, i) => (
                <tr key={i} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-900">{s.entity}</span>
                      <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">
                        {data.apartments.find(a => a.name === s.entity)?.building}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right font-bold text-zinc-900">{formatCurrency(s.revenue_aed)}</td>
                  <td className="p-4 text-right text-rose-600 font-medium">{formatCurrency(s.total_cost_aed)}</td>
                  <td className="p-4 text-right text-zinc-400 font-medium">{formatCurrency(s.revenue_aed * 0.2)}</td>
                  <td className="p-4 text-right">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black">
                      {formatCurrency(s.net_profit_aed)}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-emerald-600 transition-colors group-hover:scale-110">
                      <FileText size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
