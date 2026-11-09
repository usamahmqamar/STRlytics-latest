/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard, Calendar, ClipboardList, TrendingUp,
  Wallet, BarChart3, Building2, Package, ShieldCheck,
  ScanLine, Table, Database, Settings, LogOut, Search,
  PanelLeftClose, PanelLeftOpen, Users, UsersRound, FileText, Receipt, CalendarClock,
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
  /** Phones and tablets: the menu is a drawer opened from the header. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

type NavItem = { id: string; icon: React.ElementType; label: string };

// Grouped the way an operator works through the day: check, book, account for money, look after properties.
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'calendar', icon: Calendar, label: 'Calendar' },
  ] },
  { label: 'Bookings', items: [
    { id: 'reservations', icon: ClipboardList, label: 'Reservations' },
    { id: 'occupancy', icon: TrendingUp, label: 'Occupancy and revenue' },
  ] },
  { label: 'Money', items: [
    { id: 'daily-pl', icon: BarChart3, label: 'Daily P&L' },
    { id: 'cashflow', icon: Wallet, label: 'Cash flow' },
    { id: 'analytics', icon: Table, label: 'Analytics' },
    { id: 'ocr', icon: Receipt, label: 'Scan a receipt' },
    { id: 'reports', icon: FileText, label: 'Investor reports' },
    { id: 'projections', icon: CalendarClock, label: 'Feasibility' },
  ] },
  { label: 'Properties', items: [
    { id: 'setup', icon: Building2, label: 'Properties and leases' },
    { id: 'operations', icon: Users, label: 'Operations' },
    { id: 'assets', icon: Package, label: 'Inventory' },
    { id: 'documents', icon: ShieldCheck, label: 'Documents' },
  ] },
  { label: 'Workspace', items: [
    { id: 'team', icon: UsersRound, label: 'Team' },
    { id: 'data', icon: Database, label: 'Import and export' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ] },
];

export const NAV_LABELS: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap(g => g.items.map(i => [i.id, i.label])),
);

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  upcomingChequesCount,
  onSearchClick,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const { user, workspace, workspaces, selectWorkspace, signOut } = useAuth();
  const navigate = useNavigate();
  const trialLeft = trialDaysLeft(workspace);

  // The drawer always shows full labels; collapsing only applies on wide screens.
  const compact = isCollapsed && !mobileOpen;
  const go = (tab: string) => { setActiveTab(tab); onCloseMobile?.(); };

  return (
    <>
    {mobileOpen && (
      <div className="fixed inset-0 z-40 bg-zinc-950/40 lg:hidden" onClick={onCloseMobile} aria-hidden />
    )}
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-50 flex w-72 flex-col print:hidden border-r border-zinc-200 bg-white transition-[width,transform] duration-300 dark:border-zinc-800 dark:bg-zinc-950',
        'lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        isCollapsed ? 'lg:w-[72px]' : 'lg:w-64',
      )}
      aria-label="Menu"
    >
      {/* Brand and workspace */}
      <div className={cn('flex items-center gap-3 px-5 pt-5 pb-4', compact && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
          <TrendingUp size={18} strokeWidth={2.25} />
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight text-zinc-900 dark:text-zinc-50">Staylytics</p>
            <p className="truncate text-xs text-zinc-500" title={workspace?.name}>{workspace?.name ?? 'Short-term rental P&L'}</p>
          </div>
        )}
      </div>

      {!compact && workspaces.length > 1 && (
        <div className="px-4 pb-3">
          <select
            aria-label="Switch workspace"
            value={workspace?.id}
            onChange={e => selectWorkspace(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      )}

      <div className={cn('px-4 pb-2', compact && 'px-3')}>
        <button
          onClick={onSearchClick}
          title={compact ? 'Search (⌘K)' : undefined}
          className={cn(
            'flex h-9 w-full items-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-800 dark:border-zinc-800 dark:hover:text-zinc-200',
            compact ? 'justify-center' : 'gap-2.5 px-3',
          )}
        >
          <Search size={15} className="shrink-0" />
          {!compact && (
            <>
              <span className="flex-1 text-left text-[13px]">Search</span>
              <kbd className="rounded border border-zinc-200 px-1.5 text-[11px] text-zinc-400 dark:border-zinc-700">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && 'mt-5')}>
            {group.label && !compact && (
              <p className="px-3 pb-1.5 text-[11px] font-medium text-zinc-400">{group.label}</p>
            )}
            {group.label && compact && <div className="mx-auto mb-2 h-px w-6 bg-zinc-200 dark:bg-zinc-800" />}
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = activeTab === item.id;
                const flag = item.id === 'dashboard' && upcomingChequesCount > 0;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => go(item.id)}
                      title={compact ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex h-9 w-full items-center rounded-lg text-[13px] transition-colors',
                        compact ? 'justify-center' : 'gap-3 px-3',
                        active
                          ? 'bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100',
                      )}
                    >
                      <item.icon size={16} strokeWidth={active ? 2.25 : 1.75} className="shrink-0" />
                      {!compact && <span className="truncate">{item.label}</span>}
                      {flag && (
                        <span
                          className={cn('h-1.5 w-1.5 rounded-full bg-amber-500', compact ? 'absolute right-2 top-2' : 'ml-auto')}
                          aria-label={`${upcomingChequesCount} rent cheques need attention`}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account */}
      <div className={cn('border-t border-zinc-200 px-4 py-3 dark:border-zinc-800', compact && 'px-3')}>
        {!compact && upcomingChequesCount > 0 && (
          <button
            onClick={() => go('setup')}
            className="mb-2 w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-200"
          >
            <span className="font-semibold">{upcomingChequesCount} rent {upcomingChequesCount === 1 ? 'cheque' : 'cheques'}</span> due within 30 days or overdue
          </button>
        )}
        {!compact && trialLeft !== null && (
          <p className="mb-2 px-1 text-xs text-zinc-500">
            Free trial: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{trialLeft} {trialLeft === 1 ? 'day' : 'days'} left</span>
          </p>
        )}
        <div className={cn('flex items-center gap-1', compact && 'flex-col')}>
          {!compact && (
            <p className="min-w-0 flex-1 truncate px-1 text-xs text-zinc-500" title={user?.email ?? ''}>{user?.email}</p>
          )}
          <button
            onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
            title="Log out"
            aria-label="Log out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <LogOut size={15} />
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
           
            title={compact ? 'Expand menu' : 'Collapse menu'}
            aria-label={compact ? 'Expand menu' : 'Collapse menu'}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 lg:flex dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            {compact ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
      </div>
    </aside>
    </>
  );
};
