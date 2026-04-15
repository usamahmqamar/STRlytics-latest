/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, History, Monitor, 
  CreditCard, CheckCircle2,
  Building2, Mail, Phone, Globe, MapPin,
  Zap, Download, FileText, Share2,
  X, Edit2
} from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { UserData } from '../types';
import { format, parseISO } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';

interface SettingsProps {
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
}

export const Settings: React.FC<SettingsProps> = ({ data, setData }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'payments' | 'display'>('profile');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<any>(data.companyProfile || {});

  const handleSaveProfile = () => {
    setData(prev => ({ ...prev, companyProfile: { ...prev.companyProfile, ...profileForm } }));
    setIsEditingProfile(false);
  };

  const handleUpdateDisplay = (updates: Partial<NonNullable<UserData['displaySettings']>>) => {
    setData(prev => ({
      ...prev,
      displaySettings: {
        fontSize: prev.displaySettings?.fontSize || 'md',
        theme: prev.displaySettings?.theme || 'light',
        ...updates
      }
    }));
  };

  const handleGeneratePDF = () => {
    // Mock PDF generation
    alert("Generating Company Profile PDF... (This is a mock action)");
  };

  const handleSharePortfolio = () => {
    // Mock Share action
    alert("Portfolio link copied to clipboard! (This is a mock action)");
  };

  const tabs = [
    { id: 'profile', label: 'Company Profile', icon: Building2 },
    { id: 'subscription', label: 'Subscription', icon: ShieldCheck },
    { id: 'payments', label: 'Payment History', icon: History },
    { id: 'display', label: 'Display Settings', icon: Monitor }
  ];

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full w-fit shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300",
              activeTab === tab.id 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <Card title="COMPANY INFORMATION">
                  <div className="mt-8 space-y-12">
                    <div className="flex items-center gap-8">
                      <div className="w-32 h-32 bg-zinc-100 dark:bg-zinc-800 rounded-[2.5rem] overflow-hidden border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 shadow-inner">
                        {data.companyProfile?.logo_url ? (
                          <img 
                            src={data.companyProfile.logo_url} 
                            alt="Logo" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Building2 size={40} className="text-zinc-300 dark:text-zinc-600" />
                        )}
                      </div>
                      <div className="flex-1 space-y-4">
                        <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-lg">
                          {data.companyProfile?.description || "Premium short-term rental management in Dubai's most iconic locations."}
                        </p>
                        <div className="flex justify-end">
                          <button 
                            onClick={() => setIsEditingProfile(true)}
                            className="w-12 h-12 bg-white border border-zinc-200 rounded-2xl flex items-center justify-center text-zinc-400 hover:text-emerald-600 hover:border-emerald-600 transition-all shadow-sm"
                          >
                            <Edit2 size={20} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-emerald-600 border border-zinc-100 shadow-sm">
                          <Mail size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-0.5">Email</p>
                          <p className="text-sm font-bold text-zinc-900">{data.companyProfile?.email || "contact@strcopilot.com"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-emerald-600 border border-zinc-100 shadow-sm">
                          <MapPin size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-0.5">Location</p>
                          <p className="text-sm font-bold text-zinc-900">{data.companyProfile?.location || "Dubai, UAE"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-emerald-600 border border-zinc-100 shadow-sm">
                          <Phone size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-0.5">Phone</p>
                          <p className="text-sm font-bold text-zinc-900">{data.companyProfile?.phone || "+971 50 000 0000"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-emerald-600 border border-zinc-100 shadow-sm">
                          <ShieldCheck size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-0.5">Tax ID / TRN</p>
                          <p className="text-sm font-bold text-zinc-900">{data.companyProfile?.tax_id || "100-2345-6789-001"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-emerald-600 border border-zinc-100 shadow-sm">
                          <Globe size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-0.5">Website</p>
                          <p className="text-sm font-bold text-zinc-900">{data.companyProfile?.website || "www.strcopilot.com"}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <Card title="QUICK ACTIONS">
                  <div className="mt-6 space-y-4">
                    <button 
                      onClick={handleGeneratePDF}
                      className="w-full p-6 bg-white border border-zinc-100 rounded-[2rem] flex items-center gap-4 hover:border-emerald-500/50 hover:bg-emerald-50/30 transition-all group text-left"
                    >
                      <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:text-emerald-600 transition-colors">
                        <FileText size={24} />
                      </div>
                      <p className="text-xs font-medium text-zinc-500 leading-relaxed">
                        Generate a PDF summary of your company.
                      </p>
                    </button>
                    <button 
                      onClick={handleSharePortfolio}
                      className="w-full p-6 bg-white border border-zinc-100 rounded-[2rem] flex items-center gap-4 hover:border-emerald-500/50 hover:bg-emerald-50/30 transition-all group text-left"
                    >
                      <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:text-emerald-600 transition-colors">
                        <Share2 size={24} />
                      </div>
                      <p className="text-xs font-medium text-zinc-500 leading-relaxed">
                        Share your portfolio with potential investors.
                      </p>
                    </button>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'subscription' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <Card title="ACTIVE SUBSCRIPTION">
                  <div className="mt-8 p-8 bg-white border border-zinc-100 rounded-[2.5rem] flex items-center gap-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full -mr-32 -mt-32" />
                    <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm">
                      <Zap size={32} className="text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-black text-amber-600 uppercase tracking-tighter">PRO PLAN</h3>
                      <p className="text-sm text-zinc-500 mt-1">Your plan includes unlimited properties and advanced analytics.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-black text-zinc-900">499.00</p>
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mt-1">AED PER MONTH</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mt-12">
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">PAYMENT METHOD</p>
                      <div className="p-6 bg-white border border-zinc-100 rounded-[2rem] flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400">
                            <CreditCard size={24} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900">Expires 12/28</p>
                          </div>
                        </div>
                        <button className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline">Edit</button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">NEXT BILLING CYCLE</p>
                      <div className="p-6 bg-white border border-zinc-100 rounded-[2rem] flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-zinc-500 leading-relaxed">
                            Your card will be automatically charged on this date.
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-emerald-600">AED 499.00</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-12 pt-8 border-t border-zinc-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-600">
                      <div className="w-5 h-5 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 border border-amber-100">
                        <Zap size={10} />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest">Cancel your subscription anytime. No hidden fees.</p>
                    </div>
                    <button className="text-rose-500 text-sm font-black hover:underline">Cancel Subscription</button>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <Card title="PLAN FEATURES">
                  <div className="mt-6 space-y-6">
                    {[
                      "Unlimited Properties",
                      "Advanced ROI Tracking",
                      "AI-Powered Projections",
                      "Custom Report Export",
                      "Multi-User Access",
                      "Priority Support"
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-6 h-6 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100">
                          <CheckCircle2 size={14} />
                        </div>
                        <span className="text-sm font-medium text-zinc-600">{feature}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <Card title="PAYMENT HISTORY">
              <div className="mt-8 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">DATE</th>
                      <th className="pb-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">PLAN</th>
                      <th className="pb-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">AMOUNT</th>
                      <th className="pb-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">STATUS</th>
                      <th className="pb-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">INVOICE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(data.paymentHistory || [
                      { payment_id: 'pay-001', date: '2024-03-01', plan: 'PRO', amount_aed: 499, status: 'Success' },
                      { payment_id: 'pay-002', date: '2024-02-01', plan: 'PRO', amount_aed: 499, status: 'Success' }
                    ]).map((pay) => (
                      <tr key={pay.payment_id} className="group hover:bg-zinc-50/50 transition-colors">
                        <td className="py-8">
                          <p className="text-sm font-bold text-zinc-900">{format(parseISO(pay.date), 'MMM d, yyyy')}</p>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">ID: {pay.payment_id}</p>
                        </td>
                        <td className="py-8">
                          <span className="px-3 py-1 bg-zinc-100 text-zinc-500 text-[10px] font-black uppercase rounded-lg border border-zinc-200">
                            {pay.plan}
                          </span>
                        </td>
                        <td className="py-8">
                          <p className="text-sm font-black text-zinc-900">{formatCurrency(pay.amount_aed)}</p>
                        </td>
                        <td className="py-8">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            <span className="text-sm font-bold text-zinc-900">{pay.status}</span>
                          </div>
                        </td>
                        <td className="py-8 text-right">
                          <button className="p-3 bg-white border border-zinc-200 rounded-2xl text-zinc-400 hover:text-emerald-600 hover:border-emerald-600 transition-all shadow-sm">
                            <Download size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {activeTab === 'display' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <Card title="FONT SIZE SETTINGS">
                  <div className="mt-6 space-y-8">
                    <p className="text-sm font-medium text-zinc-500 leading-relaxed max-w-lg">
                      Adjust the application's font size for better readability.
                    </p>
                    
                    <div className="grid grid-cols-4 gap-4">
                      {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => handleUpdateDisplay({ fontSize: size })}
                          className={cn(
                            "p-8 rounded-[2rem] border transition-all duration-300 flex flex-col items-center gap-3 group",
                            data.displaySettings?.fontSize === size 
                              ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 shadow-lg shadow-emerald-500/10" 
                              : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600"
                          )}
                        >
                          <span className={cn(
                            "font-black uppercase tracking-widest",
                            data.displaySettings?.fontSize === size ? "text-emerald-600" : "text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
                          )}>
                            {size}
                          </span>
                          <span className={cn(
                            "text-[10px] font-bold",
                            data.displaySettings?.fontSize === size ? "text-emerald-500" : "text-zinc-300"
                          )}>
                            Sample Text
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="p-8 bg-zinc-50/50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 rounded-[2.5rem] space-y-4">
                      <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">Preview</h4>
                      <p className={cn(
                        "text-zinc-500 dark:text-zinc-400 leading-relaxed transition-all duration-300",
                        data.displaySettings?.fontSize === 'sm' && "text-xs",
                        data.displaySettings?.fontSize === 'md' && "text-sm",
                        data.displaySettings?.fontSize === 'lg' && "text-base",
                        data.displaySettings?.fontSize === 'xl' && "text-lg"
                      )}>
                        This is how your text will look. You can adjust the size to find what's most comfortable for your eyes. The change is applied globally across all dashboard widgets, reports, and settings.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <Card title="VISUAL THEME">
                  <div className="mt-6 space-y-4">
                    <button 
                      onClick={() => handleUpdateDisplay({ theme: 'light' })}
                      className={cn(
                        "w-full p-6 border rounded-[2rem] space-y-2 text-left transition-all",
                        data.displaySettings?.theme === 'light' 
                          ? "bg-emerald-50/30 dark:bg-emerald-500/10 border-emerald-500/20" 
                          : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                      )}
                    >
                      <h4 className={cn(
                        "text-sm font-bold",
                        data.displaySettings?.theme === 'light' ? "text-emerald-600" : "text-zinc-900 dark:text-zinc-100"
                      )}>Light Tech</h4>
                      <p className="text-[11px] font-medium text-zinc-500 leading-relaxed">
                        A clean, high-contrast theme optimized for professional data analysis.
                      </p>
                    </button>
                    <button 
                      onClick={() => handleUpdateDisplay({ theme: 'dark' })}
                      className={cn(
                        "w-full p-6 border rounded-[2rem] space-y-2 text-left transition-all",
                        data.displaySettings?.theme === 'dark' 
                          ? "bg-zinc-900 border-zinc-700" 
                          : "bg-white border-zinc-100 hover:border-zinc-200"
                      )}
                    >
                      <h4 className={cn(
                        "text-sm font-bold",
                        data.displaySettings?.theme === 'dark' ? "text-zinc-100" : "text-zinc-900"
                      )}>Dark Mode</h4>
                      <p className={cn(
                        "text-[11px] font-medium leading-relaxed",
                        data.displaySettings?.theme === 'dark' ? "text-zinc-400" : "text-zinc-500"
                      )}>
                        Switch to a low-light interface for night work.
                      </p>
                    </button>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditingProfile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-xl font-black text-zinc-900 tracking-tight">Edit Company Profile</h3>
                <button onClick={() => setIsEditingProfile(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Company Name</label>
                    <input 
                      type="text" 
                      className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:border-emerald-500 focus:ring-0 transition-all text-sm font-medium"
                      value={profileForm.name || ''}
                      onChange={e => setProfileForm({...profileForm, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Website</label>
                    <input 
                      type="text" 
                      className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:border-emerald-500 focus:ring-0 transition-all text-sm font-medium"
                      value={profileForm.website || ''}
                      onChange={e => setProfileForm({...profileForm, website: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Email</label>
                    <input 
                      type="email" 
                      className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:border-emerald-500 focus:ring-0 transition-all text-sm font-medium"
                      value={profileForm.email || ''}
                      onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Phone</label>
                    <input 
                      type="text" 
                      className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:border-emerald-500 focus:ring-0 transition-all text-sm font-medium"
                      value={profileForm.phone || ''}
                      onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Description</label>
                  <textarea 
                    rows={3}
                    className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:border-emerald-500 focus:ring-0 transition-all text-sm font-medium resize-none"
                    value={profileForm.description || ''}
                    onChange={e => setProfileForm({...profileForm, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="p-8 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsEditingProfile(false)}>Cancel</Button>
                <Button onClick={handleSaveProfile}>Save Changes</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
