/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Calendar, 
  Building2, 
  DollarSign, 
  ChevronDown, 
  Clock,
  Filter
} from 'lucide-react';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfYear, 
  endOfYear,
  parseISO
} from 'date-fns';
import { cn } from '../lib/utils';
import { Apartment } from '../types';

interface FilterBarProps {
  filters: {
    apartmentId: string;
    startDate: string;
    endDate: string;
    displayCurrency: string;
  };
  setFilters: React.Dispatch<React.SetStateAction<{
    apartmentId: string;
    startDate: string;
    endDate: string;
    displayCurrency: string;
  }>>;
  apartments: Apartment[];
}

export const FilterBar: React.FC<FilterBarProps> = ({ filters, setFilters, apartments }) => {
  const presets = [
    { 
      label: 'This Week', 
      getRange: () => ({ 
        start: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), 
        end: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') 
      }) 
    },
    { 
      label: 'This Month', 
      getRange: () => ({ 
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), 
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd') 
      }) 
    },
    { 
      label: 'Last Month', 
      getRange: () => ({ 
        start: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), 
        end: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') 
      }) 
    },
    { 
      label: 'This Year', 
      getRange: () => ({ 
        start: format(startOfYear(new Date()), 'yyyy-MM-dd'), 
        end: format(endOfYear(new Date()), 'yyyy-MM-dd') 
      }) 
    },
  ];

  const handlePresetClick = (getRange: () => { start: string; end: string }) => {
    const range = getRange();
    setFilters(prev => ({
      ...prev,
      startDate: range.start,
      endDate: range.end
    }));
  };

  return (
    <div className="flex flex-wrap items-center gap-4 mb-8 p-6 bg-white border border-zinc-200 rounded-[2rem] shadow-sm">
      {/* Property Selector */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 rounded-2xl border border-zinc-100 min-w-[200px]">
        <Building2 size={16} className="text-zinc-400" />
        <select 
          value={filters.apartmentId}
          onChange={(e) => setFilters(prev => ({ ...prev, apartmentId: e.target.value }))}
          className="bg-transparent border-none text-[11px] font-black uppercase tracking-widest focus:ring-0 cursor-pointer w-full"
        >
          <option value="ALL">All Properties</option>
          {apartments.map(apt => (
            <option key={apt.apartment_id} value={apt.apartment_id}>
              {apt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date Presets */}
      <div className="flex items-center gap-2 p-1 bg-zinc-50 rounded-2xl border border-zinc-100">
        {presets.map(preset => {
          const range = preset.getRange();
          const isActive = filters.startDate === range.start && filters.endDate === range.end;
          return (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset.getRange)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                isActive 
                  ? "bg-zinc-900 text-white shadow-lg" 
                  : "text-zinc-400 hover:text-zinc-900 hover:bg-white"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom Date Range */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 rounded-2xl border border-zinc-100">
        <Calendar size={16} className="text-zinc-400" />
        <div className="flex items-center gap-2">
          <input 
            type="date" 
            value={filters.startDate}
            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
            className="bg-transparent border-none text-[10px] font-bold focus:ring-0 p-0 w-28"
          />
          <span className="text-zinc-300 text-xs">—</span>
          <input 
            type="date" 
            value={filters.endDate}
            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
            className="bg-transparent border-none text-[10px] font-bold focus:ring-0 p-0 w-28"
          />
        </div>
      </div>

      {/* Currency Selector */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 rounded-2xl border border-zinc-100 ml-auto">
        <DollarSign size={16} className="text-zinc-400" />
        <select 
          value={filters.displayCurrency}
          onChange={(e) => setFilters(prev => ({ ...prev, displayCurrency: e.target.value }))}
          className="bg-transparent border-none text-[11px] font-black uppercase tracking-widest focus:ring-0 cursor-pointer"
        >
          <option value="AED">AED</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>
      </div>
    </div>
  );
};
