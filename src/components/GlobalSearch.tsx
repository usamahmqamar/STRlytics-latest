/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Building2, User, Calendar, FileText, Package, Wrench, ArrowRight } from 'lucide-react';
import { UserData } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { format, parseISO } from 'date-fns';

interface GlobalSearchProps {
  data: UserData;
  onNavigate: (tab: string, subTab?: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ data, onNavigate, isOpen, onClose }) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const res: any[] = [];

    // Properties
    data.apartments.forEach(apt => {
      if (apt.name.toLowerCase().includes(q) || apt.building.toLowerCase().includes(q)) {
        res.push({ type: 'property', id: apt.apartment_id, title: apt.name, subtitle: apt.building, icon: Building2, tab: 'setup' });
      }
    });

    // Reservations
    data.reservations.forEach(rev => {
      if (rev.guest_name.toLowerCase().includes(q) || rev.reservation_code.toLowerCase().includes(q)) {
        res.push({ 
          type: 'reservation', 
          id: rev.reservation_code, 
          title: rev.guest_name, 
          subtitle: `${rev.reservation_code} • ${format(parseISO(rev.check_in), 'MMM dd')}`, 
          icon: User, 
          tab: 'reservations' 
        });
      }
    });

    // Vendors
    data.vendors.forEach(v => {
      if (v.name.toLowerCase().includes(q) || v.service_type.toLowerCase().includes(q)) {
        res.push({ type: 'vendor', id: v.vendor_id, title: v.name, subtitle: v.service_type, icon: Package, tab: 'operations', subTab: 'vendors' });
      }
    });

    // Maintenance Tasks
    (data.maintenanceTasks || []).forEach(t => {
      if (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) {
        res.push({ type: 'task', id: t.task_id, title: t.title, subtitle: t.status, icon: Wrench, tab: 'operations', subTab: 'maintenance' });
      }
    });

    return res.slice(0, 8);
  }, [query, data]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4 bg-zinc-900/40 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-zinc-100"
          >
            <div className="p-4 flex items-center gap-4 border-b border-zinc-100">
              <Search className="text-zinc-400 ml-2" size={20} />
              <input 
                ref={inputRef}
                type="text" 
                placeholder="Search properties, guests, vendors, tasks..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-medium text-zinc-900 placeholder:text-zinc-300"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && onClose()}
              />
              <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400">
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
              {results.length > 0 ? (
                <div className="p-2">
                  {results.map((res, idx) => (
                    <button
                      key={`${res.type}-${res.id}`}
                      onClick={() => {
                        onNavigate(res.tab, res.subTab);
                        onClose();
                      }}
                      className="w-full flex items-center gap-4 p-4 hover:bg-zinc-50 rounded-2xl transition-all group text-left"
                    >
                      <div className="p-3 bg-zinc-100 rounded-xl text-zinc-500 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                        <res.icon size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black text-zinc-900 tracking-tight uppercase italic">{res.title}</p>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{res.subtitle}</p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight size={18} className="text-zinc-400" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : query.trim() ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-zinc-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-zinc-100">
                    <Search size={32} className="text-zinc-200" />
                  </div>
                  <p className="text-zinc-400 font-bold">No results found for "{query}"</p>
                  <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">Try searching for something else</p>
                </div>
              ) : (
                <div className="p-8">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4 ml-2">Quick Actions</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Add Reservation', tab: 'reservations', icon: Calendar },
                      { label: 'Record Expense', tab: 'operations', icon: Package },
                      { label: 'New Property', tab: 'setup', icon: Building2 },
                      { label: 'View Reports', tab: 'analytics', icon: FileText },
                    ].map(action => (
                      <button
                        key={action.label}
                        onClick={() => {
                          onNavigate(action.tab);
                          onClose();
                        }}
                        className="flex items-center gap-3 p-4 bg-zinc-50 hover:bg-zinc-100 rounded-2xl border border-zinc-100 transition-all text-left group"
                      >
                        <action.icon size={18} className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                        <span className="text-xs font-bold text-zinc-600 group-hover:text-zinc-900 transition-colors">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-[10px] font-bold text-zinc-400 shadow-sm">ESC</kbd>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">to close</span>
                </div>
              </div>
              <p className="text-[9px] font-black text-zinc-300 uppercase tracking-widest italic">Mission Control Search v1.0</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

import { useMemo } from 'react';
