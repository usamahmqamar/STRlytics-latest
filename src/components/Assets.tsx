/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, Plus, Search, Filter, Trash2, 
  Edit2, Calendar, Building2, Info, AlertCircle,
  ShieldCheck, Wrench, Monitor, Tag, TrendingDown,
  PieChart, DollarSign, Clock
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { UserData, Asset } from '../types';
import { format, parseISO, isBefore, addDays, differenceInMonths } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';

interface AssetsProps {
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
}

export const Assets: React.FC<AssetsProps> = ({ data, setData }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'evaluation'>('grid');
  const [newAsset, setNewAsset] = useState<Partial<Asset>>({
    category: 'furniture',
    condition: 'new',
    purchase_date: format(new Date(), 'yyyy-MM-dd'),
    cost_aed: 0
  });

  const assets = useMemo(() => data.assets || [], [data.assets]);

  const handleAddAsset = () => {
    if (!newAsset.name || !newAsset.apartment_id || !newAsset.cost_aed) return;

    const asset: Asset = {
      asset_id: `ASSET-${Date.now()}`,
      name: newAsset.name,
      category: newAsset.category as any,
      condition: newAsset.condition as any,
      apartment_id: newAsset.apartment_id,
      purchase_date: newAsset.purchase_date || format(new Date(), 'yyyy-MM-dd'),
      warranty_expiry: newAsset.warranty_expiry,
      cost_aed: Number(newAsset.cost_aed),
      next_service_due: newAsset.next_service_due
    };

    setData(prev => ({
      ...prev,
      assets: [...(prev.assets || []), asset]
    }));

    setIsAddModalOpen(false);
    setNewAsset({
      category: 'furniture',
      condition: 'new',
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      cost_aed: 0
    });
  };

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || asset.category === categoryFilter;
      const matchesProperty = propertyFilter === 'all' || asset.apartment_id === propertyFilter;
      return matchesSearch && matchesCategory && matchesProperty;
    });
  }, [assets, searchQuery, categoryFilter, propertyFilter]);

  const stats = useMemo(() => {
    const totalValue = assets.reduce((sum, a) => sum + a.cost_aed, 0);
    const expiringSoon = assets.filter(a => a.warranty_expiry && isBefore(parseISO(a.warranty_expiry), addDays(new Date(), 90))).length;
    
    const categoryBreakdown = assets.reduce((acc: any, a) => {
      acc[a.category] = (acc[a.category] || 0) + a.cost_aed;
      return acc;
    }, {});

    // Simple Depreciation Logic: 5 years (60 months) useful life
    const totalCurrentValue = assets.reduce((sum, a) => {
      const monthsOld = Math.max(0, differenceInMonths(new Date(), parseISO(a.purchase_date)));
      const depreciationPerMonth = a.cost_aed / 60;
      const currentValue = Math.max(0, a.cost_aed - (depreciationPerMonth * monthsOld));
      return sum + currentValue;
    }, 0);

    return { totalValue, expiringSoon, categoryBreakdown, totalCurrentValue };
  }, [assets]);

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'new': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'good': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'fair': return 'text-orange-600 bg-orange-50 border-orange-100';
      case 'poor': return 'text-rose-600 bg-rose-50 border-rose-100';
      default: return 'text-zinc-600 bg-zinc-50 border-zinc-100';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'electronics': return <Monitor size={16} />;
      case 'furniture': return <Package size={16} />;
      case 'appliance': return <Wrench size={16} />;
      default: return <Tag size={16} />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Inventory & Asset Tracker</h2>
          <p className="text-zinc-500 text-sm font-medium">Track property assets, warranties, and maintenance schedules.</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Plus size={18} />
          Add New Asset
        </Button>
      </div>

      {/* Cost Evaluation Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6 bg-zinc-900 text-white border-none">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/10 rounded-xl">
              <DollarSign size={20} className="text-emerald-400" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Acquisition Cost</p>
          </div>
          <p className="text-xl font-black tracking-tight">{formatCurrency(stats.totalValue)}</p>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-white/40">
            <Package size={12} />
            {assets.length} Total Assets
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 rounded-xl">
              <TrendingDown size={20} className="text-amber-600" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Estimated Current Value</p>
          </div>
          <p className="text-xl font-black tracking-tight text-zinc-900">{formatCurrency(stats.totalCurrentValue)}</p>
          <p className="mt-2 text-[10px] font-bold text-amber-600 uppercase tracking-widest">
            {Math.round((stats.totalCurrentValue / stats.totalValue) * 100)}% of original value
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-xl">
              <ShieldCheck size={20} className="text-blue-600" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Active Warranties</p>
          </div>
          <p className="text-xl font-black tracking-tight text-zinc-900">
            {assets.filter(a => a.warranty_expiry && !isBefore(parseISO(a.warranty_expiry), new Date())).length}
          </p>
          {stats.expiringSoon > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-rose-500 uppercase tracking-widest">
              <AlertCircle size={12} />
              {stats.expiringSoon} Expiring Soon
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 rounded-xl">
              <PieChart size={20} className="text-emerald-600" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Top Category</p>
          </div>
          <p className="text-xl font-black tracking-tight text-zinc-900 uppercase">
            {Object.entries(stats.categoryBreakdown).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'N/A'}
          </p>
          <p className="mt-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            {formatCurrency(Object.values(stats.categoryBreakdown).sort((a: any, b: any) => b - a)[0] as number || 0)} Value
          </p>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search assets..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select 
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 focus:outline-none"
        >
          <option value="all">All Categories</option>
          <option value="furniture">Furniture</option>
          <option value="appliance">Appliances</option>
          <option value="electronics">Electronics</option>
          <option value="linen">Linen</option>
        </select>
        <select 
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 focus:outline-none"
        >
          <option value="all">All Properties</option>
          {data.apartments.map(apt => (
            <option key={apt.apartment_id} value={apt.apartment_id}>{apt.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAssets.map((asset) => {
          const apt = data.apartments.find(a => a.apartment_id === asset.apartment_id);
          const isWarrantyExpiring = asset.warranty_expiry && isBefore(parseISO(asset.warranty_expiry), addDays(new Date(), 90));
          
          return (
            <Card key={asset.asset_id} className="group hover:border-emerald-500/30 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-100 rounded-xl text-emerald-600 group-hover:bg-emerald-50 transition-colors">
                    {getCategoryIcon(asset.category)}
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors">{asset.name}</h3>
                    <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">{apt?.name}</p>
                  </div>
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                  getConditionColor(asset.condition)
                )}>
                  {asset.condition}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Purchase Date</span>
                  <span className="font-bold text-zinc-900">{format(parseISO(asset.purchase_date), 'MMM d, yyyy')}</span>
                </div>
                {asset.warranty_expiry && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400 font-medium">Warranty Expiry</span>
                    <span className={cn("font-bold", isWarrantyExpiring ? "text-rose-500" : "text-zinc-900")}>
                      {format(parseISO(asset.warranty_expiry), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Asset Value</span>
                  <div className="text-right">
                    <span className="font-black text-zinc-900 block">{formatCurrency(asset.cost_aed)}</span>
                    <span className="text-[9px] text-zinc-400 font-bold uppercase">Original Cost</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-2 border-t border-zinc-50">
                  <span className="text-zinc-400 font-medium">Current Value</span>
                  <div className="text-right">
                    <span className="font-black text-emerald-600 block">
                      {formatCurrency(Math.max(0, asset.cost_aed - (asset.cost_aed / 60 * Math.max(0, differenceInMonths(new Date(), parseISO(asset.purchase_date))))))}
                    </span>
                    <span className="text-[9px] text-zinc-400 font-bold uppercase">Est. Depreciated</span>
                  </div>
                </div>
                
                {asset.next_service_due && (
                  <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-xl mt-2 border border-emerald-100">
                    <Calendar className="w-3 h-3 text-emerald-600" />
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                      Next Service: {format(parseISO(asset.next_service_due), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors">
                  <Edit2 size={14} />
                </button>
                <button className="p-2 hover:bg-rose-50 rounded-lg text-zinc-400 hover:text-rose-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          );
        })}
        {filteredAssets.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-100 rounded-[2.5rem] bg-zinc-50/30">
            <Package size={40} className="mx-auto text-zinc-200 mb-4" />
            <p className="text-zinc-400 font-bold">No assets found.</p>
            <p className="text-xs text-zinc-400 mt-1">Add your first property asset to start tracking.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-xl font-black text-zinc-900 tracking-tight">Add New Asset</h3>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors"
                >
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Asset Name</label>
                  <input 
                    type="text"
                    placeholder="e.g. Samsung 55' Smart TV"
                    className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm focus:ring-2 ring-emerald-500/20 outline-none transition-all"
                    value={newAsset.name || ""}
                    onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Category</label>
                    <select 
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm outline-none"
                      value={newAsset.category}
                      onChange={(e) => setNewAsset({...newAsset, category: e.target.value as any})}
                    >
                      <option value="furniture">Furniture</option>
                      <option value="appliance">Appliances</option>
                      <option value="electronics">Electronics</option>
                      <option value="linen">Linen</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Condition</label>
                    <select 
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm outline-none"
                      value={newAsset.condition}
                      onChange={(e) => setNewAsset({...newAsset, condition: e.target.value as any})}
                    >
                      <option value="new">New</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Property</label>
                    <select 
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm outline-none"
                      value={newAsset.apartment_id}
                      onChange={(e) => setNewAsset({...newAsset, apartment_id: e.target.value})}
                    >
                      <option value="">Select Property</option>
                      {data.apartments.map(apt => (
                        <option key={apt.apartment_id} value={apt.apartment_id}>{apt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Purchase Price (AED)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                      <input 
                        type="number"
                        className="w-full p-4 pl-10 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm outline-none"
                        placeholder="0.00"
                        value={newAsset.cost_aed || ""}
                        onChange={(e) => setNewAsset({...newAsset, cost_aed: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Purchase Date</label>
                    <input 
                      type="date"
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm outline-none"
                      value={newAsset.purchase_date}
                      onChange={(e) => setNewAsset({...newAsset, purchase_date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Warranty Expiry</label>
                    <input 
                      type="date"
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm outline-none"
                      value={newAsset.warranty_expiry || ""}
                      onChange={(e) => setNewAsset({...newAsset, warranty_expiry: e.target.value})}
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button 
                    variant="outline" 
                    className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-xs"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs"
                    onClick={handleAddAsset}
                    disabled={!newAsset.name || !newAsset.apartment_id || !newAsset.cost_aed}
                  >
                    Save Asset
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
