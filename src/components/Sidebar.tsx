/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, Calendar, ClipboardList, TrendingUp, 
  Wallet, BarChart3, Building2, Package, ShieldCheck, 
  ScanLine, Table, Database, Settings, LogOut,
  ChevronLeft, ChevronRight, Bell, Trash2, Users
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../services/firebase';
import { signOut } from 'firebase/auth';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  upcomingChequesCount: number;
  onSearchClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  isCollapsed, 
  setIsCollapsed,
  upcomingChequesCount,
  onSearchClick
}) => {
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'calendar', icon: Calendar, label: 'Calendar' },
    { id: 'reservations', icon: ClipboardList, label: 'Reservations' },
    { id: 'occupancy', icon: TrendingUp, label: 'Occupancy & Revenue' },
    { id: 'projections', icon: BarChart3, label: 'Feasibility & Projections' },
    { id: 'reports', icon: Package, label: 'Investor Reports' },
    { id: 'setup', icon: Building2, label: 'Property Setup' },
    { id: 'assets', icon: Package, label: 'Inventory & Assets' },
    { id: 'documents', icon: ShieldCheck, label: 'Document Vault' },
    { id: 'ocr', icon: ScanLine, label: 'Receipt OCR' },
    { id: 'daily-pl', icon: TrendingUp, label: 'Daily P&L' },
    { id: 'analytics', icon: Table, label: 'Analytics' },
    { id: 'cashflow', icon: Wallet, label: 'Cashflow' },
    { id: 'operations', icon: Users, label: 'Operations' },
    { id: 'data', icon: Database, label: 'Data Manager' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 bottom-0 bg-white border-r border-zinc-200 flex flex-col transition-all duration-500 z-50",
        isCollapsed ? "w-24" : "w-72"
      )}
    >
      <div className={cn("p-4 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar", isCollapsed && "items-center px-0")}>
        {/* Logo */}
        <div className={cn("flex items-center gap-4 px-2 relative w-full", isCollapsed && "justify-center px-0")}>
          <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white shrink-0 border border-zinc-800 shadow-lg">
            <TrendingUp size={24} />
          </div>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <h1 className="font-black text-2xl leading-none text-zinc-900 tracking-tighter italic">STR COPILOT</h1>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Property Management OS</p>
            </motion.div>
          )}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white border border-zinc-200 rounded-full flex items-center justify-center text-zinc-400 hover:text-emerald-500 shadow-2xl transition-all z-50 hover:border-emerald-500/50",
              isCollapsed && "right-auto left-1/2 -translate-x-1/2 mt-16"
            )}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2 w-full">
          <button
            onClick={onSearchClick}
            className={cn(
              "flex items-center rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-300 w-full group relative overflow-hidden mb-4",
              isCollapsed ? "justify-center p-4" : "gap-4 px-5 py-4",
              "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 border border-dashed border-zinc-200"
            )}
          >
            <ScanLine size={18} className="shrink-0 group-hover:scale-110 transition-transform" />
            {!isCollapsed && (
              <div className="flex items-center justify-between flex-1">
                <span>Quick Search</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[9px] font-bold text-zinc-400">⌘K</kbd>
              </div>
            )}
          </button>

          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-300 w-full group relative overflow-hidden",
                isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-2",
                activeTab === item.id 
                  ? "bg-zinc-900 text-white shadow-xl" 
                  : "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50"
              )}
            >
              {activeTab === item.id && (
                <motion.div 
                  layoutId="active-tab-indicator"
                  className="absolute left-0 w-1 h-8 bg-emerald-500 rounded-r-full"
                />
              )}
              <item.icon 
                size={18} 
                className={cn(
                  "shrink-0 transition-transform duration-500",
                  activeTab === item.id ? "scale-110 rotate-3" : "group-hover:scale-110 group-hover:-rotate-3"
                )} 
              />
              {item.id === 'dashboard' && upcomingChequesCount > 0 && (
                <div className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
              )}
              {!isCollapsed && <span className="relative z-10">{item.label}</span>}
              
              {/* Hover effect */}
              <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </nav>

        {/* Alerts Mini Widget */}
        {!isCollapsed && upcomingChequesCount > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-auto p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 mx-2 relative overflow-hidden"
          >
            <div className="flex items-center gap-2 text-emerald-500 mb-4 relative z-10">
              <Bell size={14} className="animate-bounce" />
              <span className="text-[10px] font-bold uppercase tracking-widest">System Alerts</span>
            </div>
            <div className="space-y-3 relative z-10">
              <div className="text-[11px] leading-tight">
                <p className="font-black text-zinc-900 uppercase tracking-widest">{upcomingChequesCount} Critical Items</p>
                <p className="text-zinc-500 mt-1 font-medium">Pending verification</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Auth Actions */}
        <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
          {auth?.currentUser?.uid !== 'guest_user' ? (
            <button 
              onClick={() => signOut(auth)}
              className={cn(
                "w-full flex items-center text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all",
                isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-2"
              )}
              title={isCollapsed ? "Log Out" : undefined}
            >
              <LogOut size={18} />
              {!isCollapsed && <span className="text-[11px] font-black uppercase tracking-widest">Log Out</span>}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className={cn(
                "flex items-center text-amber-500 bg-amber-50 dark:bg-amber-950/20 rounded-xl p-2",
                isCollapsed ? "justify-center" : "gap-2"
              )}>
                <ShieldCheck size={16} />
                {!isCollapsed && <span className="text-[9px] font-black uppercase tracking-widest">Guest Mode</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
