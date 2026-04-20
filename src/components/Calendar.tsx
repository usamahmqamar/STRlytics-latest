/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Users, Moon, CreditCard, Info, Plus, Search
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { UserData, Reservation, Apartment } from '../types';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  eachDayOfInterval, isSameDay, isWithinInterval, parseISO,
  addDays, subDays, differenceInDays, isToday
} from 'date-fns';
import { cn } from '../lib/utils';
import { convertCurrency } from '../services/analytics';

interface CalendarProps {
  data: UserData;
  filters: {
    apartmentId: string;
    displayCurrency: string;
  };
}

export const Calendar: React.FC<CalendarProps> = ({ data, filters }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  const days = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth)
    });
  }, [currentMonth]);

  const formatValue = (val: number) => {
    const converted = convertCurrency(val, 'AED', filters.displayCurrency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: filters.displayCurrency,
      minimumFractionDigits: 0
    }).format(converted);
  };

  const filteredApartments = useMemo(() => {
    return data.apartments.filter(a => filters.apartmentId === 'ALL' || a.apartment_id === filters.apartmentId);
  }, [data.apartments, filters.apartmentId]);

  const getReservationForDay = (aptId: string, day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return data.reservations.find(res => {
      if (res.apartment_id !== aptId || res.status === 'cancelled') return false;
      return dateStr >= res.check_in && dateStr < res.check_out;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-zinc-200">
            <CalendarIcon size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900 tracking-tight uppercase italic">Booking Calendar</h2>
            <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">Real-time portfolio occupancy & availability</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-zinc-500 hover:text-zinc-900"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="px-6 text-xs font-black uppercase tracking-[0.2em] text-zinc-900 min-w-[160px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-zinc-500 hover:text-zinc-900"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <Button variant="outline" size="md" onClick={() => setCurrentMonth(new Date())} className="rounded-2xl font-black uppercase tracking-widest text-[10px]">
            Jump to Today
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0 border-zinc-100 shadow-xl shadow-zinc-200/50">
        <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[1200px]">
            {/* Calendar Header */}
            <div className="flex border-b border-zinc-100 bg-zinc-50/50">
              <div className="w-64 p-6 border-r border-zinc-100 shrink-0">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Property Portfolio</span>
              </div>
              <div className="flex flex-grow">
                {days.map(day => (
                  <div 
                    key={day.toISOString()} 
                    className={cn(
                      "flex-1 min-w-[40px] p-4 text-center border-r border-zinc-100/50 flex flex-col items-center justify-center gap-1",
                      isToday(day) && "bg-zinc-900 text-white"
                    )}
                  >
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest",
                      isToday(day) ? "text-zinc-400" : "text-zinc-400"
                    )}>
                      {format(day, 'EEE')}
                    </span>
                    <span className="text-sm font-black tracking-tight">
                      {format(day, 'd')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar Body */}
            <div className="divide-y divide-zinc-100">
              {filteredApartments.map(apt => (
                <div key={apt.apartment_id} className="flex group">
                  <div className="w-64 p-6 border-r border-zinc-100 shrink-0 bg-white group-hover:bg-zinc-50 transition-colors">
                    <h4 className="text-sm font-black text-zinc-900 tracking-tight">{apt.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{apt.nickname}</span>
                      <span className="w-1 h-1 rounded-full bg-zinc-200" />
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{apt.building}</span>
                    </div>
                  </div>
                  <div className="flex flex-grow relative bg-white group-hover:bg-zinc-50/30 transition-colors">
                    {days.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const res = getReservationForDay(apt.apartment_id, day);
                      const isStart = res && dateStr === res.check_in;
                      const isTodayDay = isToday(day);
                      
                      return (
                        <div 
                          key={day.toISOString()} 
                          className={cn(
                            "flex-1 min-w-[40px] h-20 border-r border-zinc-100/30 relative",
                            isTodayDay && "bg-zinc-900/[0.02]"
                          )}
                        >
                          {isTodayDay && (
                            <div className="absolute inset-y-0 left-1/2 w-px bg-emerald-500/20 z-0 pointer-events-none">
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                            </div>
                          )}
                          {res && isStart && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              onClick={() => setSelectedReservation(res)}
                              className={cn(
                                "absolute top-2 left-1 bottom-2 z-10 rounded-xl p-3 cursor-pointer transition-all shadow-sm hover:shadow-md border flex flex-col justify-center overflow-hidden",
                                res.status === 'confirmed' 
                                  ? "bg-zinc-900 text-white border-zinc-800 hover:bg-zinc-800" 
                                  : "bg-zinc-100 text-zinc-400 border-zinc-200"
                              )}
                              style={{ 
                                width: `calc(${res.nights * 100}% + ${(res.nights - 1) * 1}px - 8px)`,
                                minWidth: '120px'
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black truncate uppercase tracking-widest">{res.guest_name}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Users size={10} className="text-zinc-500" />
                                  <span className="text-[9px] font-bold">{res.num_guests}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mt-1.5 opacity-60">
                                <div className="flex items-center gap-1">
                                  <Moon size={10} />
                                  <span className="text-[9px] font-bold">{res.nights}n</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <CreditCard size={10} />
                                  <span className="text-[9px] font-bold">{formatValue(res.net_payout_aed)}</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="p-4 bg-zinc-50/50 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-zinc-900 rounded-full" />
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Confirmed Booking</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-zinc-200 rounded-full" />
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Pending/Other</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full border-2 border-zinc-900 flex items-center justify-center">
                <div className="w-1 h-1 bg-zinc-900 rounded-full" />
              </div>
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Today's Marker</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 italic font-medium">
            * Checkout day is not counted as a stay night in the visualization
          </p>
        </div>
      </Card>

      {/* Reservation Detail Modal */}
      <AnimatePresence>
        {selectedReservation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-zinc-900 tracking-tight">Booking Details</h3>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Code: {selectedReservation.reservation_code}</p>
                </div>
                <button onClick={() => setSelectedReservation(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <Search size={20} className="rotate-45" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Check-in</p>
                    <p className="text-sm font-black text-zinc-900">{format(parseISO(selectedReservation.check_in), 'EEE, MMM d')}</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Check-out</p>
                    <p className="text-sm font-black text-zinc-900">{format(parseISO(selectedReservation.check_out), 'EEE, MMM d')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-900">
                    <Users size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Guest Name</p>
                    <p className="text-lg font-black text-zinc-900">{selectedReservation.guest_name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Stay Duration</p>
                    <p className="text-sm font-black text-zinc-900">{selectedReservation.nights} Nights</p>
                    <p className="text-[10px] text-zinc-500 mt-1">{format(parseISO(selectedReservation.check_in), 'MMM dd')} - {format(parseISO(selectedReservation.check_out), 'MMM dd')}</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Guests</p>
                    <p className="text-sm font-black text-zinc-900">{selectedReservation.num_guests} Persons</p>
                  </div>
                </div>

                <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Final Net Payout</p>
                    <span className="px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded uppercase tracking-widest">Confirmed</span>
                  </div>
                  <p className="text-xl font-black text-emerald-700">{formatValue(selectedReservation.net_payout_aed)}</p>
                  <p className="text-[10px] text-emerald-600/70 font-medium mt-1">Platform: {selectedReservation.channel}</p>
                </div>
              </div>
              <div className="p-8 border-t border-zinc-100 bg-zinc-50/50 flex justify-end">
                <Button onClick={() => setSelectedReservation(null)} className="rounded-2xl font-black uppercase tracking-widest text-[10px]">Close Details</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
