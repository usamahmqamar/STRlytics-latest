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
import { useNavigate } from 'react-router-dom';
import { useAuth, trialDaysLeft } from '../auth/AuthProvider';

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
  const { user, workspace, workspaces, selectWorkspace, signOut } = useAuth();
  const navigate = useNavigate();
  const trialLeft = trialDaysLeft(workspace);
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
        <div className={cn("flex items-center gap-3 px-2 relative w-full", isCollapsed && "justify-center px-0")}>
          <div className="w-10 h-10 bg-zinc-950 rounded-xl flex items-center justify-center text-white shrink-0 border border-zinc-800 shadow-sm">
            <TrendingUp size={20} className="text-emerald-400" />
          </div>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <h1 className="font-semibold text-base leading-none text-zinc-900 dark:text-zinc-100 tracking-tight">Staylytics</h1>
              <p className="text-[10px] text-zinc-400 mt-0.5 max-w-[150px] truncate" title={workspace?.name}>{workspace?.name ?? 'Short-term rental P&L'}</p>
            </motion.div>
          )}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "absolute -right-4 top-1/2 -translate-y-1/2 w-7 h-7 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-emerald-500 shadow-md transition-all z-50",
              isCollapsed && "right-auto left-1/2 -translate-x-1/2 mt-16"
            )}
          >
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 w-full">
          <button
            onClick={onSearchClick}
            className={cn(
              "flex items-center rounded-xl text-xs transition-all duration-200 w-full group relative overflow-hidden mb-3",
              isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-2.5",
              "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800"
            )}
          >
            <ScanLine size={16} className="shrink-0 text-zinc-450" />
            {!isCollapsed && (
              <div className="flex items-center justify-between flex-1 text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 font-medium">
                <span>Quick Search</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-150 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-[9px] font-medium text-zinc-400">⌘K</kbd>
              </div>
            )}
          </button>

          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-xl text-[13px] font-medium transition-all duration-200 w-full group relative overflow-hidden",
                isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-2",
                activeTab === item.id 
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold" 
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
              )}
            >
              {activeTab === item.id && (
                <motion.div 
                  layoutId="active-tab-indicator"
                  className="absolute left-0 w-1 h-6 bg-emerald-500 rounded-r-full"
                />
              )}
              <item.icon 
                size={16} 
                className={cn(
                  "shrink-0 transition-transform duration-300",
                  activeTab === item.id ? "scale-105" : "group-hover:scale-105"
                )} 
              />
              {item.id === 'dashboard' && upcomingChequesCount > 0 && (
                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
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
            className="mt-auto p-4 bg-orange-50/50 dark:bg-orange-950/10 rounded-2xl border border-orange-100 dark:border-orange-900/30 mx-2"
          >
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-2">
              <Bell size={13} />
              <span className="text-xs font-semibold">Priority Alerts</span>
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
              <p className="font-semibold text-zinc-850 dark:text-zinc-200">{upcomingChequesCount} Critical Items</p>
              <p className="text-[10px] mt-0.5">Pending verification today</p>
            </div>
          </motion.div>
        )}

        {/* Workspace and account */}
        <div className="mt-auto pt-4 border-t border-zinc-150 dark:border-zinc-800 w-full space-y-2">
          {!isCollapsed && trialLeft !== null && (
            <div className="mx-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-[11px] text-emerald-800">
              <span className="font-semibold">{trialLeft} {trialLeft === 1 ? 'day' : 'days'}</span> left in your free trial
            </div>
          )}
          {!isCollapsed && workspaces.length > 1 && (
            <select
              aria-label="Switch workspace"
              value={workspace?.id}
              onChange={e => selectWorkspace(e.target.value)}
              className="mx-2 w-[calc(100%-1rem)] rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700"
            >
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          {!isCollapsed && user?.email && (
            <p className="px-4 text-[11px] text-zinc-400 truncate" title={user.email}>{user.email}</p>
          )}
          <button
            onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
            className={cn(
              "w-full flex items-center text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all",
              isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-2"
            )}
            title={isCollapsed ? "Log out" : undefined}
          >
            <LogOut size={16} />
            {!isCollapsed && <span className="text-xs font-medium">Log out</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};
