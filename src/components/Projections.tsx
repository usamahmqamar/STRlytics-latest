/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, Search, Sparkles, Target, 
  TrendingUp, ArrowUpRight, Info, Printer,
  CheckCircle2, AlertTriangle, Loader2
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ComposedChart, Line
} from 'recharts';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { getMarketIntelligence } from '../services/gemini';
import { cn } from '../lib/utils';
import { format, addMonths, startOfMonth } from 'date-fns';
import { convertCurrency } from '../services/analytics';

export const Projections: React.FC = () => {
  const [inputs, setInputs] = useState({
    location: "",
    bedrooms: 1,
    annualRent: 0,
    setupCost: 0,
    monthlyOpEx: 0,
    managementFee: 15,
    targetOccupancy: 85,
    targetProfit: 50000
  });

  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRun = async () => {
    if (!inputs.location) return;
    setIsLoading(true);
    try {
      const intelligence = await getMarketIntelligence(inputs.location, inputs.bedrooms);
      
      const rent = inputs.annualRent || intelligence.typicalRent;
      const setup = inputs.setupCost || intelligence.furnishingCost;
      const opex = inputs.monthlyOpEx || intelligence.monthlyOpEx;
      const baseADR = intelligence.adr;
      const targetOcc = inputs.targetOccupancy;

      // Core Calculations
      const annualOpEx = opex * 12;
      const fixedCosts = rent + annualOpEx;
      
      const annualRevenue = baseADR * (targetOcc / 100) * 365;
      const annualMgtFee = annualRevenue * (inputs.managementFee / 100);
      const totalAnnualCost = fixedCosts + annualMgtFee;
      const netAnnualProfit = annualRevenue - totalAnnualCost;
      
      const roi = setup > 0 ? (netAnnualProfit / setup) * 100 : 0;
      const monthlyProfit = netAnnualProfit / 12;
      const payback = monthlyProfit > 0 ? setup / monthlyProfit : 0;

      const breakEvenADR = fixedCosts / ((targetOcc / 100) * 365 * (1 - inputs.managementFee / 100));
      const targetADR = (inputs.targetProfit + fixedCosts) / ((targetOcc / 100) * 365 * (1 - inputs.managementFee / 100));

      // Monthly Strategy & Chart Data
      const monthlyStrategy = intelligence.seasonality.map((s: any, idx: number) => {
        const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][idx];
        const estOcc = Math.min(100, targetOcc * s.occMultiplier);
        const estADR = baseADR * s.adrMultiplier;
        
        const monthlyRevenue = estADR * (estOcc / 100) * daysInMonth;
        const monthlyMgtFee = monthlyRevenue * (inputs.managementFee / 100);
        const monthlyExpense = (fixedCosts / 12) + monthlyMgtFee;
        const monthlyProfitVal = monthlyRevenue - monthlyExpense;

        // Rate Calculations
        const monthlyFixedCost = fixedCosts / 12;
        const mgtFeeFactor = 1 - (inputs.managementFee / 100);
        const occupiedDays = (estOcc / 100) * daysInMonth;
        
        const minRate = occupiedDays > 0 ? monthlyFixedCost / (occupiedDays * mgtFeeFactor) : 0;
        const targetRate = occupiedDays > 0 ? (monthlyFixedCost + (inputs.targetProfit / 12)) / (occupiedDays * mgtFeeFactor) : 0;

        return {
          month: s.month,
          revenue: monthlyRevenue,
          expenses: monthlyExpense,
          profit: monthlyProfitVal,
          occ: estOcc,
          adr: estADR,
          minRate,
          targetRate
        };
      });

      // Feasibility Verdict
      let verdict = "Risky";
      let color = "text-rose-500";
      let bgColor = "bg-rose-500/10";
      let score = 0;

      if (roi > 25 && payback < 18) {
        verdict = "Strong Buy";
        color = "text-emerald-500";
        bgColor = "bg-emerald-500/10";
        score = 85 + Math.min(15, roi / 5);
      } else if (roi > 12 && payback < 36) {
        verdict = "Moderate";
        color = "text-amber-500";
        bgColor = "bg-amber-500/10";
        score = 60 + Math.min(25, roi / 2);
      } else {
        score = Math.max(10, roi * 2);
      }

      setResult({
        ...intelligence,
        annualRevenue,
        totalAnnualCost,
        netAnnualProfit,
        roi,
        payback,
        breakEvenADR,
        targetADR,
        monthlyStrategy,
        verdict,
        verdictColor: color,
        verdictBg: bgColor,
        score,
        fixedCosts,
        annualMgtFee,
        rent,
        annualOpEx
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'AED', 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-end mb-8">
        <div className="flex items-center gap-4">
          <div className="flex bg-zinc-100 p-1 rounded-xl">
            {['Week', 'Month', 'Quarter', 'Year', 'Custom'].map((t) => (
              <button 
                key={t}
                className={cn(
                  "px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                  t === 'Year' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Input Panel */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="p-6 border-none shadow-xl shadow-zinc-200/50">
            <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">Property Details & Inputs</h2>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Location / Locality</label>
                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full p-3 pr-10 bg-zinc-50 border border-zinc-100 rounded-xl text-sm focus:ring-2 ring-emerald-500/20 outline-none transition-all"
                    placeholder="e.g. Dubai Marina"
                    value={inputs.location}
                    onChange={(e) => setInputs({...inputs, location: e.target.value})}
                  />
                  <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Property Type</label>
                  <select 
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm outline-none"
                    value={inputs.bedrooms}
                    onChange={(e) => setInputs({...inputs, bedrooms: Number(e.target.value)})}
                  >
                    <option value={0}>Studio</option>
                    <option value={1}>1 Bedroom</option>
                    <option value={2}>2 Bedrooms</option>
                    <option value={3}>3 Bedrooms</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Annual Rent (AED)</label>
                  <input 
                    type="number" 
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm outline-none"
                    value={inputs.annualRent || ""}
                    onChange={(e) => setInputs({...inputs, annualRent: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-wrap">Setup / Furnishing Cost</label>
                  <input 
                    type="number" 
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm outline-none"
                    value={inputs.setupCost || ""}
                    onChange={(e) => setInputs({...inputs, setupCost: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-wrap leading-tight">Monthly OpEx (Utilities/Cleaning)</label>
                  <input 
                    type="number" 
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm outline-none"
                    value={inputs.monthlyOpEx || ""}
                    onChange={(e) => setInputs({...inputs, monthlyOpEx: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Management Fee (%)</label>
                  <input 
                    type="number" 
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm outline-none"
                    value={inputs.managementFee}
                    onChange={(e) => setInputs({...inputs, managementFee: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Target Occupancy</label>
                  <select 
                    className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm outline-none"
                    value={inputs.targetOccupancy}
                    onChange={(e) => setInputs({...inputs, targetOccupancy: Number(e.target.value)})}
                  >
                    <option value={70}>Low (70%)</option>
                    <option value={85}>High (85%)</option>
                    <option value={95}>Premium (95%)</option>
                  </select>
                </div>
              </div>

              <Button 
                onClick={handleRun} 
                disabled={isLoading || !inputs.location}
                className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="animate-spin" size={16} /> : <><Sparkles size={16} /> Generate Projection</>}
              </Button>
            </div>
          </Card>
        </div>

        {/* Right: Results Dashboard */}
        <div className="lg:col-span-9 space-y-6">
          {result ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest", result.verdictBg, result.verdictColor)}>
                    {result.verdict}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Feasibility Report Generated</span>
                </div>
                <Button variant="outline" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  <Printer size={14} /> Print / Export PDF
                </Button>
              </div>

              {/* Top Row Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 bg-zinc-900 text-white border-none relative overflow-hidden">
                  <div className="relative z-10">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Investment Score</p>
                    <div className="flex items-end gap-2 mb-4">
                      <span className="text-6xl font-black tracking-tighter leading-none">{Math.round(result.score)}</span>
                      <span className="text-white/20 font-black mb-2">/100</span>
                    </div>
                    <span className={cn("px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest", result.verdictBg, result.verdictColor)}>
                      {result.verdict}
                    </span>
                  </div>
                  <div className="absolute -right-4 -bottom-4 opacity-10">
                    <Target size={120} />
                  </div>
                </Card>

                <Card className="p-6">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Annual Net Profit</p>
                  <p className="text-4xl font-black text-emerald-500 tracking-tight mb-2">{formatCurrency(result.netAnnualProfit)}</p>
                  <p className="text-[10px] font-medium text-zinc-400">Total revenue minus all costs</p>
                </Card>

                <Card className="p-6">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">ROI (Annual)</p>
                  <p className="text-4xl font-black text-zinc-900 tracking-tight mb-2">{result.roi.toFixed(1)}%</p>
                  <p className="text-[10px] font-medium text-zinc-400">Net Profit / Setup Cost</p>
                </Card>
              </div>

              {/* Middle Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 space-y-6">
                  <Card className="p-6">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Payback Period</p>
                    <p className="text-4xl font-black text-zinc-900 tracking-tight mb-2">{result.payback.toFixed(1)} <span className="text-lg text-zinc-400">Months</span></p>
                    <p className="text-[10px] font-medium text-zinc-400">Time to recover setup costs</p>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">1-Year Financial Breakdown</h3>
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Revenue Allocation</span>
                          <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">{Math.round((result.netAnnualProfit / result.annualRevenue) * 100)}% Profit Margin</span>
                        </div>
                        <div className="h-3 w-full bg-zinc-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-rose-500" style={{ width: `${(result.totalAnnualCost / result.annualRevenue) * 100}%` }} />
                          <div className="h-full bg-emerald-500" style={{ width: `${(result.netAnnualProfit / result.annualRevenue) * 100}%` }} />
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                            <span className="text-[9px] font-bold text-zinc-400">Costs ({Math.round((result.totalAnnualCost / result.annualRevenue) * 100)}%)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-[9px] font-bold text-zinc-400">Net Profit ({Math.round((result.netAnnualProfit / result.annualRevenue) * 100)}%)</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-zinc-50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500">Gross Revenue (Forecast)</span>
                          <span className="text-sm font-black text-zinc-900">{formatCurrency(result.annualRevenue)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500">Annual Rent (Fixed)</span>
                          <span className="text-sm font-black text-rose-500">-{formatCurrency(result.rent)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500">Operating Expenses (OpEx)</span>
                          <span className="text-sm font-black text-rose-500">-{formatCurrency(result.annualOpEx + result.annualMgtFee)}</span>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-zinc-50 bg-zinc-50/50 -mx-6 px-6 py-3">
                          <span className="text-xs font-bold text-zinc-900 uppercase tracking-widest">Net Annual Profit</span>
                          <span className="text-lg font-black text-emerald-500">{formatCurrency(result.netAnnualProfit)}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="lg:col-span-8">
                  <Card className="p-6 h-full">
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">Monthly Cashflow Forecast</h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={result.monthlyStrategy}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                          <XAxis 
                            dataKey="month" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fontWeight: 600, fill: '#a1a1aa' }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fontWeight: 600, fill: '#a1a1aa' }}
                            tickFormatter={(val) => `AED ${val/1000}k`}
                          />
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            formatter={(val: number) => [formatCurrency(val), '']}
                          />
                          <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} name="Revenue" />
                          <Area type="monotone" dataKey="profit" fill="#10b981" fillOpacity={0.1} stroke="none" name="Profit Area" />
                          <Line type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} dot={false} name="Expenses" />
                          <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} name="Net Profit" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center justify-center gap-6 mt-6">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-emerald-500" />
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Revenue</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-emerald-500/20" />
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Net Profit</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-1 rounded bg-rose-500" />
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Expenses</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Monthly Strategy Table */}
              <Card className="p-0 overflow-hidden border-none shadow-xl shadow-zinc-200/50">
                <div className="p-6 border-b border-zinc-100 bg-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={18} className="text-emerald-500" />
                        12-Month Performance Strategy
                      </h3>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Seasonality & Demand Adjusted Forecast</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">High Demand</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/50 border-b border-zinc-100">
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Month</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Est. Occupancy</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Min Rate (Cost)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Target Rate (Profit)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Est. Revenue</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Est. Profit</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Yield Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {result.monthlyStrategy.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-zinc-50/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-zinc-900 uppercase tracking-widest">{row.month}</span>
                              <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter">
                                {row.occ > 85 ? 'Peak Season' : row.occ > 70 ? 'Mid Season' : 'Low Season'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-black text-zinc-900 w-10">{Math.round(row.occ)}%</span>
                              <div className="w-20 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${row.occ}%` }}
                                  className={cn(
                                    "h-full transition-all duration-1000",
                                    row.occ > 80 ? "bg-emerald-500" : row.occ > 60 ? "bg-amber-500" : "bg-zinc-400"
                                  )} 
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-zinc-900">{formatCurrency(row.minRate)}</span>
                              <span className="text-[8px] font-bold text-zinc-400 uppercase">Break-even</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-emerald-600">{formatCurrency(row.targetRate)}</span>
                              <span className="text-[8px] font-bold text-emerald-500/60 uppercase">Profit Goal</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-black text-zinc-900">{formatCurrency(row.revenue)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-black",
                              row.profit > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                            )}>
                              {row.profit > 0 ? <TrendingUp size={12} /> : <AlertTriangle size={12} />}
                              {formatCurrency(row.profit)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <div 
                                    key={star}
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      star <= Math.ceil((row.profit / (result.netAnnualProfit / 12)) * 3) ? "bg-emerald-500" : "bg-zinc-200"
                                    )}
                                  />
                                ))}
                              </div>
                              <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1">
                                {row.profit > (inputs.targetProfit / 12) ? 'Excellent' : row.profit > 0 ? 'Good' : 'Critical'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Bottom Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="p-6">
                  <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">Rate Strategy & Feasibility</h3>
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="p-4 bg-zinc-50 rounded-xl">
                      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Min (Break-even)</p>
                      <p className="text-xl font-black text-zinc-900">{formatCurrency(result.breakEvenADR)}</p>
                      <p className="text-[8px] text-zinc-400 mt-1">Rate needed to cover all costs</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-xl">
                      <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Target Rate</p>
                      <p className="text-xl font-black text-emerald-600">{formatCurrency(result.targetADR)}</p>
                      <p className="text-[8px] text-emerald-600/60 mt-1">Rate to reach {formatCurrency(inputs.targetProfit)} profit</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Market Achievability</p>
                    <div className="flex items-center justify-between p-4 border border-zinc-100 rounded-xl">
                      <span className="text-xs font-medium text-zinc-600">Current Strategy Achievable?</span>
                      <div className="flex items-center gap-2 text-emerald-500">
                        <CheckCircle2 size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Yes</span>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-0 overflow-hidden border-none bg-emerald-900 text-white">
                  <div className="p-6">
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Target size={14} /> Optimal Performance Strategy
                    </h3>
                    <div className="bg-emerald-800/50 p-6 rounded-2xl border border-white/10 mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles size={16} className="text-amber-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Target Profit Blueprint</span>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Recommended ADR</p>
                          <p className="text-2xl font-black">{formatCurrency(result.targetADR)}</p>
                          <p className="text-[8px] text-white/30 mt-1">Balanced for {inputs.targetOccupancy}% occupancy</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Target Net Profit</p>
                          <p className="text-2xl font-black text-emerald-400">{formatCurrency(inputs.targetProfit)}</p>
                          <p className="text-[8px] text-white/30 mt-1">Annual projected take-home</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">Optimal Monthly OpEx</span>
                        <span className="font-black">{formatCurrency(inputs.monthlyOpEx)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">Target Occupancy Level</span>
                        <span className="font-black">{inputs.targetOccupancy}%</span>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-white/10">
                        <span className="text-xs text-white/40">Market Feasibility</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Highly Achievable</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-emerald-950 p-6">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Action Plan</p>
                    <ul className="space-y-3">
                      {[
                        `Maintain OpEx below ${formatCurrency(inputs.monthlyOpEx)} through smart utility management.`,
                        `Implement Dynamic Pricing to capture ${inputs.targetOccupancy}% occupancy during mid-season.`,
                        `Focus on Superhost status to justify the ${formatCurrency(result.targetADR)} nightly rate.`
                      ].map((item, i) => (
                        <li key={i} className="flex gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                          <p className="text-[10px] font-medium text-white/70 leading-relaxed">{item}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>

                <div className="space-y-6">
                  <Card className="p-6">
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6">Optimization Suggestions</h3>
                    <div className="space-y-5">
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                          <Info size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-900 mb-1">Occupancy Sensitivity</p>
                          <p className="text-[10px] text-zinc-500 leading-relaxed">
                            A 5% drop in occupancy reduces annual profit by <span className="font-black text-rose-500">{formatCurrency(result.annualRevenue * 0.05)}</span>.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                          <TrendingUp size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-900 mb-1">Expense Control</p>
                          <p className="text-[10px] text-zinc-500 leading-relaxed">
                            Reducing monthly OpEx by 500 AED adds <span className="font-black text-emerald-500">6,000 AED</span> to your bottom line.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                          <AlertTriangle size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-900 mb-1">Break-even</p>
                          <p className="text-[10px] text-zinc-500 leading-relaxed">
                            You need <span className="font-black text-zinc-900">{Math.round((result.totalAnnualCost / (result.adr * 365)) * 100)}%</span> occupancy to cover all costs.
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Market Insight</h3>
                    <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                      Properties in {inputs.location} with {inputs.bedrooms} bedrooms typically see a strong premium for STR over LTR. Focus on high-quality photography to justify the {formatCurrency(result.targetADR)} nightly rate.
                    </p>
                  </Card>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-[2.5rem] p-12 text-center bg-zinc-50/50">
              <div className="w-20 h-20 bg-zinc-900/5 rounded-3xl flex items-center justify-center text-zinc-300 mb-6 border border-zinc-100">
                <BarChart3 size={40} />
              </div>
              <h3 className="text-xl font-black text-zinc-900 mb-3 tracking-tight">Investment Feasibility Engine</h3>
              <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed">
                Input your potential property details to generate a comprehensive 12-month financial roadmap and investment verdict.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
