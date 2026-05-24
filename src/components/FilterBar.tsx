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
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-2xl shadow-sm">
      {/* Property Selector */}
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800 min-w-[190px] h-9">
        <Building2 size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
        <select 
          value={filters.apartmentId}
          onChange={(e) => setFilters(prev => ({ ...prev, apartmentId: e.target.value }))}
          className="bg-transparent border-none text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:ring-0 cursor-pointer w-full p-0 leading-tight"
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
      <div className="flex items-center gap-1 p-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800 h-9">
        {presets.map(preset => {
          const range = preset.getRange();
          const isActive = filters.startDate === range.start && filters.endDate === range.end;
          return (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset.getRange)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 h-full flex items-center",
                isActive 
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm" 
                  : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom Date Range */}
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800 h-9">
        <Calendar size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
        <div className="flex items-center gap-1.5">
          <input 
            type="date" 
            value={filters.startDate}
            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
            className="bg-transparent border-none text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:ring-0 p-0 w-24"
          />
          <span className="text-zinc-300 dark:text-zinc-650">—</span>
          <input 
            type="date" 
            value={filters.endDate}
            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
            className="bg-transparent border-none text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:ring-0 p-0 w-24"
          />
        </div>
      </div>

      {/* Currency Selector */}
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800 h-9 ml-auto">
        <DollarSign size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
        <select 
          value={filters.displayCurrency}
          onChange={(e) => setFilters(prev => ({ ...prev, displayCurrency: e.target.value }))}
          className="bg-transparent border-none text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:ring-0 cursor-pointer p-0 select-none leading-tight"
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
