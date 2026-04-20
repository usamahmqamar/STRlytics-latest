/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Plus, Search, Filter, MoreVertical, 
  CheckCircle2, AlertCircle, Clock, CreditCard,
  Wrench, Trash2, Edit2, ChevronRight, FileText,
  Package, Truck, Zap, TrendingUp, TrendingDown,
  LayoutDashboard, X
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { UserData, Vendor, ServiceRecord, Invoice, Payment, DailyExpense, MaintenanceTask } from '../types';
import { format, parseISO, isSameMonth, subDays } from 'date-fns';
import { cn } from '../lib/utils';
import { convertCurrency } from '../services/analytics';

interface OperationsProps {
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
  filters: {
    apartmentId: string;
    startDate: string;
    endDate: string;
    displayCurrency: string;
  };
  prefilledExpense?: any;
  onClearPrefill?: () => void;
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
  newTask: any;
  setNewTask: (task: any) => void;
  apartments: any[];
  vendors: any[];
}

const AddTaskModal: React.FC<AddTaskModalProps> = ({ 
  isOpen, onClose, onAdd, newTask, setNewTask, apartments, vendors 
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
              <h3 className="text-xl font-black text-zinc-900 tracking-tight italic uppercase">Raise Maintenance Ticket</h3>
              <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Task Title</label>
                <input 
                  type="text" 
                  placeholder="e.g. AC Leakage in Living Room"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                  value={newTask.title || ''}
                  onChange={e => setNewTask({...newTask, title: e.target.value})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Description</label>
                <textarea 
                  placeholder="Provide details about the issue..."
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium h-24 resize-none"
                  value={newTask.description || ''}
                  onChange={e => setNewTask({...newTask, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Property</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                    value={newTask.apartment_id || ''}
                    onChange={e => setNewTask({...newTask, apartment_id: e.target.value})}
                  >
                    <option value="">Select Property</option>
                    {apartments.map(a => <option key={a.apartment_id} value={a.apartment_id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Priority</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                    value={newTask.priority}
                    onChange={e => setNewTask({...newTask, priority: e.target.value})}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Assign Vendor (Optional)</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                    value={newTask.vendor_id || ''}
                    onChange={e => setNewTask({...newTask, vendor_id: e.target.value})}
                  >
                    <option value="">Unassigned</option>
                    {vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Due Date</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newTask.due_date || ''}
                    onChange={e => setNewTask({...newTask, due_date: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={onAdd} disabled={!newTask.title || !newTask.apartment_id}>Create Ticket</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const Operations: React.FC<OperationsProps> = ({ 
  data, setData, filters, prefilledExpense, onClearPrefill 
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vendors' | 'records' | 'invoices' | 'payments' | 'expenses' | 'maintenance'>('dashboard');
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'unbilled' | 'billed' | 'paid' | 'pending' | 'in_progress' | 'completed'>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('all');

  // Modal States
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [isAddRecordOpen, setIsAddRecordOpen] = useState(false);
  const [isAddInvoiceOpen, setIsAddInvoiceOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  // Form States
  const [newVendor, setNewVendor] = useState<Partial<Vendor>>({ status: 'active' });
  const [newRecord, setNewRecord] = useState<Partial<ServiceRecord>>({ 
    date: format(new Date(), 'yyyy-MM-dd'),
    status: 'unbilled',
    quantity: 1
  });
  const [newInvoice, setNewInvoice] = useState<{ vendor_id: string; record_ids: string[] }>({ 
    vendor_id: '', 
    record_ids: [] 
  });
  const [newPayment, setNewPayment] = useState<Partial<Payment>>({ 
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'invoice_payment'
  });
  const [newExpense, setNewExpense] = useState<Partial<DailyExpense>>({ 
    date: format(new Date(), 'yyyy-MM-dd'),
    apartment_id: 'PORTFOLIO'
  });
  const [newTask, setNewTask] = useState<any>({
    priority: 'medium',
    status: 'pending',
    created_at: format(new Date(), 'yyyy-MM-dd')
  });

  // Handle prefilled expense from OCR
  React.useEffect(() => {
    if (prefilledExpense) {
      setNewExpense({
        ...newExpense,
        ...prefilledExpense
      });
      setActiveTab('expenses');
      setIsAddExpenseOpen(true);
      if (onClearPrefill) onClearPrefill();
    }
  }, [prefilledExpense]);

  const handleAddVendor = () => {
    if (!newVendor.name || !newVendor.service_type) return;
    const vendor: Vendor = {
      vendor_id: `VND-${Date.now()}`,
      name: newVendor.name,
      service_type: newVendor.service_type,
      phone: newVendor.phone,
      email: newVendor.email,
      status: newVendor.status as 'active' | 'inactive'
    };
    setData(prev => ({ ...prev, vendors: [...prev.vendors, vendor] }));
    setIsAddVendorOpen(false);
    setNewVendor({ status: 'active' });
  };

  const handleAddRecord = () => {
    if (!newRecord.vendor_id || !newRecord.apartment_id || !newRecord.unit_cost) return;
    const record: ServiceRecord = {
      record_id: `REC-${Date.now()}`,
      date: newRecord.date!,
      apartment_id: newRecord.apartment_id,
      vendor_id: newRecord.vendor_id,
      service_type: data.vendors.find(v => v.vendor_id === newRecord.vendor_id)?.service_type || 'General',
      description: newRecord.description || '',
      quantity: newRecord.quantity || 1,
      unit_cost: newRecord.unit_cost,
      total_cost: (newRecord.quantity || 1) * newRecord.unit_cost,
      status: 'unbilled'
    };
    setData(prev => ({ ...prev, serviceRecords: [...prev.serviceRecords, record] }));
    setIsAddRecordOpen(false);
    setNewRecord({ date: format(new Date(), 'yyyy-MM-dd'), status: 'unbilled', quantity: 1 });
  };

  const handleRaiseInvoice = () => {
    if (!newInvoice.vendor_id || newInvoice.record_ids.length === 0) return;
    const selectedRecords = data.serviceRecords.filter(r => newInvoice.record_ids.includes(r.record_id));
    const total = selectedRecords.reduce((sum, r) => sum + r.total_cost, 0);
    
    const invoice: Invoice = {
      invoice_id: `INV-${Date.now()}`,
      vendor_id: newInvoice.vendor_id,
      record_ids: newInvoice.record_ids,
      total_amount: total,
      date: format(new Date(), 'yyyy-MM-dd'),
      status: 'pending'
    };

    setData(prev => ({
      ...prev,
      invoices: [...prev.invoices, invoice],
      serviceRecords: prev.serviceRecords.map(r => 
        newInvoice.record_ids.includes(r.record_id) ? { ...r, status: 'billed', invoice_id: invoice.invoice_id } : r
      )
    }));
    setIsAddInvoiceOpen(false);
    setNewInvoice({ vendor_id: '', record_ids: [] });
  };

  const handleAddPayment = () => {
    if (!newPayment.vendor_id || !newPayment.amount_paid) return;
    const payment: Payment = {
      payment_id: `PAY-${Date.now()}`,
      date: newPayment.date!,
      vendor_id: newPayment.vendor_id,
      amount_paid: newPayment.amount_paid,
      type: newPayment.type as any,
      invoice_id: newPayment.invoice_id,
      notes: newPayment.notes
    };

    setData(prev => {
      let updatedInvoices = [...prev.invoices];
      if (payment.invoice_id) {
        updatedInvoices = updatedInvoices.map(inv => {
          if (inv.invoice_id === payment.invoice_id) {
            const totalPaidForInvoice = prev.payments
              .filter(p => p.invoice_id === inv.invoice_id)
              .reduce((sum, p) => sum + p.amount_paid, 0) + payment.amount_paid;
            
            let newStatus: 'paid' | 'partial' | 'pending' = 'pending';
            if (totalPaidForInvoice >= inv.total_amount) {
              newStatus = 'paid';
            } else if (totalPaidForInvoice > 0) {
              newStatus = 'partial';
            }
            return { ...inv, status: newStatus };
          }
          return inv;
        });
      }
      return {
        ...prev,
        payments: [...prev.payments, payment],
        invoices: updatedInvoices
      };
    });
    setIsAddPaymentOpen(false);
    setNewPayment({ date: format(new Date(), 'yyyy-MM-dd'), type: 'invoice_payment' });
  };

  const handleAddExpense = () => {
    if (!newExpense.amount_aed || !newExpense.category) return;
    const expense: DailyExpense = {
      expense_id: `EXP-${Date.now()}`,
      apartment_id: newExpense.apartment_id || 'PORTFOLIO',
      date: newExpense.date!,
      category: newExpense.category,
      amount_aed: newExpense.amount_aed,
      notes: newExpense.notes
    };
    setData(prev => ({ ...prev, dailyExpenses: [...prev.dailyExpenses, expense] }));
    setIsAddExpenseOpen(false);
    setNewExpense({ date: format(new Date(), 'yyyy-MM-dd'), apartment_id: 'PORTFOLIO' });
  };

  const formatValue = (val: number) => {
    const converted = convertCurrency(val, 'AED', filters.displayCurrency);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: filters.displayCurrency,
      minimumFractionDigits: 0
    }).format(converted);
  };

  const vendorStats = useMemo(() => {
    return data.vendors
      .filter(v => {
        const matchesSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             v.service_type.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .map(vendor => {
        const records = data.serviceRecords.filter(r => r.vendor_id === vendor.vendor_id);
        const payments = data.payments.filter(p => p.vendor_id === vendor.vendor_id);
        
        const totalWorkDone = records.reduce((sum, r) => sum + r.total_cost, 0);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount_paid, 0);
        const balance = totalWorkDone - totalPaid;
        
        return {
          ...vendor,
          totalWorkDone,
          totalPaid,
          payableBalance: balance > 0 ? balance : 0,
          advanceBalance: balance < 0 ? Math.abs(balance) : 0,
          unbilledWork: records.filter(r => r.status === 'unbilled').reduce((sum, r) => sum + r.total_cost, 0)
        };
      });
  }, [data.vendors, data.serviceRecords, data.payments, searchQuery, statusFilter]);

  const filteredRecords = useMemo(() => {
    return data.serviceRecords.filter(r => {
      const vendor = data.vendors.find(v => v.vendor_id === r.vendor_id);
      const apt = data.apartments.find(a => a.apartment_id === r.apartment_id);
      const matchesSearch = 
        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vendor?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        apt?.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesVendor = vendorFilter === 'all' || r.vendor_id === vendorFilter;
      const matchesApt = filters.apartmentId === 'ALL' || r.apartment_id === filters.apartmentId;
      const matchesDate = r.date >= filters.startDate && r.date <= filters.endDate;
      return matchesSearch && matchesStatus && matchesVendor && matchesApt && matchesDate;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [data.serviceRecords, data.vendors, data.apartments, searchQuery, statusFilter, vendorFilter, filters]);

  const filteredInvoices = useMemo(() => {
    return data.invoices.filter(inv => {
      const vendor = data.vendors.find(v => v.vendor_id === inv.vendor_id);
      const matchesSearch = 
        inv.invoice_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vendor?.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDate = inv.date >= filters.startDate && inv.date <= filters.endDate;
      return matchesSearch && matchesDate;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [data.invoices, data.vendors, searchQuery, filters]);

  const filteredPayments = useMemo(() => {
    return data.payments.filter(p => {
      const vendor = data.vendors.find(v => v.vendor_id === p.vendor_id);
      const matchesSearch = 
        p.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vendor?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDate = p.date >= filters.startDate && p.date <= filters.endDate;
      return matchesSearch && matchesDate;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [data.payments, data.vendors, searchQuery, filters]);

  const filteredExpenses = useMemo(() => {
    return data.dailyExpenses.filter(e => {
      const apt = data.apartments.find(a => a.apartment_id === e.apartment_id);
      const matchesSearch = 
        e.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.apartment_id === 'PORTFOLIO' ? 'shared' : apt?.name.toLowerCase()).includes(searchQuery.toLowerCase());
      const matchesApt = filters.apartmentId === 'ALL' || e.apartment_id === filters.apartmentId || e.apartment_id === 'PORTFOLIO';
      const matchesDate = e.date >= filters.startDate && e.date <= filters.endDate;
      return matchesSearch && matchesApt && matchesDate;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [data.dailyExpenses, data.apartments, searchQuery, filters]);

  const totals = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 30);
    const recentPayments = data.payments.filter(p => parseISO(p.date) >= thirtyDaysAgo);
    
    const billedUnpaid = data.invoices
      .filter(inv => inv.status !== 'paid')
      .reduce((sum, inv) => {
        const paidForInv = data.payments
          .filter(p => p.invoice_id === inv.invoice_id)
          .reduce((pSum, p) => pSum + p.amount_paid, 0);
        return sum + (inv.total_amount - paidForInv);
      }, 0);

    return {
      payable: vendorStats.reduce((sum, v) => sum + v.payableBalance, 0),
      advances: vendorStats.reduce((sum, v) => sum + v.advanceBalance, 0),
      unbilled: vendorStats.reduce((sum, v) => sum + v.unbilledWork, 0),
      billedUnpaid,
      totalPaidOut: data.payments.reduce((sum, p) => sum + p.amount_paid, 0),
      last30DaysPaid: recentPayments.reduce((sum, p) => sum + p.amount_paid, 0),
      paymentCount: data.payments.length,
      activeVendors: data.vendors.filter(v => v.status === 'active').length,
      pendingInvoices: data.invoices.filter(i => i.status !== 'paid').length,
      totalInvoiced: data.invoices.reduce((sum, i) => sum + i.total_amount, 0),
      paidInvoices: data.invoices.filter(i => i.status === 'paid').length,
      totalExpenses: data.dailyExpenses.reduce((sum, e) => sum + e.amount_aed, 0),
      thisMonthExpenses: data.dailyExpenses.filter(e => isSameMonth(parseISO(e.date), new Date())).reduce((sum, e) => sum + e.amount_aed, 0),
      expenseCategories: new Set(data.dailyExpenses.map(e => e.category)).size
    };
  }, [vendorStats, data.payments, data.invoices, data.vendors, data.dailyExpenses]);

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-white border-zinc-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Payable</p>
              <h3 className="text-2xl font-black text-zinc-900">{formatValue(totals.payable)}</h3>
            </div>
          </div>
        </Card>
        <Card className="bg-white border-zinc-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
              <TrendingDown size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Advances</p>
              <h3 className="text-2xl font-black text-zinc-900">{formatValue(totals.advances)}</h3>
            </div>
          </div>
        </Card>
        <Card className="bg-white border-zinc-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Unbilled Work</p>
              <h3 className="text-2xl font-black text-zinc-900">{formatValue(totals.unbilled)}</h3>
            </div>
          </div>
        </Card>
        <Card className="bg-white border-zinc-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Billed Unpaid</p>
              <h3 className="text-2xl font-black text-zinc-900">{formatValue(totals.billedUnpaid)}</h3>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Recent Service Records">
          <div className="space-y-4">
            {data.serviceRecords.slice(0, 5).sort((a, b) => b.date.localeCompare(a.date)).map(record => {
              const vendor = data.vendors.find(v => v.vendor_id === record.vendor_id);
              return (
                <div key={record.record_id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-zinc-900 border border-zinc-200">
                      <Wrench size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900">{record.description}</p>
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{vendor?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono font-bold text-zinc-900">{formatValue(record.total_cost)}</p>
                    <p className="text-[9px] text-zinc-400">{format(parseISO(record.date), 'MMM dd')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Recent Payments">
          <div className="space-y-4">
            {data.payments.slice(0, 5).sort((a, b) => b.date.localeCompare(a.date)).map(payment => {
              const vendor = data.vendors.find(v => v.vendor_id === payment.vendor_id);
              return (
                <div key={payment.payment_id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-zinc-900 border border-zinc-200">
                      <CreditCard size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900">{vendor?.name}</p>
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{payment.type.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono font-bold text-emerald-600">{formatValue(payment.amount_paid)}</p>
                    <p className="text-[9px] text-zinc-400">{format(parseISO(payment.date), 'MMM dd')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-zinc-200">
        <div className="flex bg-zinc-100 border border-zinc-200 p-1 rounded-2xl">
          {[
            { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
            { id: 'vendors', label: 'Vendors', icon: Users },
            { id: 'records', label: 'Work Done', icon: Wrench },
            { id: 'invoices', label: 'Invoices', icon: FileText },
            { id: 'payments', label: 'Payments', icon: CreditCard },
            { id: 'expenses', label: 'General', icon: Package },
            { id: 'maintenance', label: 'Tickets', icon: Wrench }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                activeTab === tab.id 
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/20 dark:shadow-none scale-[1.02]" 
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800"
              )}
            >
              <tab.icon size={14} />
              <span className="hidden lg:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'vendors' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Vendors & Partners</h3>
                  <p className="text-xs text-zinc-500 font-medium">Manage your service providers and track their balances.</p>
                </div>
                <Button onClick={() => setIsAddVendorOpen(true)}>
                  <Plus size={18} />
                  Add New Vendor
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Active Vendors</p>
                  <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{totals.activeVendors}</h3>
                </Card>
                <Card className="bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Payable</p>
                  <h3 className="text-2xl font-black text-rose-600">{formatValue(totals.payable)}</h3>
                </Card>
                <Card className="bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Advances</p>
                  <h3 className="text-2xl font-black text-emerald-600">{formatValue(totals.advances)}</h3>
                </Card>
                <Card className="bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Pending Invoices</p>
                  <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{totals.pendingInvoices}</h3>
                </Card>
              </div>

              <Card title="Vendor Balances & Activity">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-100">
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Vendor</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Service</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Work Done</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Paid</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Pending</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Advance</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {vendorStats.map(v => (
                        <tr key={v.vendor_id} className="hover:bg-zinc-50 transition-colors">
                          <td className="py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500">
                                <Users size={14} />
                              </div>
                              <div>
                                <p className="font-bold text-zinc-900 text-sm">{v.name}</p>
                                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{v.status}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4">
                            <span className="px-2 py-1 bg-zinc-100 text-zinc-500 rounded text-[10px] font-black uppercase tracking-widest">
                              {v.service_type}
                            </span>
                          </td>
                          <td className="py-4 text-right font-mono text-sm text-zinc-600">{formatValue(v.totalWorkDone)}</td>
                          <td className="py-4 text-right font-mono text-sm text-zinc-600">{formatValue(v.totalPaid)}</td>
                          <td className="py-4 text-right font-mono text-sm text-rose-600 font-bold">{formatValue(v.payableBalance)}</td>
                          <td className="py-4 text-right font-mono text-sm text-emerald-600 font-bold">{formatValue(v.advanceBalance)}</td>
                          <td className="py-4 text-right">
                            <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors">
                              <Edit2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-zinc-900 uppercase tracking-widest">Vendor Profiles</h3>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Search profiles..."
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-xs font-medium"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {vendorStats.map(v => (
                    <Card key={v.vendor_id} className="hover:shadow-lg transition-shadow">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-900">
                          <Users size={20} />
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                          v.status === 'active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-zinc-50 text-zinc-400 border-zinc-100"
                        )}>
                          {v.status}
                        </span>
                      </div>
                      <h4 className="font-bold text-zinc-900">{v.name}</h4>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-4">{v.service_type}</p>
                      <div className="space-y-2 mb-6">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-400">$</span>
                          <span className="text-zinc-500">Payable:</span>
                          <span className="font-bold text-zinc-900">{formatValue(v.payableBalance)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Clock className="text-zinc-400" size={12} />
                          <span className="text-zinc-500">Unbilled:</span>
                          <span className="font-bold text-zinc-900">{formatValue(v.unbilledWork)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 text-[10px]">VIEW DETAILS</Button>
                        <button className="p-2 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-xl transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'records' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex flex-1 gap-4 w-full">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search records..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <select 
                    className="px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                  >
                    <option value="all">All Status</option>
                    <option value="unbilled">Unbilled</option>
                    <option value="billed">Billed</option>
                    <option value="paid">Paid</option>
                  </select>
                  <select 
                    className="px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                    value={vendorFilter}
                    onChange={e => setVendorFilter(e.target.value)}
                  >
                    <option value="all">All Vendors</option>
                    {data.vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
                  </select>
                </div>
                <Button onClick={() => setIsAddRecordOpen(true)}>
                  <Plus size={18} />
                  Record Work Done
                </Button>
              </div>
              <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Property</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Vendor</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Description</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Total Cost</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {filteredRecords.map(r => {
                      const vendor = data.vendors.find(v => v.vendor_id === r.vendor_id);
                      const apt = data.apartments.find(a => a.apartment_id === r.apartment_id);
                      return (
                        <tr key={r.record_id} className="hover:bg-zinc-50 transition-colors">
                          <td className="py-4 text-xs font-bold text-zinc-900">{format(parseISO(r.date), 'MMM dd, yyyy')}</td>
                          <td className="py-4 text-xs font-medium text-zinc-400">{apt?.name}</td>
                          <td className="py-4 text-xs text-zinc-900 font-bold">{vendor?.name}</td>
                          <td className="py-4 text-xs text-zinc-400">{r.description}</td>
                          <td className="py-4 text-right font-mono text-sm font-bold text-zinc-900">{formatValue(r.total_cost)}</td>
                          <td className="py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                              r.status === 'paid' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                              r.status === 'billed' ? "bg-blue-50 text-blue-600 border-blue-100" :
                              "bg-zinc-50 text-zinc-400 border-zinc-100"
                            )}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-4 text-right">
                            <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors">
                              <Edit2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
          {activeTab === 'invoices' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Invoiced</p>
                  <h3 className="text-2xl font-black text-zinc-900">{formatValue(totals.totalInvoiced)}</h3>
                </Card>
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Pending Payment</p>
                  <h3 className="text-2xl font-black text-amber-600">{formatValue(totals.billedUnpaid)}</h3>
                </Card>
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Paid Invoices</p>
                  <h3 className="text-2xl font-black text-emerald-600">{totals.paidInvoices}</h3>
                </Card>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search invoices..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button onClick={() => setIsAddInvoiceOpen(true)}>
                  <Plus size={18} />
                  Create Invoice
                </Button>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-100">
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Invoice ID</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Vendor</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Records</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Amount</th>
                        <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {filteredInvoices.map(invoice => {
                        const vendor = data.vendors.find(v => v.vendor_id === invoice.vendor_id);
                        return (
                          <tr key={invoice.invoice_id} className="hover:bg-zinc-50 transition-colors">
                            <td className="py-4 text-xs font-medium text-zinc-400">{invoice.invoice_id}</td>
                            <td className="py-4 text-xs font-bold text-zinc-900">{format(parseISO(invoice.date), 'MMM dd, yyyy')}</td>
                            <td className="py-4 text-xs font-bold text-zinc-900">{vendor?.name}</td>
                            <td className="py-4 text-xs text-zinc-400">{invoice.record_ids.length} records</td>
                            <td className="py-4 text-right font-mono text-sm font-bold text-zinc-900">{formatValue(invoice.total_amount)}</td>
                            <td className="py-4 text-right">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                invoice.status === 'paid' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                                invoice.status === 'partial' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                "bg-amber-50 text-amber-600 border-amber-100"
                              )}>
                                {invoice.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Paid Out</p>
                  <h3 className="text-2xl font-black text-zinc-900">{formatValue(totals.totalPaidOut)}</h3>
                </Card>
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Last 30 Days</p>
                  <h3 className="text-2xl font-black text-emerald-600">{formatValue(totals.last30DaysPaid)}</h3>
                </Card>
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Payment Count</p>
                  <h3 className="text-2xl font-black text-zinc-900">{totals.paymentCount}</h3>
                </Card>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search payments..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button onClick={() => setIsAddPaymentOpen(true)}>
                  <Plus size={18} />
                  Record Payment
                </Button>
              </div>

              <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Vendor</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Type</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Amount</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Notes</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {filteredPayments.length > 0 ? filteredPayments.map(p => {
                      const vendor = data.vendors.find(v => v.vendor_id === p.vendor_id);
                      return (
                        <tr key={p.payment_id} className="hover:bg-zinc-50 transition-colors">
                          <td className="py-4 text-xs font-bold text-zinc-900">{format(parseISO(p.date), 'MMM dd, yyyy')}</td>
                          <td className="py-4 text-xs font-medium text-zinc-900">{vendor?.name}</td>
                          <td className="py-4 text-[10px] text-zinc-400 uppercase font-black tracking-widest">{p.type.replace('_', ' ')}</td>
                          <td className="py-4 text-right font-mono text-sm text-emerald-600 font-bold">{formatValue(p.amount_paid)}</td>
                          <td className="py-4 text-xs text-zinc-500">{p.notes}</td>
                          <td className="py-4 text-right">
                            <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors">
                              <Edit2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-zinc-400 text-sm">No payments recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
          {activeTab === 'expenses' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Expenses</p>
                  <h3 className="text-2xl font-black text-zinc-900">{formatValue(totals.totalExpenses)}</h3>
                </Card>
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">This Month</p>
                  <h3 className="text-2xl font-black text-rose-600">{formatValue(totals.thisMonthExpenses)}</h3>
                </Card>
                <Card className="bg-white border-zinc-100 shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Categories</p>
                  <h3 className="text-2xl font-black text-zinc-900">{totals.expenseCategories}</h3>
                </Card>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search expenses..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button onClick={() => setIsAddExpenseOpen(true)}>
                  <Plus size={18} />
                  Add General Expense
                </Button>
              </div>

              <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Property</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Category</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Notes</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Amount</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {filteredExpenses.length > 0 ? filteredExpenses.map(e => {
                      const apt = data.apartments.find(a => a.apartment_id === e.apartment_id);
                      return (
                        <tr key={e.expense_id} className="hover:bg-zinc-50 transition-colors">
                          <td className="py-4 text-xs font-bold text-zinc-900">{format(parseISO(e.date), 'MMM dd, yyyy')}</td>
                          <td className="py-4 text-xs font-medium text-zinc-400">{e.apartment_id === 'PORTFOLIO' ? 'Shared' : apt?.name}</td>
                          <td className="py-4 text-[10px] text-zinc-400 uppercase font-black tracking-widest">{e.category}</td>
                          <td className="py-4 text-xs text-zinc-500">{e.notes}</td>
                          <td className="py-4 text-right font-mono text-sm text-rose-600 font-bold">{formatValue(e.amount_aed)}</td>
                          <td className="py-4 text-right">
                            <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors">
                              <Edit2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-zinc-400 text-sm">No general expenses found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
        {activeTab === 'maintenance' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-zinc-900 tracking-tight uppercase italic">Maintenance Tickets</h3>
                <p className="text-xs text-zinc-500 font-medium">Track and manage property maintenance requests.</p>
              </div>
              <Button onClick={() => setIsAddTaskOpen(true)}>
                <Plus size={18} />
                New Ticket
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="bg-white border-zinc-100 shadow-sm">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Open Tickets</p>
                <h3 className="text-2xl font-black text-zinc-900">{(data.maintenanceTasks || []).filter(t => t.status !== 'completed' && t.status !== 'cancelled').length}</h3>
              </Card>
              <Card className="bg-white border-zinc-100 shadow-sm">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">High Priority</p>
                <h3 className="text-2xl font-black text-rose-600">{(data.maintenanceTasks || []).filter(t => t.priority === 'high' || t.priority === 'urgent').length}</h3>
              </Card>
              <Card className="bg-white border-zinc-100 shadow-sm">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">In Progress</p>
                <h3 className="text-2xl font-black text-blue-600">{(data.maintenanceTasks || []).filter(t => t.status === 'in_progress').length}</h3>
              </Card>
              <Card className="bg-white border-zinc-100 shadow-sm">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Completed (MTD)</p>
                <h3 className="text-2xl font-black text-emerald-600">{(data.maintenanceTasks || []).filter(t => t.status === 'completed').length}</h3>
              </Card>
            </div>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ticket</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Property</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Priority</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Created</th>
                      <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(data.maintenanceTasks || []).map(task => {
                      const apt = data.apartments.find(a => a.apartment_id === task.apartment_id);
                      return (
                        <tr key={task.task_id} className="hover:bg-zinc-50 transition-colors">
                          <td className="py-4">
                            <p className="text-sm font-bold text-zinc-900">{task.title}</p>
                            <p className="text-[10px] text-zinc-400 line-clamp-1">{task.description}</p>
                          </td>
                          <td className="py-4 text-xs font-medium text-zinc-500">{apt?.name}</td>
                          <td className="py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                              task.priority === 'urgent' ? "bg-rose-100 text-rose-700 border-rose-200" :
                              task.priority === 'high' ? "bg-orange-50 text-orange-600 border-orange-100" :
                              "bg-zinc-50 text-zinc-400 border-zinc-100"
                            )}>
                              {task.priority}
                            </span>
                          </td>
                          <td className="py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                              task.status === 'completed' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              task.status === 'in_progress' ? "bg-blue-50 text-blue-600 border-blue-100" :
                              "bg-zinc-50 text-zinc-400 border-zinc-100"
                            )}>
                              {task.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-4 text-xs text-zinc-400">{format(parseISO(task.created_at), 'MMM dd')}</td>
                          <td className="py-4 text-right">
                            <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors">
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {(data.maintenanceTasks || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-zinc-400 italic text-sm">No maintenance tickets found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </motion.div>
      </AnimatePresence>

      {/* Add Maintenance Ticket Modal */}
      <AnimatePresence>
        {isAddTaskOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">New Maintenance Ticket</h3>
                <button onClick={() => setIsAddTaskOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Title</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    placeholder="e.g. AC Leak in Living Room"
                    value={newTask.title || ''}
                    onChange={e => setNewTask({...newTask, title: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Property</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                    value={newTask.apartment_id || ''}
                    onChange={e => setNewTask({...newTask, apartment_id: e.target.value})}
                  >
                    <option value="">Select Property</option>
                    {data.apartments.map(a => <option key={a.apartment_id} value={a.apartment_id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Priority</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                      value={newTask.priority}
                      onChange={e => setNewTask({...newTask, priority: e.target.value})}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Vendor (Optional)</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                      value={newTask.vendor_id || ''}
                      onChange={e => setNewTask({...newTask, vendor_id: e.target.value})}
                    >
                      <option value="">Unassigned</option>
                      {data.vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Description</label>
                  <textarea 
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium resize-none"
                    value={newTask.description || ''}
                    onChange={e => setNewTask({...newTask, description: e.target.value})}
                  />
                </div>
              </div>
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsAddTaskOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={() => {
                  if (!newTask.title || !newTask.apartment_id) return;
                  const task = {
                    ...newTask,
                    task_id: `TSK-${Date.now()}`
                  };
                  setData(prev => ({ ...prev, maintenanceTasks: [...(prev.maintenanceTasks || []), task] }));
                  setIsAddTaskOpen(false);
                  setNewTask({ priority: 'medium', status: 'pending', created_at: format(new Date(), 'yyyy-MM-dd') });
                }}>Create Ticket</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Vendor Modal */}
      <AnimatePresence>
        {isAddVendorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Add New Vendor</h3>
                <button onClick={() => setIsAddVendorOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 dark:bg-zinc-900">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Vendor Name</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:border-zinc-900 dark:focus:border-zinc-100 focus:ring-0 transition-all text-sm font-medium dark:text-zinc-100"
                    value={newVendor.name || ''}
                    onChange={e => setNewVendor({...newVendor, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Service Type</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Plumbing, Cleaning, AC"
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newVendor.service_type || ''}
                    onChange={e => setNewVendor({...newVendor, service_type: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Phone</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newVendor.phone || ''}
                      onChange={e => setNewVendor({...newVendor, phone: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Email</label>
                    <input 
                      type="email" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newVendor.email || ''}
                      onChange={e => setNewVendor({...newVendor, email: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsAddVendorOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddVendor} disabled={!newVendor.name || !newVendor.service_type}>Add Vendor</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Record Modal */}
      <AnimatePresence>
        {isAddRecordOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">Record Work Done</h3>
                <button onClick={() => setIsAddRecordOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Vendor</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                      value={newRecord.vendor_id || ''}
                      onChange={e => setNewRecord({...newRecord, vendor_id: e.target.value})}
                    >
                      <option value="">Select Vendor</option>
                      {data.vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Property</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                      value={newRecord.apartment_id || ''}
                      onChange={e => setNewRecord({...newRecord, apartment_id: e.target.value})}
                    >
                      <option value="">Select Property</option>
                      {data.apartments.map(a => <option key={a.apartment_id} value={a.apartment_id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Description</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newRecord.description || ''}
                    onChange={e => setNewRecord({...newRecord, description: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Quantity</label>
                    <input 
                      type="number" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newRecord.quantity || 1}
                      onChange={e => setNewRecord({...newRecord, quantity: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Unit Cost</label>
                    <input 
                      type="number" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newRecord.unit_cost || ''}
                      onChange={e => setNewRecord({...newRecord, unit_cost: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Date</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newRecord.date || ''}
                      onChange={e => setNewRecord({...newRecord, date: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsAddRecordOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddRecord} disabled={!newRecord.vendor_id || !newRecord.apartment_id || !newRecord.unit_cost}>Record Work</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Raise Invoice Modal */}
      <AnimatePresence>
        {isAddInvoiceOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">Raise Vendor Invoice</h3>
                <button onClick={() => setIsAddInvoiceOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Select Vendor</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                    value={newInvoice.vendor_id}
                    onChange={e => setNewInvoice({ vendor_id: e.target.value, record_ids: [] })}
                  >
                    <option value="">Select Vendor</option>
                    {data.vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
                  </select>
                </div>
                {newInvoice.vendor_id && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Select Unbilled Records</label>
                    <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                      {data.serviceRecords
                        .filter(r => r.vendor_id === newInvoice.vendor_id && r.status === 'unbilled')
                        .map(r => (
                          <label key={r.record_id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100 cursor-pointer hover:bg-zinc-100 transition-colors">
                            <input 
                              type="checkbox" 
                              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                              checked={newInvoice.record_ids.includes(r.record_id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setNewInvoice(prev => ({ ...prev, record_ids: [...prev.record_ids, r.record_id] }));
                                } else {
                                  setNewInvoice(prev => ({ ...prev, record_ids: prev.record_ids.filter(id => id !== r.record_id) }));
                                }
                              }}
                            />
                            <div className="flex-1">
                              <p className="text-xs font-bold text-zinc-900">{r.description}</p>
                              <p className="text-[9px] text-zinc-400">{format(parseISO(r.date), 'MMM dd, yyyy')} • {formatValue(r.total_cost)}</p>
                            </div>
                          </label>
                        ))
                      }
                      {data.serviceRecords.filter(r => r.vendor_id === newInvoice.vendor_id && r.status === 'unbilled').length === 0 && (
                        <p className="text-xs text-zinc-400 italic text-center py-4">No unbilled records for this vendor.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsAddInvoiceOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleRaiseInvoice} disabled={!newInvoice.vendor_id || newInvoice.record_ids.length === 0}>Raise Invoice</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Record Payment Modal */}
      <AnimatePresence>
        {isAddPaymentOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">Record Payment</h3>
                <button onClick={() => setIsAddPaymentOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Vendor</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                      value={newPayment.vendor_id || ''}
                      onChange={e => setNewPayment({...newPayment, vendor_id: e.target.value, invoice_id: undefined})}
                    >
                      <option value="">Select Vendor</option>
                      {data.vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Payment Type</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                      value={newPayment.type || 'invoice_payment'}
                      onChange={e => setNewPayment({...newPayment, type: e.target.value as any})}
                    >
                      <option value="invoice_payment">Invoice Payment</option>
                      <option value="advance">Advance Payment</option>
                      <option value="partial_payment">Partial Payment</option>
                    </select>
                  </div>
                </div>
                {newPayment.vendor_id && newPayment.type !== 'advance' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Select Invoice (Optional)</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                      value={newPayment.invoice_id || ''}
                      onChange={e => {
                        const inv = data.invoices.find(i => i.invoice_id === e.target.value);
                        setNewPayment({...newPayment, invoice_id: e.target.value, amount_paid: inv?.total_amount});
                      }}
                    >
                      <option value="">No Specific Invoice</option>
                      {data.invoices
                        .filter(i => i.vendor_id === newPayment.vendor_id && i.status === 'pending')
                        .map(i => <option key={i.invoice_id} value={i.invoice_id}>#{i.invoice_id} - {formatValue(i.total_amount)}</option>)
                      }
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Amount Paid</label>
                    <input 
                      type="number" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newPayment.amount_paid || ''}
                      onChange={e => setNewPayment({...newPayment, amount_paid: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Date</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newPayment.date || ''}
                      onChange={e => setNewPayment({...newPayment, date: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Notes</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newPayment.notes || ''}
                    onChange={e => setNewPayment({...newPayment, notes: e.target.value})}
                  />
                </div>
              </div>
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsAddPaymentOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddPayment} disabled={!newPayment.vendor_id || !newPayment.amount_paid}>Record Payment</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {isAddExpenseOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">Add General Expense</h3>
                <button onClick={() => setIsAddExpenseOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Category</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Marketing, Office, Staff"
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newExpense.category || ''}
                      onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Property Scoping</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium bg-white"
                      value={newExpense.apartment_id || 'PORTFOLIO'}
                      onChange={e => setNewExpense({...newExpense, apartment_id: e.target.value})}
                    >
                      <option value="PORTFOLIO">Shared / Portfolio</option>
                      {data.apartments.map(a => <option key={a.apartment_id} value={a.apartment_id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Amount (AED)</label>
                    <input 
                      type="number" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newExpense.amount_aed || ''}
                      onChange={e => setNewExpense({...newExpense, amount_aed: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Date</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newExpense.date || ''}
                      onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Notes</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newExpense.notes || ''}
                    onChange={e => setNewExpense({...newExpense, notes: e.target.value})}
                  />
                </div>
              </div>
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsAddExpenseOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddExpense} disabled={!newExpense.amount_aed || !newExpense.category}>Add Expense</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AddTaskModal 
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        onAdd={() => {
          if (!newTask.title || !newTask.apartment_id) return;
          const task = {
            ...newTask,
            task_id: `TSK-${Date.now()}`
          };
          setData(prev => ({ ...prev, maintenanceTasks: [...(prev.maintenanceTasks || []), task] }));
          setIsAddTaskOpen(false);
          setNewTask({ priority: 'medium', status: 'pending', created_at: format(new Date(), 'yyyy-MM-dd') });
        }}
        newTask={newTask}
        setNewTask={setNewTask}
        apartments={data.apartments}
        vendors={data.vendors}
      />
    </div>
  );
};
