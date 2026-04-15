/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, Plus, Edit2, Trash2, CreditCard, 
  Settings2, Globe, CheckCircle2, AlertTriangle,
  ChevronRight, Info, DollarSign, Zap, X,
  Calendar, Ruler, Home, MapPin, Receipt,
  ShieldCheck, Truck, Wrench, Package, Info as InfoIcon
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { UserData, Apartment, SetupCost, RentCheque, Platform, Asset, CommunicationTemplate } from '../types';
import { cn } from '../lib/utils';
import { format, addMonths, parseISO } from 'date-fns';

interface SetupProps {
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
}

export const Setup: React.FC<SetupProps> = ({ data, setData }) => {
  const [isAddAptOpen, setIsAddAptOpen] = useState(false);
  const [editingAptId, setEditingAptId] = useState<string | null>(null);
  const [isAddSetupCostOpen, setIsAddSetupCostOpen] = useState<{ open: boolean, apartmentId: string }>({ open: false, apartmentId: '' });
  const [editingPlatformId, setEditingPlatformId] = useState<string | null>(null);
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  
  // Form State for New Apartment
  const [newApt, setNewApt] = useState<Partial<Apartment>>({
    name: '',
    nickname: '',
    building: '',
    address: '',
    specification: 'Studio',
    measurement_sqft: 0,
    annual_rent_aed: 0,
    num_cheques: 4,
    currency: 'AED',
    start_operation_date: format(new Date(), 'yyyy-MM-dd'),
    utilities_monthly_defaults: {
      dewa_electricity_aed: 500,
      internet_aed: 350
    }
  });

  // Form State for Communication Template
  const [newTemplate, setNewTemplate] = useState<Partial<CommunicationTemplate>>({
    name: '',
    subject: '',
    content: '',
    category: 'check_in'
  });

  // Form State for Platform
  const [newPlatform, setNewPlatform] = useState<Partial<Platform>>({
    name: '',
    commission_percent: 0,
    payment_charge_percent: 0,
    vat_percent: 5,
    other_charges_percent: 0,
    payout_timing: 'after_checkout',
    payout_days_offset: 0,
    processing_days: 0,
    payout_day_of_week: 4
  });

  // Form State for Setup Cost
  const [newSetupCost, setNewSetupCost] = useState<Partial<SetupCost>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    category: 'Furnishing',
    description: '',
    amount_aed: 0,
    is_refundable: false,
    payment_method: 'Bank Transfer',
    vendor: ''
  });

  const formatValue = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'AED',
      minimumFractionDigits: 0
    }).format(val);
  };

  const generatedCheques = useMemo(() => {
    // If editing, we might want to keep existing cheques unless rent details change
    // For simplicity in this UI, we'll only auto-generate if it's a new property or if we explicitly reset
    if (!newApt.annual_rent_aed || !newApt.num_cheques || !newApt.start_operation_date) return [];
    
    // If we are editing and have existing cheques, we might want to keep them
    // But usually changing annual rent or num_cheques implies a reset
    const cheques: RentCheque[] = [];
    const amountPerCheque = Math.round(newApt.annual_rent_aed / newApt.num_cheques);
    const startDate = parseISO(newApt.start_operation_date);
    const monthsInterval = 12 / newApt.num_cheques;

    for (let i = 0; i < newApt.num_cheques; i++) {
      const dueDate = addMonths(startDate, i * monthsInterval);
      cheques.push({
        cheque_id: `CHQ-${Math.random().toString(36).substr(2, 9)}`,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        amount_aed: amountPerCheque,
        status: 'due'
      });
    }
    return cheques;
  }, [newApt.annual_rent_aed, newApt.num_cheques, newApt.start_operation_date]);

  const handleAddApartment = () => {
    if (!newApt.nickname || !newApt.name) return;

    const apartment: Apartment = {
      ...newApt as Apartment,
      apartment_id: newApt.nickname, // Nickname serves as ID
      monthly_rent_aed: Math.round((newApt.annual_rent_aed || 0) / 12),
      rent_cheques: editingAptId ? (newApt.rent_cheques || []) : generatedCheques,
      setup_costs: newApt.setup_costs || [],
      currency: 'AED',
      platform_settings: newApt.platform_settings || data.platforms.map(p => ({
        platform_id: p.platform_id,
        commission_percent: p.commission_percent,
        payment_charge_percent: p.payment_charge_percent || 0
      }))
    };

    setData(prev => {
      if (editingAptId) {
        return {
          ...prev,
          apartments: prev.apartments.map(a => a.apartment_id === editingAptId ? apartment : a)
        };
      }
      return {
        ...prev,
        apartments: [...prev.apartments, apartment]
      };
    });

    setIsAddAptOpen(false);
    setEditingAptId(null);
    setNewApt({
      name: '',
      nickname: '',
      building: '',
      address: '',
      specification: 'Studio',
      measurement_sqft: 0,
      annual_rent_aed: 0,
      num_cheques: 4,
      start_operation_date: format(new Date(), 'yyyy-MM-dd'),
      utilities_monthly_defaults: {
        dewa_electricity_aed: 500,
        internet_aed: 350
      }
    });
  };

  const handleDeleteApartment = (id: string) => {
    if (window.confirm('Are you sure you want to delete this property? This will remove all associated data.')) {
      setData(prev => ({
        ...prev,
        apartments: prev.apartments.filter(a => a.apartment_id !== id)
      }));
    }
  };

  const handleEditApartment = (apt: Apartment) => {
    setNewApt(apt);
    setEditingAptId(apt.apartment_id);
    setIsAddAptOpen(true);
  };

  const updateChequeStatus = (aptId: string, chequeId: string, status: RentCheque['status']) => {
    setData(prev => ({
      ...prev,
      apartments: prev.apartments.map(apt => {
        if (apt.apartment_id !== aptId) return apt;
        return {
          ...apt,
          rent_cheques: apt.rent_cheques.map(chq => 
            chq.cheque_id === chequeId ? { ...chq, status } : chq
          )
        };
      })
    }));
  };

  const handleAddSetupCost = () => {
    const cost: SetupCost = {
      ...newSetupCost as SetupCost,
      item_id: `COST-${Math.random().toString(36).substr(2, 9)}`
    };

    setData(prev => {
      const updatedApartments = prev.apartments.map(apt => 
        apt.apartment_id === isAddSetupCostOpen.apartmentId 
          ? { ...apt, setup_costs: [...apt.setup_costs, cost] }
          : apt
      );

      // If category is Furnishing, also add to Assets
      let updatedAssets = prev.assets || [];
      if (cost.category === 'Furnishing') {
        const newAsset: Asset = {
          asset_id: `ASSET-AUTO-${Date.now()}`,
          apartment_id: isAddSetupCostOpen.apartmentId,
          name: cost.description || 'New Furniture',
          category: 'furniture',
          purchase_date: cost.date,
          condition: 'new',
          cost_aed: cost.amount_aed,
          notes: `Automatically added from Property Setup: ${cost.vendor || 'Unknown Vendor'}`
        };
        updatedAssets = [...updatedAssets, newAsset];
      }

      return {
        ...prev,
        apartments: updatedApartments,
        assets: updatedAssets
      };
    });

    setIsAddSetupCostOpen({ open: false, apartmentId: '' });
    setNewSetupCost({
      date: format(new Date(), 'yyyy-MM-dd'),
      category: 'Furnishing',
      description: '',
      amount_aed: 0,
      is_refundable: false,
      payment_method: 'Bank Transfer',
      vendor: ''
    });
  };

  const handleAddPlatform = () => {
    if (!newPlatform.name) return;

    const platform: Platform = {
      ...newPlatform as Platform,
      platform_id: editingPlatformId || `PLT-${Math.random().toString(36).substr(2, 9)}`
    };

    setData(prev => {
      if (editingPlatformId) {
        return {
          ...prev,
          platforms: prev.platforms.map(p => p.platform_id === editingPlatformId ? platform : p)
        };
      }
      return {
        ...prev,
        platforms: [...prev.platforms, platform]
      };
    });

    setIsPlatformModalOpen(false);
    setEditingPlatformId(null);
    setNewPlatform({
      name: '',
      commission_percent: 0,
      payment_charge_percent: 0,
      vat_percent: 5,
      other_charges_percent: 0,
      payout_timing: 'after_checkout',
      payout_days_offset: 0,
      processing_days: 0,
      payout_day_of_week: 4
    });
  };

  const handleEditPlatform = (platform: Platform) => {
    setNewPlatform(platform);
    setEditingPlatformId(platform.platform_id);
    setIsPlatformModalOpen(true);
  };

  const handleDeletePlatform = (id: string) => {
    if (window.confirm('Are you sure you want to delete this platform?')) {
      setData(prev => ({
        ...prev,
        platforms: prev.platforms.filter(p => p.platform_id !== id)
      }));
    }
  };

  const handleAddTemplate = () => {
    if (!newTemplate.name || !newTemplate.content) return;

    const template: CommunicationTemplate = {
      ...newTemplate as CommunicationTemplate,
      template_id: editingTemplateId || `TMPL-${Math.random().toString(36).substr(2, 9)}`
    };

    setData(prev => {
      const templates = prev.communicationTemplates || [];
      if (editingTemplateId) {
        return {
          ...prev,
          communicationTemplates: templates.map(t => t.template_id === editingTemplateId ? template : t)
        };
      }
      return {
        ...prev,
        communicationTemplates: [...templates, template]
      };
    });

    setIsTemplateModalOpen(false);
    setEditingTemplateId(null);
    setNewTemplate({
      name: '',
      subject: '',
      content: '',
      category: 'check_in'
    });
  };

  const handleDeleteTemplate = (id: string) => {
    if (window.confirm('Are you sure you want to delete this template?')) {
      setData(prev => ({
        ...prev,
        communicationTemplates: (prev.communicationTemplates || []).filter(t => t.template_id !== id)
      }));
    }
  };

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Portfolio and Platform Setup</h3>
            <p className="text-sm text-zinc-500 font-medium">Configure your properties, manage rental payments, and set platform-specific commission structures.</p>
          </div>
          <Button onClick={() => {
            setEditingAptId(null);
            setNewApt({
              name: '',
              nickname: '',
              building: '',
              address: '',
              specification: 'Studio',
              measurement_sqft: 0,
              annual_rent_aed: 0,
              num_cheques: 4,
              start_operation_date: format(new Date(), 'yyyy-MM-dd'),
              utilities_monthly_defaults: {
                dewa_electricity_aed: 500,
                internet_aed: 350
              }
            });
            setIsAddAptOpen(true);
          }}>
            <Plus size={18} />
            Add Property
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {data.apartments.map((apt) => (
            <Card 
              key={apt.apartment_id}
              title={
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white">
                    <Home size={20} />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-zinc-900 leading-tight">{apt.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded uppercase tracking-wider">
                        ID: {apt.nickname}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wider">
                        {apt.specification}
                      </span>
                    </div>
                  </div>
                </div>
              }
              action={
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleEditApartment(apt)}
                    className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteApartment(apt.apartment_id)}
                    className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Property Info */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Property Details</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm">
                        <MapPin size={14} className="text-zinc-400" />
                        <span className="text-zinc-600 font-medium">{apt.building}, {apt.address}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Ruler size={14} className="text-zinc-400" />
                        <span className="text-zinc-600 font-medium">{apt.measurement_sqft} Sq. Ft.</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Calendar size={14} className="text-zinc-400" />
                        <span className="text-zinc-600 font-medium">Started: {format(parseISO(apt.start_operation_date), 'MMM dd, yyyy')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Rental Structure</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Annual Rent</p>
                        <p className="text-sm font-black text-zinc-900">{formatValue(apt.annual_rent_aed)}</p>
                      </div>
                      <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Cheques</p>
                        <p className="text-sm font-black text-zinc-900">{apt.num_cheques} Payments</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cheques Timeline */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Payment Schedule</h4>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase">Next 2 Due</span>
                  </div>
                  <div className="space-y-3">
                    {apt.rent_cheques.map((chq, i) => (
                      <div key={chq.cheque_id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-zinc-100 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center text-zinc-400">
                            <span className="text-[10px] font-black">{i + 1}</span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-zinc-900">{format(parseISO(chq.due_date), 'MMM dd, yyyy')}</p>
                            <p className="text-[10px] text-zinc-400 font-medium">{formatValue(chq.amount_aed)}</p>
                          </div>
                        </div>
                        <select 
                          value={chq.status}
                          onChange={(e) => updateChequeStatus(apt.apartment_id, chq.cheque_id, e.target.value as any)}
                          className={cn(
                            "px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border appearance-none cursor-pointer focus:outline-none",
                            chq.status === 'paid' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                            chq.status === 'due' ? "bg-amber-50 text-amber-600 border-amber-100" :
                            chq.status === 'postponed' ? "bg-blue-50 text-blue-600 border-blue-100" :
                            "bg-rose-50 text-rose-600 border-rose-100"
                          )}
                        >
                          <option value="due">Due</option>
                          <option value="paid">Paid</option>
                          <option value="postponed">Postponed</option>
                          <option value="bounced">Bounced</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Setup Costs */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Setup & Ongoing Costs</h4>
                    <button 
                      onClick={() => setIsAddSetupCostOpen({ open: true, apartmentId: apt.apartment_id })}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-widest flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Cost
                    </button>
                  </div>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {apt.setup_costs.length > 0 ? (
                      apt.setup_costs.sort((a, b) => b.date.localeCompare(a.date)).map((cost) => (
                        <div key={cost.item_id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 group relative">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{cost.category}</span>
                              {cost.is_refundable && (
                                <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase">Refundable</span>
                              )}
                            </div>
                            <span className="text-xs font-black text-zinc-900">{formatValue(cost.amount_aed)}</span>
                          </div>
                          <p className="text-[11px] text-zinc-600 font-medium leading-tight">{cost.description}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-[9px] text-zinc-400 font-bold">{format(parseISO(cost.date), 'MMM dd, yyyy')}</span>
                            <span className="text-[9px] text-zinc-400 italic">{cost.vendor}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center border-2 border-dashed border-zinc-100 rounded-2xl">
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">No costs recorded</p>
                      </div>
                    )}
                  </div>
                  {apt.setup_costs.length > 0 && (
                    <div className="pt-3 border-t border-zinc-100 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Setup Investment</span>
                      <span className="text-sm font-black text-zinc-900">
                        {formatValue(apt.setup_costs.reduce((sum, c) => sum + c.amount_aed, 0))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Add Apartment Modal */}
      <AnimatePresence>
        {isAddAptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <div>
                  <h3 className="text-2xl font-black text-zinc-900 tracking-tight">{editingAptId ? 'Edit Property' : 'Add New Property'}</h3>
                  <p className="text-sm text-zinc-500 font-medium">Configure property details, rental structure, and platform settings</p>
                </div>
                <button onClick={() => setIsAddAptOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-grow custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Basic Info */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 text-zinc-900 mb-2">
                      <InfoIcon size={18} className="text-emerald-500" />
                      <h4 className="text-xs font-black uppercase tracking-widest">Basic Information</h4>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Apartment Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Marina Gate 1 - 2204"
                          className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                          value={newApt.name}
                          onChange={e => setNewApt({...newApt, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Property Nickname (ID)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. MG1-2204"
                          className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                          value={newApt.nickname}
                          onChange={e => setNewApt({...newApt, nickname: e.target.value.toUpperCase().replace(/\s/g, '-')})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Building Name</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Marina Gate"
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                            value={newApt.building}
                            onChange={e => setNewApt({...newApt, building: e.target.value})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Specification</label>
                          <select 
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                            value={newApt.specification}
                            onChange={e => setNewApt({...newApt, specification: e.target.value as any})}
                          >
                            <option>Studio</option>
                            <option>1BR</option>
                            <option>2BR</option>
                            <option>3BR</option>
                            <option>4BR</option>
                            <option>Penthouse</option>
                            <option>Villa</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Address</label>
                        <textarea 
                          placeholder="Full property address..."
                          className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium h-20 resize-none"
                          value={newApt.address}
                          onChange={e => setNewApt({...newApt, address: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Measurement (Sq. Ft.)</label>
                          <input 
                            type="number" 
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                            value={newApt.measurement_sqft}
                            onChange={e => setNewApt({...newApt, measurement_sqft: Number(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Currency</label>
                          <select 
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                            value={newApt.currency}
                            onChange={e => setNewApt({...newApt, currency: e.target.value})}
                          >
                            <option value="AED">AED - UAE Dirham</option>
                            <option value="USD">USD - US Dollar</option>
                            <option value="EUR">EUR - Euro</option>
                            <option value="GBP">GBP - British Pound</option>
                            <option value="SAR">SAR - Saudi Riyal</option>
                            <option value="QAR">QAR - Qatari Riyal</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Start Date</label>
                          <input 
                            type="date" 
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                            value={newApt.start_operation_date}
                            onChange={e => setNewApt({...newApt, start_operation_date: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rental Details */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 text-zinc-900 mb-2">
                      <Receipt size={18} className="text-amber-500" />
                      <h4 className="text-xs font-black uppercase tracking-widest">Rental & Payment Structure</h4>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Annual Rent (AED)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">AED</span>
                          <input 
                            type="number" 
                            placeholder="0"
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-black"
                            value={newApt.annual_rent_aed}
                            onChange={e => setNewApt({...newApt, annual_rent_aed: Number(e.target.value)})}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Number of Cheques</label>
                        <input 
                          type="range" 
                          min="1" 
                          max="12" 
                          step="1"
                          className="w-full h-2 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                          value={newApt.num_cheques}
                          onChange={e => setNewApt({...newApt, num_cheques: Number(e.target.value)})}
                        />
                        <div className="flex justify-between text-[10px] font-black text-zinc-400 uppercase mt-1">
                          <span>1 Cheque</span>
                          <span className="text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded">{newApt.num_cheques} Cheques</span>
                          <span>12 Cheques</span>
                        </div>
                      </div>

                      {/* Generated Cheques Preview */}
                      <div className="space-y-3 pt-4">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Payment Schedule Preview</label>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                          {(editingAptId ? (newApt.rent_cheques || []) : generatedCheques).map((chq, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-zinc-400">#{i + 1}</span>
                                <span className="text-xs font-bold text-zinc-900">{format(parseISO(chq.due_date), 'MMM dd, yyyy')}</span>
                              </div>
                              <span className="text-xs font-black text-zinc-900">{formatValue(chq.amount_aed)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Platform Settings Section */}
                <div className="mt-10 pt-10 border-t border-zinc-100">
                  <div className="flex items-center gap-2 text-zinc-900 mb-6">
                    <Globe size={18} className="text-blue-500" />
                    <h4 className="text-xs font-black uppercase tracking-widest">Property-Specific Platform Settings</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {data.platforms.map((platform) => {
                      const currentSetting = (newApt.platform_settings || []).find(s => s.platform_id === platform.platform_id) || {
                        platform_id: platform.platform_id,
                        commission_percent: platform.commission_percent,
                        payment_charge_percent: platform.payment_charge_percent || 0
                      };

                      return (
                        <div key={platform.platform_id} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-black text-zinc-900">{platform.name}</p>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Override</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-zinc-400 uppercase">Comm. %</label>
                              <input 
                                type="number" 
                                className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold"
                                value={currentSetting.commission_percent}
                                onChange={e => {
                                  const settings = [...(newApt.platform_settings || [])];
                                  const idx = settings.findIndex(s => s.platform_id === platform.platform_id);
                                  const newSetting = { ...currentSetting, commission_percent: Number(e.target.value) };
                                  if (idx >= 0) settings[idx] = newSetting;
                                  else settings.push(newSetting);
                                  setNewApt({ ...newApt, platform_settings: settings });
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-zinc-400 uppercase">Charge %</label>
                              <input 
                                type="number" 
                                className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold"
                                value={currentSetting.payment_charge_percent}
                                onChange={e => {
                                  const settings = [...(newApt.platform_settings || [])];
                                  const idx = settings.findIndex(s => s.platform_id === platform.platform_id);
                                  const newSetting = { ...currentSetting, payment_charge_percent: Number(e.target.value) };
                                  if (idx >= 0) settings[idx] = newSetting;
                                  else settings.push(newSetting);
                                  setNewApt({ ...newApt, platform_settings: settings });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-4">
                <Button variant="outline" onClick={() => setIsAddAptOpen(false)}>Cancel</Button>
                <Button onClick={handleAddApartment} disabled={!newApt.name || !newApt.nickname}>
                  {editingAptId ? 'Save Changes' : 'Create Property'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Setup Cost Modal */}
      <AnimatePresence>
        {isAddSetupCostOpen.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">Add Setup Cost</h3>
                <button onClick={() => setIsAddSetupCostOpen({ open: false, apartmentId: '' })} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Category</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                    value={newSetupCost.category}
                    onChange={e => setNewSetupCost({...newSetupCost, category: e.target.value as any})}
                  >
                    <option>Furnishing</option>
                    <option>Licensing</option>
                    <option>Ejari</option>
                    <option>Repairs</option>
                    <option>Transport</option>
                    <option>AC</option>
                    <option>Insurance</option>
                    <option>Miscellaneous</option>
                    <option>Deposit</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Description</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Living room sofa set"
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newSetupCost.description}
                    onChange={e => setNewSetupCost({...newSetupCost, description: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Amount (AED)</label>
                    <input 
                      type="number" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-black"
                      value={newSetupCost.amount_aed}
                      onChange={e => setNewSetupCost({...newSetupCost, amount_aed: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Date</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newSetupCost.date}
                      onChange={e => setNewSetupCost({...newSetupCost, date: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <input 
                    type="checkbox" 
                    id="is_refundable"
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    checked={newSetupCost.is_refundable}
                    onChange={e => setNewSetupCost({...newSetupCost, is_refundable: e.target.checked})}
                  />
                  <label htmlFor="is_refundable" className="text-xs font-bold text-zinc-700 cursor-pointer">This is a refundable deposit</label>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Vendor / Provider</label>
                  <input 
                    type="text" 
                    placeholder="e.g. IKEA"
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newSetupCost.vendor}
                    onChange={e => setNewSetupCost({...newSetupCost, vendor: e.target.value})}
                  />
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsAddSetupCostOpen({ open: false, apartmentId: '' })}>Cancel</Button>
                <Button size="sm" onClick={handleAddSetupCost}>Add Cost</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Platform Modal */}
      <AnimatePresence>
        {isPlatformModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">{editingPlatformId ? 'Edit Platform' : 'Add Platform'}</h3>
                <button onClick={() => setIsPlatformModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Platform Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Airbnb, Stripe, etc."
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newPlatform.name}
                    onChange={e => setNewPlatform({...newPlatform, name: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Commission %</label>
                    <input 
                      type="number" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-black"
                      value={newPlatform.commission_percent}
                      onChange={e => setNewPlatform({...newPlatform, commission_percent: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Payment Charge %</label>
                    <input 
                      type="number" 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-black"
                      value={newPlatform.payment_charge_percent}
                      onChange={e => setNewPlatform({...newPlatform, payment_charge_percent: Number(e.target.value)})}
                    />
                  </div>
                </div>
                
                <div className="pt-4 border-t border-zinc-100">
                  <h4 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest mb-4">Payout Timeline Rules</h4>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Payout Timing</label>
                      <select 
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                        value={newPlatform.payout_timing}
                        onChange={e => setNewPlatform({...newPlatform, payout_timing: e.target.value as any})}
                      >
                        <option value="before_checkin">Before Check-in</option>
                        <option value="after_checkin">After Check-in</option>
                        <option value="after_checkout">After Check-out</option>
                        <option value="next_specific_day">Next Specific Day of Week</option>
                      </select>
                    </div>

                    {newPlatform.payout_timing === 'next_specific_day' && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Specific Day</label>
                        <select 
                          className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                          value={newPlatform.payout_day_of_week}
                          onChange={e => setNewPlatform({...newPlatform, payout_day_of_week: Number(e.target.value)})}
                        >
                          <option value={0}>Sunday</option>
                          <option value={1}>Monday</option>
                          <option value={2}>Tuesday</option>
                          <option value={3}>Wednesday</option>
                          <option value={4}>Thursday</option>
                          <option value={5}>Friday</option>
                          <option value={6}>Saturday</option>
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Days Offset</label>
                        <input 
                          type="number" 
                          className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-black"
                          value={newPlatform.payout_days_offset}
                          onChange={e => setNewPlatform({...newPlatform, payout_days_offset: Number(e.target.value)})}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Processing Days</label>
                        <input 
                          type="number" 
                          className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-black"
                          value={newPlatform.processing_days}
                          onChange={e => setNewPlatform({...newPlatform, processing_days: Number(e.target.value)})}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsPlatformModalOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddPlatform}>{editingPlatformId ? 'Save Changes' : 'Add Platform'}</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <section className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Platform Settings</h3>
            <p className="text-xs text-zinc-500">Configure commissions and payout timelines for your channels</p>
          </div>
          <Button variant="outline" onClick={() => {
            setEditingPlatformId(null);
            setNewPlatform({
              name: '',
              commission_percent: 0,
              payment_charge_percent: 0,
              vat_percent: 5,
              other_charges_percent: 0,
              payout_timing: 'after_checkout',
              payout_days_offset: 0,
              processing_days: 0,
              payout_day_of_week: 4
            });
            setIsPlatformModalOpen(true);
          }}>
            <Plus size={18} />
            Add Platform
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.platforms.map((platform) => (
            <Card 
              key={platform.platform_id} 
              title={platform.name}
              action={
                <div className="flex gap-1">
                  <button onClick={() => handleEditPlatform(platform)} className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDeletePlatform(platform.platform_id)} className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Commission</p>
                    <p className="text-sm font-bold">{platform.commission_percent}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Payment Charge</p>
                    <p className="text-sm font-bold">{platform.payment_charge_percent || 0}%</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Payout Timeline</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-zinc-400" />
                      <p className="text-[10px] text-zinc-600 font-medium">
                        {platform.payout_timing === 'next_specific_day' 
                          ? `Next ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][platform.payout_day_of_week ?? 4]} after checkout`
                          : `${platform.payout_timing.replace('_', ' ')} (+${platform.payout_days_offset} days)`}
                      </p>
                    </div>
                    {platform.processing_days > 0 && (
                      <div className="flex items-center gap-2">
                        <Zap size={12} className="text-zinc-400" />
                        <p className="text-[10px] text-zinc-500 italic">
                          +{platform.processing_days} days bank processing
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Communication Templates</h3>
            <p className="text-xs text-zinc-500">Pre-defined messages for guest communication</p>
          </div>
          <Button variant="outline" onClick={() => {
            setEditingTemplateId(null);
            setNewTemplate({
              name: '',
              subject: '',
              content: '',
              category: 'check_in'
            });
            setIsTemplateModalOpen(true);
          }}>
            <Plus size={18} />
            Add Template
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(data.communicationTemplates || []).map((template) => (
            <Card 
              key={template.template_id} 
              title={template.name}
              action={
                <div className="flex gap-1">
                  <button 
                    onClick={() => {
                      setNewTemplate(template);
                      setEditingTemplateId(template.template_id);
                      setIsTemplateModalOpen(true);
                    }} 
                    className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDeleteTemplate(template.template_id)} className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              }
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full text-[9px] font-black uppercase tracking-widest">
                    {template.category.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs font-bold text-zinc-900 line-clamp-1">{template.subject}</p>
                <p className="text-[10px] text-zinc-500 line-clamp-3 leading-relaxed">{template.content}</p>
              </div>
            </Card>
          ))}
          {(data.communicationTemplates || []).length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-zinc-100 rounded-[2rem] bg-zinc-50/30">
              <p className="text-zinc-400 font-bold">No templates defined.</p>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">Create your first guest message template.</p>
            </div>
          )}
        </div>
      </section>

      {/* Template Modal */}
      <AnimatePresence>
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-lg font-black text-zinc-900 tracking-tight">{editingTemplateId ? 'Edit Template' : 'Add Template'}</h3>
                <button onClick={() => setIsTemplateModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Template Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Check-in Instructions"
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                      value={newTemplate.name}
                      onChange={e => setNewTemplate({...newTemplate, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Category</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium appearance-none"
                      value={newTemplate.category}
                      onChange={e => setNewTemplate({...newTemplate, category: e.target.value as any})}
                    >
                      <option value="check_in">Check-in</option>
                      <option value="check_out">Check-out</option>
                      <option value="house_rules">House Rules</option>
                      <option value="wifi">WiFi Info</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Subject Line</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Welcome to your stay!"
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium"
                    value={newTemplate.subject}
                    onChange={e => setNewTemplate({...newTemplate, subject: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Message Content</label>
                  <textarea 
                    placeholder="Write your message here..."
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-0 transition-all text-sm font-medium h-40 resize-none"
                    value={newTemplate.content}
                    onChange={e => setNewTemplate({...newTemplate, content: e.target.value})}
                  />
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsTemplateModalOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddTemplate}>{editingTemplateId ? 'Save Changes' : 'Add Template'}</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
