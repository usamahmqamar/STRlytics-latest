/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, Info, Target, Activity, 
  ChevronLeft, ChevronRight, HelpCircle,
  ArrowUpRight, ArrowDownLeft, Zap,
  ChevronDown, ChevronUp, Building2
} from 'lucide-react';
import { Card } from './ui/Card';
import { UserData, Apartment } from '../types';
import { format, parseISO } from 'date-fns';
import { getQuarterlyPerformance, convertCurrency } from '../services/analytics';
import { cn } from '../lib/utils';

interface OccupancyRevenueProps {
  data: UserData;
  filters: {
    apartmentId: string;
    displayCurrency: string;
  };
}

const ApartmentPerformanceCard: React.FC<{
  apt: Apartment;
  data: UserData;
  formatValue: (val: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ apt, data, formatValue, isExpanded, onToggle }) => {
  const [quarterIndex, setQuarterIndex] = useState(0);

  const performance = useMemo(() => {
    return getQuarterlyPerformance(data, apt.apartment_id, quarterIndex);
  }, [data, apt.apartment_id, quarterIndex]);

  if (!performance) return null;

  return (
    <div className="bg-white rounded-[2.5rem] border border-zinc-100 shadow-sm overflow-hidden transition-all duration-500">
      {/* Summary Row */}
      <div className="p-8 flex flex-col lg:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6 w-full lg:w-auto cursor-pointer" onClick={onToggle}>
          <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-900 shadow-inner shrink-0">
            <Building2 size={24} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-black text-zinc-900 tracking-tight truncate">{apt.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{apt.nickname}</span>
              <span className="w-1 h-1 rounded-full bg-zinc-200" />
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{performance.period}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 w-full lg:w-auto items-center">
          <div className="space-y-2">
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Cheque Cycle</p>
            <div className="flex items-center gap-2 bg-zinc-50 p-1 rounded-xl border border-zinc-100">
              <button 
                onClick={(e) => { e.stopPropagation(); setQuarterIndex(prev => Math.max(0, prev - 1)); }}
                className="p-1 hover:bg-white hover:shadow-sm rounded-lg transition-all text-zinc-400 hover:text-zinc-900"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-black text-zinc-900 min-w-[40px] text-center">{performance.chequeNumber}/{performance.totalCheques}</span>
              <button 
                onClick={(e) => { e.stopPropagation(); setQuarterIndex(prev => prev + 1); }}
                className="p-1 hover:bg-white hover:shadow-sm rounded-lg transition-all text-zinc-400 hover:text-zinc-900"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Rental Coverage</p>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-900" style={{ width: `${Math.min(100, performance.financialHealth.rentCoverage)}%` }} />
              </div>
              <span className="text-sm font-black text-zinc-900">{Math.round(performance.financialHealth.rentCoverage)}%</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Revenue</p>
            <p className="text-sm font-black text-emerald-600">{formatValue(performance.financialHealth.collected)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Next Cheque</p>
            <div className="flex items-center gap-2">
              <p className={cn(
                "text-sm font-black",
                performance.daysUntilNext <= 7 ? "text-rose-600" : "text-emerald-600"
              )}>
                {performance.daysUntilNext} Days
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Net Surplus</p>
              <p className={cn(
                "text-sm font-black",
                performance.stats.netSurplus >= 0 ? "text-emerald-600" : "text-rose-600"
              )}>
                {formatValue(performance.stats.netSurplus)}
              </p>
            </div>
            <button 
              onClick={onToggle}
              className={cn(
                "p-2 rounded-xl transition-all",
                isExpanded ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-400 hover:text-zinc-900"
              )}
            >
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="p-4 border-t border-zinc-50 bg-zinc-50/30 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Main Breakdown */}
                <div className="lg:col-span-8 space-y-4">
                  <Card className="p-0 overflow-hidden bg-white">
                    <div className="p-4 border-b border-zinc-50 flex items-center justify-between">
                      <h3 className="text-xs font-black text-zinc-900 uppercase tracking-[0.3em]">Monthly Performance Breakdown</h3>
                      <Activity size={18} className="text-zinc-300" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-zinc-50/50">
                            <th className="p-3 text-[9px] font-black text-zinc-400 uppercase tracking-widest">Month</th>
                            <th className="p-3 text-[9px] font-black text-zinc-400 uppercase tracking-widest">Revenue</th>
                            <th className="p-3 text-[9px] font-black text-zinc-400 uppercase tracking-widest">Exp. Ratio</th>
                            <th className="p-3 text-[9px] font-black text-zinc-400 uppercase tracking-widest">Occupancy</th>
                            <th className="p-3 text-[9px] font-black text-zinc-400 uppercase tracking-widest">ADR</th>
                            <th className="p-3 text-[9px] font-black text-zinc-400 uppercase tracking-widest">RevPAR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {performance.monthlyBreakdown.map((m: any, i: number) => (
                            <tr key={i} className="group hover:bg-zinc-50/50 transition-colors">
                              <td className="p-3">
                                <p className="text-sm font-black text-zinc-900">{m.month}</p>
                                {m.isHighSeason && (
                                  <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">High Season</span>
                                )}
                              </td>
                              <td className="p-3">
                                <p className="text-sm font-black text-emerald-600">{formatValue(m.revenue)}</p>
                                <p className="text-[9px] font-bold text-rose-400 mt-0.5">-{formatValue(m.costs)} costs</p>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-zinc-900">{Math.round(m.expRatio)}%</span>
                                  <div className="w-12 h-1 bg-zinc-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-zinc-300" style={{ width: `${m.expRatio}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-zinc-900">{Math.round(m.occupancy)}%</span>
                                  <div className="w-12 h-1 bg-zinc-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${m.occupancy}%` }} />
                                  </div>
                                </div>
                                <p className="text-[9px] font-bold text-zinc-400 mt-0.5">{m.occupiedNights} / {m.availableNights} nights</p>
                              </td>
                              <td className="p-3">
                                <p className="text-sm font-black text-zinc-900">{formatValue(m.adr)}</p>
                              </td>
                              <td className="p-3">
                                <p className="text-sm font-black text-zinc-900">{formatValue(m.revpar)}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>

                {/* Sidebar Widgets */}
                <div className="lg:col-span-4 space-y-4">
                  <Card className="p-4 bg-white">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Portfolio Benchmark</h3>
                      <HelpCircle size={14} className="text-zinc-300" />
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">RevPAR vs Portfolio</p>
                        <div className="flex items-baseline justify-between">
                          <p className="text-lg font-black text-zinc-900">{formatValue(performance.monthlyBreakdown[0]?.revpar || 0)}</p>
                          <div className="flex items-center gap-1 text-emerald-500">
                            <ArrowUpRight size={14} />
                            <span className="text-xs font-black">+{performance.benchmarks.revparVsPortfolio}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-zinc-50">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Occ. vs Portfolio</p>
                        <div className="flex items-baseline justify-between">
                          <p className="text-lg font-black text-zinc-900">{Math.round(performance.monthlyBreakdown[0]?.occupancy || 0)}%</p>
                          <div className="flex items-center gap-1 text-rose-500">
                            <ArrowDownLeft size={14} />
                            <span className="text-xs font-black">{performance.benchmarks.occVsPortfolio}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 bg-white">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Financial Health</h3>
                      <Target size={14} className="text-zinc-300" />
                    </div>
                    <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 text-center mb-4">
                      <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">Total Target</p>
                      <p className="text-xl font-black text-zinc-900">{formatValue(performance.financialHealth.totalTarget)}</p>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-zinc-500">Collected</span>
                        <span className="text-sm font-black text-emerald-600">{formatValue(performance.financialHealth.collected)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-zinc-500">Remaining</span>
                        <span className="text-sm font-black text-rose-600">{formatValue(performance.financialHealth.remaining)}</span>
                      </div>
                      <div className="pt-6 space-y-6">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                            <span className="text-zinc-900">Rent Coverage</span>
                            <span className="text-zinc-900">{Math.round(performance.financialHealth.rentCoverage)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                            <div className="h-full bg-zinc-900" style={{ width: `${performance.financialHealth.rentCoverage}%` }} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                            <span className="text-zinc-900">OpEx Coverage</span>
                            <span className="text-zinc-900">{Math.round(performance.financialHealth.opexCoverage)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                            <div className="h-full bg-zinc-900" style={{ width: `${performance.financialHealth.opexCoverage}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-8 bg-zinc-900 border-none text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[60px] rounded-full -mr-16 -mt-16 group-hover:bg-emerald-500/20 transition-all duration-700" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 text-emerald-400 mb-6">
                        <Zap size={14} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Forecasting</span>
                      </div>
                      <h4 className="text-xl font-black tracking-tight mb-2">Break-even Path</h4>
                      <p className="text-zinc-400 text-[11px] leading-relaxed mb-6">
                        Target daily revenue: <span className="text-white font-bold">{formatValue(performance.financialHealth.totalTarget / 90)}</span>.
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                          <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Target Occ.</p>
                          <p className="text-lg font-black text-emerald-400">{Math.round(performance.stats.breakEvenOcc)}%</p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                          <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Surplus</p>
                          <p className={cn(
                            "text-lg font-black",
                            performance.stats.netSurplus >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}>{formatValue(performance.stats.netSurplus)}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const OccupancyRevenue: React.FC<OccupancyRevenueProps> = ({ data, filters }) => {
  const [expandedAptId, setExpandedAptId] = useState<string | null>(null);

  const formatValue = (val: number) => {
    const converted = convertCurrency(val, 'AED', filters.displayCurrency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: filters.displayCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(converted);
  };

  const targetApts = useMemo(() => {
    return filters.apartmentId === 'ALL' 
      ? data.apartments 
      : data.apartments.filter(a => a.apartment_id === filters.apartmentId);
  }, [data.apartments, filters.apartmentId]);

  if (targetApts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-[2.5rem] border border-zinc-100">
        <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 mb-6">
          <Info size={32} />
        </div>
        <h3 className="text-xl font-black text-zinc-900 tracking-tight">No Apartments Found</h3>
        <p className="text-zinc-400 text-sm mt-2 text-center max-w-xs leading-relaxed">
          Please add apartments in the Property Setup section to view performance analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between px-4">
        <div>
          <h3 className="text-xs font-black text-zinc-900 uppercase tracking-[0.3em]">Apartment Performance Details</h3>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Independent Cheque Cycle Tracking</p>
        </div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Click name to expand details</p>
      </div>
      
      <div className="space-y-6">
        {targetApts.map((apt) => (
          <ApartmentPerformanceCard 
            key={apt.apartment_id}
            apt={apt}
            data={data}
            formatValue={formatValue}
            isExpanded={expandedAptId === apt.apartment_id}
            onToggle={() => setExpandedAptId(expandedAptId === apt.apartment_id ? null : apt.apartment_id)}
          />
        ))}
      </div>
    </div>
  );
};
