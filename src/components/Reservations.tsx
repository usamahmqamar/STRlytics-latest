/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Upload, Download, Search, Filter, 
  MoreVertical, Edit2, Trash2, CheckCircle2,
  XCircle, Calendar, User, Building2, CreditCard,
  Star, ChevronRight, Info, RefreshCw, X, Save
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { UserData, Reservation, Platform } from '../types';
import { format, parseISO, addDays, differenceInDays, isAfter, subDays } from 'date-fns';
import { cn } from '../lib/utils';
import { convertCurrency } from '../services/analytics';
import Papa from 'papaparse';

interface ReservationsProps {
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
  filters: {
    apartmentId: string;
    startDate: string;
    endDate: string;
    displayCurrency: string;
  };
}

export const Reservations: React.FC<ReservationsProps> = ({ data, setData, filters }) => {
  const [view, setView] = useState<'confirmed' | 'cancelled'>('confirmed');
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newRes, setNewRes] = useState<Partial<Reservation>>({
    reservation_code: '',
    apartment_id: '',
    platform_id: '',
    guest_name: '',
    check_in: format(new Date(), 'yyyy-MM-dd'),
    check_out: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    total_booking_revenue_aed: 0,
    cleaning_cost_aed: 0,
    status: 'confirmed',
    cancellation_policy: 'non-refundable',
    booking_date: format(new Date(), 'yyyy-MM-dd'),
    num_guests: 2
  });

  const calculateNetPayout = (gross: number, platformId: string) => {
    const platform = data.platforms.find(p => p.platform_id === platformId);
    if (!platform) return gross;
    const commission = (gross * platform.commission_percent) / 100;
    const charges = (gross * (platform.payment_charge_percent || 0)) / 100;
    return gross - commission - charges;
  };

  const handleSaveReservation = () => {
    if (!newRes.reservation_code || !newRes.apartment_id || !newRes.platform_id) {
      alert("Please fill in all mandatory fields (Code, Property, Platform)");
      return;
    }

    // Check for duplicate code
    const isDuplicate = data.reservations.some(r => r.reservation_code === newRes.reservation_code && (!editingReservation || r.reservation_code !== editingReservation.reservation_code));
    if (isDuplicate) {
      alert("Reservation code must be unique.");
      return;
    }

    const checkInDate = parseISO(newRes.check_in!);
    const checkOutDate = parseISO(newRes.check_out!);
    const nights = Math.max(1, differenceInDays(checkOutDate, checkInDate));
    
    const platform = data.platforms.find(p => p.platform_id === newRes.platform_id);
    
    const reservation: Reservation = {
      ...newRes as Reservation,
      check_in: format(checkInDate, 'yyyy-MM-dd'),
      check_out: format(checkOutDate, 'yyyy-MM-dd'),
      nights,
      channel: platform?.name || 'Unknown',
      net_payout_aed: calculateNetPayout(newRes.total_booking_revenue_aed || 0, newRes.platform_id!)
    };

    setData(prev => {
      if (editingReservation) {
        return {
          ...prev,
          reservations: prev.reservations.map(r => r.reservation_code === editingReservation.reservation_code ? reservation : r)
        };
      }
      return {
        ...prev,
        reservations: [...prev.reservations, reservation]
      };
    });

    setIsAddModalOpen(false);
    setEditingReservation(null);
    setNewRes({
      reservation_code: '',
      apartment_id: '',
      platform_id: '',
      guest_name: '',
      check_in: format(new Date(), 'yyyy-MM-dd'),
      check_out: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      total_booking_revenue_aed: 0,
      cleaning_cost_aed: 0,
      status: 'confirmed',
      cancellation_policy: 'non-refundable',
      booking_date: format(new Date(), 'yyyy-MM-dd'),
      num_guests: 2
    });
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const imported = results.data.map((row: any) => {
          const gross = parseFloat(row.total_booking_revenue_aed) || 0;
          const platformId = row.platform_id || data.platforms.find(p => p.name === row.channel)?.platform_id || 'direct';
          
          // Ensure dates are parsed and re-formatted to strip any time/timezone info
          const checkInDate = parseISO(row.check_in);
          const checkOutDate = parseISO(row.check_out);
          const checkIn = format(checkInDate, 'yyyy-MM-dd');
          const checkOut = format(checkOutDate, 'yyyy-MM-dd');
          const nights = Math.max(1, differenceInDays(checkOutDate, checkInDate));

          return {
            reservation_code: row.reservation_code,
            apartment_id: row.apartment_id,
            platform_id: platformId,
            channel: row.channel || data.platforms.find(p => p.platform_id === platformId)?.name || 'Direct',
            guest_name: row.guest_name,
            check_in: checkIn,
            check_out: checkOut,
            num_guests: parseInt(row.num_guests) || 2,
            nights,
            total_booking_revenue_aed: gross,
            net_payout_aed: calculateNetPayout(gross, platformId),
            cleaning_cost_aed: parseFloat(row.cleaning_cost_aed) || 0,
            status: (row.status?.toLowerCase() === 'cancelled' ? 'cancelled' : 'confirmed') as any,
            cancellation_policy: (row.cancellation_policy || 'non-refundable') as any,
            booking_date: row.booking_date || format(new Date(), 'yyyy-MM-dd'),
            rating: parseFloat(row.rating) || undefined,
            notes: row.notes,
            damages_incurred: row.damages_incurred
          };
        }).filter((r: any) => r.reservation_code && r.apartment_id);

        setData(prev => {
          const existingCodes = new Set(prev.reservations.map(r => r.reservation_code));
          const uniqueNew = imported.filter((r: any) => !existingCodes.has(r.reservation_code));
          return {
            ...prev,
            reservations: [...prev.reservations, ...uniqueNew]
          };
        });
        alert(`Imported ${imported.length} reservations.`);
      }
    });
  };

  const formatValue = (val: number) => {
    const converted = convertCurrency(val, 'AED', filters.displayCurrency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: filters.displayCurrency,
      minimumFractionDigits: 0
    }).format(converted);
  };

  const filteredReservations = useMemo(() => {
    return data.reservations.filter(res => {
      const matchesStatus = res.status === view;
      const matchesApt = filters.apartmentId === 'ALL' || res.apartment_id === filters.apartmentId;
      const matchesSearch = (res.guest_name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                            res.reservation_code.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Date filtering: check if reservation overlaps with the filter range
      // Or if check-in is within the range
      const checkIn = res.check_in;
      const checkOut = res.check_out;
      const filterStart = filters.startDate;
      const filterEnd = filters.endDate;
      
      const matchesDate = (checkIn >= filterStart && checkIn <= filterEnd) || 
                          (checkOut >= filterStart && checkOut <= filterEnd) ||
                          (checkIn <= filterStart && checkOut >= filterEnd);

      return matchesStatus && matchesApt && matchesSearch && matchesDate;
    }).sort((a, b) => b.check_in.localeCompare(a.check_in));
  }, [data.reservations, view, filters.apartmentId, filters.startDate, filters.endDate, searchQuery]);

  const handleDelete = (code: string) => {
    if (window.confirm("Are you sure you want to delete this reservation?")) {
      setData(prev => ({
        ...prev,
        reservations: prev.reservations.filter(r => r.reservation_code !== code)
      }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
          <button 
            onClick={() => setView('confirmed')}
            className={cn(
              "px-6 py-2 rounded-lg text-xs font-bold transition-all",
              view === 'confirmed' ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            Active Bookings
          </button>
          <button 
            onClick={() => setView('cancelled')}
            className={cn(
              "px-6 py-2 rounded-lg text-xs font-bold transition-all",
              view === 'cancelled' ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            Cancelled (Archive)
          </button>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".csv" 
            onChange={handleImportCSV}
          />
          <Button variant="outline" size="md" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} className="text-zinc-400" />
            Import CSV
          </Button>
          <Button onClick={() => {
            setEditingReservation(null);
            setNewRes({
              reservation_code: '',
              apartment_id: '',
              platform_id: '',
              guest_name: '',
              check_in: format(new Date(), 'yyyy-MM-dd'),
              check_out: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
              total_booking_revenue_aed: 0,
              cleaning_cost_aed: 0,
              num_guests: 2,
              status: 'confirmed',
              cancellation_policy: 'non-refundable',
              booking_date: format(new Date(), 'yyyy-MM-dd')
            });
            setIsAddModalOpen(true);
          }} size="md">
            <Plus size={18} />
            Add Reservation
          </Button>
        </div>
      </div>

      <Card title={view === 'confirmed' ? "Current Reservations" : "Cancelled Reservations Archive"}>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest">Booking Date</th>
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest">Property</th>
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest">Guest</th>
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest">Platform</th>
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest">Dates</th>
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest text-right">Revenue</th>
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest text-right">Net Payout</th>
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest text-center">Status</th>
                <th className="pb-4 font-semibold text-zinc-400 uppercase text-[10px] tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filteredReservations.map((res) => (
                <tr key={res.reservation_code} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="py-4 font-mono text-xs text-zinc-400">{res.booking_date}</td>
                  <td className="py-4 text-zinc-900 font-medium">
                    {data.apartments.find(a => a.apartment_id === res.apartment_id)?.name || res.apartment_id}
                  </td>
                  <td className="py-4">
                    <p className="font-bold text-zinc-900">{res.guest_name || "Guest"}</p>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold">{res.reservation_code}</p>
                  </td>
                  <td className="py-4">
                    <span className="px-2 py-1 bg-zinc-100 rounded-lg text-[10px] font-bold uppercase tracking-wider text-zinc-600 border border-zinc-200">
                      {res.channel}
                    </span>
                  </td>
                  <td className="py-4">
                    <p className="text-xs font-medium text-zinc-900">{res.check_in} to {res.check_out}</p>
                    <p className="text-[10px] text-zinc-400">{res.nights} nights</p>
                  </td>
                  <td className="py-4 text-right font-medium text-zinc-900">{formatValue(res.total_booking_revenue_aed)}</td>
                  <td className="py-4 text-right font-bold text-emerald-600">{formatValue(res.net_payout_aed)}</td>
                  <td className="py-4 text-center">
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                      res.status === 'confirmed' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                    )}>
                      {res.status}
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button 
                        onClick={() => {
                          setEditingReservation(res);
                          setNewRes(res);
                          setIsAddModalOpen(true);
                        }}
                        className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors rounded-lg hover:bg-zinc-100"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(res.reservation_code)}
                        className="p-2 text-zinc-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredReservations.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-zinc-400 italic">
                    No reservations found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">
                  {editingReservation ? 'Edit Reservation' : 'Add New Reservation'}
                </h3>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Basic Info */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Reservation Code (Mandatory)</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-bold"
                      placeholder="e.g. HM123456"
                      value={newRes.reservation_code}
                      onChange={e => setNewRes({...newRes, reservation_code: e.target.value})}
                      disabled={!!editingReservation}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Guest Name</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newRes.guest_name}
                      onChange={e => setNewRes({...newRes, guest_name: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Property</label>
                      <select 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                        value={newRes.apartment_id}
                        onChange={e => setNewRes({...newRes, apartment_id: e.target.value})}
                      >
                        <option value="">Select Property</option>
                        {data.apartments.map(apt => (
                          <option key={apt.apartment_id} value={apt.apartment_id}>{apt.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Platform</label>
                      <select 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                        value={newRes.platform_id}
                        onChange={e => setNewRes({...newRes, platform_id: e.target.value})}
                      >
                        <option value="">Select Platform</option>
                        {data.platforms.map(p => (
                          <option key={p.platform_id} value={p.platform_id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Check-in Date</label>
                      <input 
                        type="date" 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                        value={newRes.check_in}
                        onChange={e => setNewRes({...newRes, check_in: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Check-out Date</label>
                      <input 
                        type="date" 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                        value={newRes.check_out}
                        onChange={e => setNewRes({...newRes, check_out: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Check-in Time (Opt)</label>
                      <input 
                        type="time" 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                        value={newRes.check_in_time}
                        onChange={e => setNewRes({...newRes, check_in_time: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Check-out Time (Opt)</label>
                      <input 
                        type="time" 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                        value={newRes.check_out_time}
                        onChange={e => setNewRes({...newRes, check_out_time: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Number of Guests</label>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newRes.num_guests}
                      onChange={e => setNewRes({...newRes, num_guests: Number(e.target.value)})}
                    />
                  </div>
                </div>

                {/* Financials & Status */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Booking Date</label>
                      <input 
                        type="date" 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                        value={newRes.booking_date}
                        onChange={e => setNewRes({...newRes, booking_date: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Status</label>
                      <select 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                        value={newRes.status}
                        onChange={e => setNewRes({...newRes, status: e.target.value as any})}
                      >
                        <option value="confirmed">Confirmed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Cancellation Policy</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                      value={newRes.cancellation_policy}
                      onChange={e => setNewRes({...newRes, cancellation_policy: e.target.value as any})}
                    >
                      <option value="non-refundable">Non-Refundable</option>
                      <option value="refundable">Fully Refundable</option>
                      <option value="14-day-flexible">14-Day Flexible</option>
                      <option value="7-day-flexible">7-Day Flexible</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Gross Revenue (AED)</label>
                      <input 
                        type="number" 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-black"
                        value={newRes.total_booking_revenue_aed}
                        onChange={e => setNewRes({...newRes, total_booking_revenue_aed: Number(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Cleaning Cost (AED)</label>
                      <input 
                        type="number" 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-black"
                        value={newRes.cleaning_cost_aed}
                        onChange={e => setNewRes({...newRes, cleaning_cost_aed: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                  
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Estimated Net Payout</p>
                    <p className="text-xl font-black text-emerald-700">
                      {formatValue(calculateNetPayout(newRes.total_booking_revenue_aed || 0, newRes.platform_id || ''))}
                    </p>
                    <p className="text-[10px] text-emerald-600/70 font-medium">Auto-calculated based on platform commission & charges</p>
                  </div>

                  {/* Post-stay details */}
                  {editingReservation && isAfter(new Date(), parseISO(editingReservation.check_out)) && (
                    <div className="pt-4 border-t border-zinc-100 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Guest Rating (1-5)</label>
                        <div className="flex gap-2">
                          {[1,2,3,4,5].map(star => (
                            <button 
                              key={star}
                              onClick={() => setNewRes({...newRes, rating: star})}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                (newRes.rating || 0) >= star ? "text-amber-400 bg-amber-50" : "text-zinc-300 hover:text-zinc-400"
                              )}
                            >
                              <Star size={20} fill={(newRes.rating || 0) >= star ? "currentColor" : "none"} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Stay Notes / Damages</label>
                        <textarea 
                          className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium min-h-[80px]"
                          placeholder="Any notes about the guest or damages incurred..."
                          value={newRes.notes}
                          onChange={e => setNewRes({...newRes, notes: e.target.value})}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveReservation}>
                  <Save size={18} />
                  {editingReservation ? 'Update Reservation' : 'Save Reservation'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
