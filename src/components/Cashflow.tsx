/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, TrendingDown, Calendar, 
  ArrowUpRight, ArrowDownLeft, DollarSign,
  Clock, CheckCircle2, AlertCircle
} from 'lucide-react';
import { Card } from './ui/Card';
import { UserData } from '../types';
import { format, parseISO } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { getCashflowTimeline } from '../services/analytics';

interface CashflowProps {
  data: UserData;
  filters: {
    apartmentId: string;
    startDate: string;
    endDate: string;
    displayCurrency: string;
  };
}

export const Cashflow: React.FC<CashflowProps> = ({ data, filters }) => {
  const timeline = useMemo(() => {
    return getCashflowTimeline(data, {
      apartmentId: filters.apartmentId,
      startDate: filters.startDate,
      endDate: filters.endDate
    });
  }, [data, filters]);

  const stats = useMemo(() => {
    const inflow = timeline.filter(t => t.type === 'IN').reduce((sum, t) => sum + t.amount, 0);
    const outflow = Math.abs(timeline.filter(t => t.type === 'OUT').reduce((sum, t) => sum + t.amount, 0));
    const balance = timeline.length > 0 ? timeline[timeline.length - 1].cumulativeBalance : 0;
    
    return { inflow, outflow, balance };
  }, [timeline]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-50 border-emerald-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600">
              <ArrowUpRight size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest">Total Inflow</p>
              <h3 className="text-2xl font-black text-emerald-700">{formatCurrency(stats.inflow, filters.displayCurrency)}</h3>
            </div>
          </div>
        </Card>
        <Card className="bg-rose-50 border-rose-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-600">
              <ArrowDownLeft size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-rose-600/60 uppercase tracking-widest">Total Outflow</p>
              <h3 className="text-2xl font-black text-rose-700">{formatCurrency(stats.outflow, filters.displayCurrency)}</h3>
            </div>
          </div>
        </Card>
        <Card className="bg-zinc-900 border-none text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Net Cash Position</p>
              <h3 className="text-2xl font-black">{formatCurrency(stats.balance, filters.displayCurrency)}</h3>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Cashflow Timeline">
        <div className="space-y-4 mt-4">
          {timeline.length > 0 ? (
            timeline.slice().reverse().map((item, idx) => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={idx}
                className="flex items-center gap-6 p-4 rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-colors group"
              >
                <div className="w-24 text-xs font-mono text-zinc-400">
                  {item.date}
                </div>
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                  item.type === 'IN' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}>
                  {item.type === 'IN' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-bold text-zinc-900 truncate">{item.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">{item.category}</p>
                    <span className="w-1 h-1 rounded-full bg-zinc-200" />
                    <p className="text-[10px] text-zinc-400 font-medium">{item.apartmentName}</p>
                  </div>
                </div>
                <div className={cn(
                  "text-sm font-bold w-32 text-right",
                  item.type === 'IN' ? "text-emerald-600" : "text-rose-600"
                )}>
                  {formatCurrency(item.amount, filters.displayCurrency)}
                </div>
                <div className="w-32 text-right hidden sm:block">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Balance</p>
                  <p className={cn(
                    "text-xs font-bold",
                    item.cumulativeBalance >= 0 ? "text-zinc-900" : "text-rose-600"
                  )}>
                    {formatCurrency(item.cumulativeBalance, filters.displayCurrency)}
                  </p>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="py-20 text-center text-zinc-400 italic">
              No transactions found for the selected period.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
