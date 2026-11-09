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
      label: 'This week', 
      getRange: () => ({ 
        start: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), 
        end: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') 
      }) 
    },
    { 
      label: 'This month', 
      getRange: () => ({ 
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), 
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd') 
      }) 
    },
    { 
      label: 'Last month', 
      getRange: () => ({ 
        start: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), 
        end: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') 
      }) 
    },
    { 
      label: 'This year', 
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
    <div className="flex flex-wrap items-center gap-2 mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800">
      {/* Property Selector */}
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 min-w-0 flex-1 sm:min-w-[190px] sm:flex-none h-9">
        <Building2 size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
        <select 
          value={filters.apartmentId}
          onChange={(e) => setFilters(prev => ({ ...prev, apartmentId: e.target.value }))}
          className="bg-transparent border-none text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:ring-0 cursor-pointer w-full p-0 leading-tight"
        >
          <option value="ALL">All properties</option>
          {apartments.map(apt => (
            <option key={apt.apartment_id} value={apt.apartment_id}>
              {apt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date Presets */}
      <div className="flex max-w-full items-center gap-0.5 overflow-x-auto p-0.5 bg-zinc-100 dark:bg-zinc-850 rounded-lg h-9">
        {presets.map(preset => {
          const range = preset.getRange();
          const isActive = filters.startDate === range.start && filters.endDate === range.end;
          return (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset.getRange)}
              className={cn(
                "px-3 rounded-md text-xs font-medium whitespace-nowrap transition-colors h-full flex items-center",
                isActive 
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm" 
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom Date Range */}
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 h-9">
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
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 h-9 sm:ml-auto">
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
