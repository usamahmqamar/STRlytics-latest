/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Download, Upload, FileSpreadsheet, FileJson, 
  RefreshCw, CheckCircle2, AlertCircle, Info,
  Trash2, Search, Filter, ChevronRight, Zap
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { UserData } from '../types';
import { format, parseISO, isAfter, isBefore, isEqual, addDays, differenceInDays } from 'date-fns';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import { calculateDailyPL, getMonthlyKPIs, getCashflowTimeline } from '../services/analytics';

interface DataManagerProps {
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
  filters: any;
  currentKPIs: any;
  timeline: any;
  handleReset: () => void;
}

export const DataManager: React.FC<DataManagerProps> = ({ 
  data, setData, filters, currentKPIs, timeline, handleReset 
}) => {
  const [importType, setImportType] = useState<'reservations' | 'expenses' | 'properties'>('reservations');
  const [isImporting, setIsImporting] = useState(false);
  const [resetDate, setResetDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [resetScope, setResetScope] = useState<'all' | 'after' | 'before'>('after');

  const exportToCSV = (jsonData: any[], fileName: string) => {
    const csv = Papa.unparse(jsonData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportReservations = () => {
    const filtered = data.reservations.filter(res => {
      const matchesApt = filters.apartmentId === 'ALL' || res.apartment_id === filters.apartmentId;
      return matchesApt;
    });
    exportToCSV(filtered, `reservations_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const handleExportDailyPL = () => {
    const dailyData = calculateDailyPL(data, parseISO(filters.startDate), parseISO(filters.endDate), filters.apartmentId === 'ALL' ? undefined : filters.apartmentId);
    exportToCSV(dailyData, `daily_pl_${filters.startDate}_to_${filters.endDate}.csv`);
  };

  const handleGranularReset = () => {
    const targetDate = parseISO(resetDate);
    
    setData(prev => {
      const filterFn = (itemDateStr: string) => {
        const itemDate = parseISO(itemDateStr);
        if (resetScope === 'after') return isBefore(itemDate, targetDate);
        if (resetScope === 'before') return isAfter(itemDate, targetDate);
        return false; // 'all' is handled by handleReset
      };

      return {
        ...prev,
        reservations: prev.reservations.filter(r => filterFn(r.check_in)),
        dailyExpenses: prev.dailyExpenses.filter(e => filterFn(e.date)),
        payments: prev.payments.filter(p => filterFn(p.date)),
        serviceRecords: prev.serviceRecords.filter(s => filterFn(s.date)),
        invoices: prev.invoices.filter(i => filterFn(i.date))
      };
    });
    alert(`Data ${resetScope} ${resetDate} has been cleared.`);
  };

  const downloadTemplate = (type: 'reservations' | 'expenses' | 'properties') => {
    let headers = [];
    let sample = [];

    if (type === 'reservations') {
      headers = ['reservation_code', 'guest_name', 'num_guests', 'check_in', 'check_out', 'total_payout_aed', 'status', 'apartment_id'];
      sample = [['RES-001', 'John Doe', '2', '2024-05-01', '2024-05-05', '2500', 'confirmed', 'APT-1']];
    } else if (type === 'expenses') {
      headers = ['date', 'category', 'amount_aed', 'notes', 'apartment_id', 'vendor_id'];
      sample = [['2024-05-01', 'Maintenance', '500', 'AC Repair', 'APT-1', 'VEND-1']];
    } else {
      headers = ['name', 'nickname', 'building', 'address', 'specification', 'measurement_sqft', 'annual_rent_aed'];
      sample = [['Bay Central 605', 'BC-605', 'Bay Central', 'Dubai Marina', '1BR', '850', '95000']];
    }

    const csv = Papa.unparse({ fields: headers, data: sample });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${type}_template.csv`;
    link.click();
  };

  const handleDataImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (importType === 'properties') {
          const importedApts: any[] = results.data.map((row: any) => ({
            apartment_id: row.nickname || row.apartment_id || `APT-${Math.random().toString(36).substr(2, 9)}`,
            name: row.name || 'Unnamed Property',
            nickname: row.nickname || row.apartment_id || '',
            building: row.building || '',
            address: row.address || '',
            specification: row.specification || 'Studio',
            measurement_sqft: Number(row.measurement_sqft) || 0,
            start_operation_date: row.start_operation_date || format(new Date(), 'yyyy-MM-dd'),
            annual_rent_aed: Number(row.annual_rent_aed) || 0,
            monthly_rent_aed: Number(row.monthly_rent_aed) || Math.round((Number(row.annual_rent_aed) || 0) / 12),
            num_cheques: Number(row.num_cheques) || 4,
            rent_cheques: [],
            setup_costs: [],
            currency: 'AED',
            utilities_monthly_defaults: {
              dewa_electricity_aed: 500,
              internet_aed: 350
            }
          }));
          setData(prev => ({ ...prev, apartments: [...prev.apartments, ...importedApts] }));
        } else if (importType === 'reservations') {
          const importedRes: any[] = results.data.map((row: any) => ({
            reservation_code: row.reservation_code || `RES-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            guest_name: row.guest_name || 'Unknown Guest',
            num_guests: Number(row.num_guests) || 1,
            check_in: row.check_in || format(new Date(), 'yyyy-MM-dd'),
            check_out: row.check_out || format(addDays(new Date(), 1), 'yyyy-MM-dd'),
            total_payout_aed: Number(row.total_payout_aed) || 0,
            net_payout_aed: Number(row.total_payout_aed) || 0,
            status: row.status || 'confirmed',
            apartment_id: row.apartment_id || data.apartments[0]?.apartment_id || '',
            nights: differenceInDays(parseISO(row.check_out || format(addDays(new Date(), 1), 'yyyy-MM-dd')), parseISO(row.check_in || format(new Date(), 'yyyy-MM-dd')))
          }));
          setData(prev => ({ ...prev, reservations: [...prev.reservations, ...importedRes] }));
        } else if (importType === 'expenses') {
          const importedExp: any[] = results.data.map((row: any) => ({
            id: `EXP-${Math.random().toString(36).substr(2, 9)}`,
            date: row.date || format(new Date(), 'yyyy-MM-dd'),
            category: row.category || 'Maintenance',
            amount_aed: Number(row.amount_aed) || 0,
            notes: row.notes || '',
            apartment_id: row.apartment_id || data.apartments[0]?.apartment_id || '',
            vendor_id: row.vendor_id || ''
          }));
          setData(prev => ({ ...prev, dailyExpenses: [...prev.dailyExpenses, ...importedExp] }));
        }

        setIsImporting(false);
        alert(`Successfully imported ${results.data.length} ${importType}.`);
        e.target.value = ''; // Reset input
      },
      error: (error) => {
        console.error("CSV Import Error:", error);
        setIsImporting(false);
        alert("Failed to import CSV. Please check the format.");
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Data Management" className="h-full">
          <div className="space-y-8 mt-4">
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                <Download size={16} className="text-emerald-500" />
                Export Data
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={handleExportReservations}>
                  <FileSpreadsheet size={14} /> Reservations
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={handleExportDailyPL}>
                  <FileSpreadsheet size={14} /> Daily P&L
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => exportToCSV(data.apartments, 'apartments.csv')}>
                  <FileSpreadsheet size={14} /> Properties
                </Button>
                <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => {
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'full_backup.json';
                  link.click();
                }}>
                  <FileJson size={14} /> Full Backup
                </Button>
              </div>
            </div>

            <div className="space-y-6 pt-6 border-t border-zinc-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                  <Upload size={16} className="text-blue-500" />
                  Import System
                </h4>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  {(['reservations', 'expenses', 'properties'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setImportType(t)}
                      className={cn(
                        "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                        importType === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-8 border-2 border-dashed border-zinc-100 rounded-[2rem] bg-zinc-50/50 text-center group hover:border-blue-500/30 transition-all">
                  <input 
                    type="file" 
                    id="data-import" 
                    className="hidden" 
                    accept=".csv"
                    onChange={handleDataImport}
                    disabled={isImporting}
                  />
                  <label 
                    htmlFor="data-import"
                    className="cursor-pointer flex flex-col items-center gap-4"
                  >
                    <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center text-zinc-400 group-hover:text-blue-500 group-hover:scale-110 transition-all">
                      <Upload size={32} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-zinc-900">Import {importType} via CSV</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Click to upload or drag and drop</p>
                    </div>
                  </label>
                </div>

                <div className="bg-white border border-zinc-100 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-amber-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Key Reference Guide</span>
                    </div>
                    <button 
                      onClick={() => downloadTemplate(importType)}
                      className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline flex items-center gap-1"
                    >
                      <Download size={10} /> Download Template
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    {importType === 'reservations' && [
                      { key: 'reservation_code', desc: 'Unique ID (e.g. RES-123)' },
                      { key: 'guest_name', desc: 'Full name of guest' },
                      { key: 'check_in', desc: 'YYYY-MM-DD' },
                      { key: 'check_out', desc: 'YYYY-MM-DD' },
                      { key: 'total_payout_aed', desc: 'Numeric value' },
                      { key: 'apartment_id', desc: 'Must match property ID' },
                    ].map(item => (
                      <div key={item.key} className="flex flex-col">
                        <span className="text-[9px] font-black text-zinc-900 font-mono">{item.key}</span>
                        <span className="text-[8px] text-zinc-400 font-medium">{item.desc}</span>
                      </div>
                    ))}
                    {importType === 'expenses' && [
                      { key: 'date', desc: 'YYYY-MM-DD' },
                      { key: 'category', desc: 'Maintenance, Utilities, etc' },
                      { key: 'amount_aed', desc: 'Numeric value' },
                      { key: 'apartment_id', desc: 'Property link' },
                    ].map(item => (
                      <div key={item.key} className="flex flex-col">
                        <span className="text-[9px] font-black text-zinc-900 font-mono">{item.key}</span>
                        <span className="text-[8px] text-zinc-400 font-medium">{item.desc}</span>
                      </div>
                    ))}
                    {importType === 'properties' && [
                      { key: 'name', desc: 'Display name' },
                      { key: 'nickname', desc: 'Short code (e.g. BC-605)' },
                      { key: 'annual_rent_aed', desc: 'Total yearly rent' },
                      { key: 'specification', desc: 'Studio, 1BR, etc' },
                    ].map(item => (
                      <div key={item.key} className="flex flex-col">
                        <span className="text-[9px] font-black text-zinc-900 font-mono">{item.key}</span>
                        <span className="text-[8px] text-zinc-400 font-medium">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="System Maintenance" className="h-full">
          <div className="space-y-6 mt-4">
            <div className="p-6 bg-rose-50 rounded-[2rem] border border-rose-100">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-black text-rose-900 uppercase tracking-widest">Granular Data Reset</p>
                  <p className="text-[11px] text-rose-700 mt-2 leading-relaxed font-medium">
                    Permanently remove records based on a specific timeline. This is useful for clearing old history or resetting a specific period.
                  </p>
                  
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-rose-900 uppercase tracking-widest">Target Date</label>
                      <input 
                        type="date" 
                        value={resetDate}
                        onChange={(e) => setResetDate(e.target.value)}
                        className="w-full bg-white border border-rose-200 rounded-xl px-3 py-2 text-xs font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-rose-900 uppercase tracking-widest">Reset Scope</label>
                      <select 
                        value={resetScope}
                        onChange={(e) => setResetScope(e.target.value as any)}
                        className="w-full bg-white border border-rose-200 rounded-xl px-3 py-2 text-xs font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      >
                        <option value="after">All data AFTER date</option>
                        <option value="before">All data BEFORE date</option>
                        <option value="all">WIPE EVERYTHING</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (resetScope === 'all') {
                        if (window.confirm("ARE YOU ABSOLUTELY SURE? This will wipe ALL data and reset to defaults.")) {
                          handleReset();
                        }
                      } else {
                        if (window.confirm(`Are you sure you want to clear all data ${resetScope} ${resetDate}?`)) {
                          handleGranularReset();
                        }
                      }
                    }}
                    className="mt-6 w-full px-4 py-4 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 active:scale-[0.98]"
                  >
                    Execute Reset Sequence
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
              <div className="flex items-start gap-3">
                <RefreshCw className="text-zinc-400 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Cache Synchronization</p>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                    If you notice discrepancies in your reports, force a recalculation of all analytics.
                  </p>
                  <button className="mt-4 px-4 py-2 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-zinc-800 transition-all">
                    Rebuild Analytics Cache
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
