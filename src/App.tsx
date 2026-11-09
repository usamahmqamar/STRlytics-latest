/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth, type Workspace } from './auth/AuthProvider';
import { canEdit, workspaceIsWritable } from './lib/permissions';
import { loadWorkspaceData, saveChanges, TABLE_LABELS, type LoadedWorkspace } from './services/dataStore';
import { setActiveWorkspace } from './services/ai';
import { UserData } from './types';
import { DEFAULT_USER_DATA } from './constants';
import { Toaster, toast } from 'react-hot-toast';
import { Sidebar } from './components/Sidebar';
import { FilterBar } from './components/FilterBar';
import { Dashboard } from './components/Dashboard';
import { Calendar } from './components/Calendar';
import { Reservations } from './components/Reservations';
import { Operations } from './components/Operations';
import { Setup } from './components/Setup';
import { Analytics } from './components/Analytics';
import { OccupancyRevenue } from './components/OccupancyRevenue';
import { ReceiptOCR } from './components/ReceiptOCR';
import { Projections } from './components/Projections';
import { DailyPL } from './components/DailyPL';
import { HelpGuide } from './components/HelpGuide';
import { DataManager } from './components/DataManager';
import { Assets } from './components/Assets';
import { Documents } from './components/Documents';
import { Cashflow } from './components/Cashflow';
import { InvestorReports } from './components/InvestorReports';
import { Settings } from './components/Settings';
import { Team } from './components/Team';
import { Button } from './components/ui/Button';
import { 
  TrendingUp, Globe, Bell, HelpCircle, 
  Settings as SettingsIcon, Database, 
  AlertTriangle, Loader2, Sparkles 
} from 'lucide-react';
import { GlobalSearch } from './components/GlobalSearch';
import { cn } from './lib/utils';
import { format, startOfMonth, endOfMonth, differenceInDays, parseISO, addDays, startOfDay } from 'date-fns';

export const APP_TABS = [
  'dashboard', 'calendar', 'reservations', 'occupancy', 'projections', 'reports', 'setup',
  'assets', 'documents', 'ocr', 'daily-pl', 'analytics', 'cashflow', 'operations', 'data', 'team', 'settings',
];

export default function App() {
  // Sign-in and the active workspace come from AuthProvider; RequireAuth and RequireWorkspace
  // guarantee both exist before this component renders.
  const { user, workspace: activeWorkspace, signOut } = useAuth();
  const workspace = activeWorkspace!;
  const [loading, setLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData>(DEFAULT_USER_DATA);
  const snapshotRef = useRef<LoadedWorkspace['snapshot'] | null>(null);
  const loadedDataRef = useRef<UserData | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [syncError, setSyncError] = useState<string | null>(null);
  // The active screen comes from the URL (/app/:tab) so every screen can be linked and survives a refresh.
  const { tab } = useParams();
  const navigate = useNavigate();
  const activeTab = tab && APP_TABS.includes(tab) ? tab : 'dashboard';
  const setActiveTab = (next: string) => navigate(`/app/${next}`);
  const [prefilledExpense, setPrefilledExpense] = useState<any>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [filters, setFilters] = useState({
    apartmentId: 'ALL',
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    displayCurrency: 'AED'
  });
  const editable = workspace ? canEdit(workspace) : false;
  // Latest values for the save loop (avoids saving stale data from an old render).
  const latest = useRef({ userData, workspace, user });
  latest.current = { userData, workspace, user };

  const loadData = async (ws: Workspace, userId: string) => {
    const loaded = await loadWorkspaceData(ws, userId);
    snapshotRef.current = loaded.snapshot;
    loadedDataRef.current = loaded.data;
    setUserData(loaded.data);
  };

  // Load the active workspace's records; reload when the user switches workspace.
  useEffect(() => {
    if (!user || !workspace) return;
    let cancelled = false;
    setLoading(true);
    setWorkspaceError(null);
    snapshotRef.current = null;
    loadedDataRef.current = null;
    setUserData(DEFAULT_USER_DATA);
    setActiveWorkspace(workspace.id);
    loadWorkspaceData(workspace, user.id)
      .then(loaded => {
        if (cancelled) return;
        snapshotRef.current = loaded.snapshot;
        loadedDataRef.current = loaded.data;
        setUserData(loaded.data);
      })
      .catch(err => {
        console.error('Workspace load failed:', (err as any)?.code || err);
        if (!cancelled) setWorkspaceError('We could not load your workspace. Please refresh, or log out and in again.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; setActiveWorkspace(null); };
  }, [user?.id, workspace?.id]);

  // Save only what changed, one save at a time
  const runSave = async () => {
    const { userData, workspace, user } = latest.current;
    if (!workspace || !user || !snapshotRef.current || !canEdit(workspace)) return;
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    setSyncStatus('syncing');
    try {
      const result = await saveChanges(workspace, user.id, snapshotRef.current, userData);
      snapshotRef.current = result.snapshot;
      if (result.blocked.length) {
        toast.error(`Your role can't change ${result.blocked.map(t => TABLE_LABELS[t] || t).join(', ')}. Those edits were undone.`, { id: 'blocked' });
        await loadData(workspace, user.id);
      }
      if (result.failed.length) {
        setSyncStatus('error');
        setSyncError(`Some changes could not be saved (${result.failed.map(t => TABLE_LABELS[t] || t).join(', ')}). Check the values and try again.`);
      } else {
        setSyncStatus('synced');
        setSyncError(null);
        if (result.changed) setLastSyncTime(new Date());
      }
    } catch (err) {
      console.error('Save failed:', err);
      setSyncStatus('error');
      setSyncError('Failed to save. Please check your connection.');
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; setTimeout(runSave, 0); }
    }
  };

  useEffect(() => {
    if (!workspace || !user || !snapshotRef.current || !editable || userData === loadedDataRef.current) return;
    const timer = setTimeout(runSave, 1500);
    return () => clearTimeout(timer);
  }, [userData]);

  // Pick up teammates' changes when returning to the tab, if nothing is waiting to save.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !workspace || !user || savingRef.current) return;
      if (userData !== loadedDataRef.current && syncStatus !== 'synced') return;
      loadData(workspace, user.id).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [workspace, user?.id, userData, syncStatus]);

  // Clearing data keeps booking platforms, the company profile and display settings.
  const handleReset = () => setUserData(prev => ({
    ...prev,
    apartments: [], reservations: [], monthlyBills: [], dailyExpenses: [], vendors: [], serviceRecords: [],
    invoices: [], payments: [], bankReconciliations: [], assets: [], documents: [], maintenanceTasks: [],
    communicationTemplates: [],
  }));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigate = (tab: string, subTab?: string) => {
    setActiveTab(tab);
  };

  const upcomingChequesCount = useMemo(() => {
    const today = startOfDay(new Date());
    const next30Days = addDays(today, 30);
    return userData.apartments.flatMap(a => a.rent_cheques || []).filter(c => {
      if (!c.due_date) return false;
      const dueDate = parseISO(c.due_date);
      // Include anything due in the next 30 days OR anything already overdue
      return c.status === 'due' && dueDate <= next30Days;
    }).length;
  }, [userData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
        {workspaceError ? (
          <>
            <p className="text-sm text-rose-600 max-w-sm">{workspaceError}</p>
            <Button variant="outline" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>Log out</Button>
          </>
        ) : (
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300",
      userData.displaySettings?.theme === 'dark' ? "bg-zinc-950 text-zinc-100 dark" : "bg-zinc-50 text-zinc-900",
      userData.displaySettings?.fontSize === 'sm' && "text-xs",
      userData.displaySettings?.fontSize === 'md' && "text-sm",
      userData.displaySettings?.fontSize === 'lg' && "text-base",
      userData.displaySettings?.fontSize === 'xl' && "text-lg",
      "font-sans"
    )}>
      <Toaster position="top-right" />
      <GlobalSearch 
        data={userData} 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        onNavigate={handleNavigate}
      />
      
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        upcomingChequesCount={upcomingChequesCount}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      <main className={cn(
        "transition-all duration-500 p-4 max-w-7xl mx-auto min-h-screen relative z-10",
        isSidebarCollapsed ? "ml-24" : "ml-72"
      )}>
        <header className="flex items-center justify-between mb-6 relative">
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 capitalize">
              {activeTab === 'ocr' ? 'Receipt AI OCR' : activeTab === 'daily-pl' ? 'Daily P&L' : activeTab.replace('-', ' ')}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-500 dark:text-zinc-400 transition-all shadow-sm",
              syncStatus === 'error' && "border-rose-200 dark:border-rose-950 text-rose-600 dark:text-rose-400"
            )}>
              {syncStatus === 'synced' ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="hidden sm:inline">Saved</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                    {format(lastSyncTime, 'HH:mm')}
                  </span>
                </>
              ) : syncStatus === 'syncing' ? (
                <>
                  <Loader2 size={12} className="animate-spin text-amber-500" />
                  <span>Syncing</span>
                </>
              ) : (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Error</span>
                </>
              )}
            </div>

            <button 
              onClick={() => setIsHelpOpen(true)}
              className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-sm flex items-center justify-center group"
              title="Help & User Guide"
            >
              <HelpCircle size={16} className="group-hover:scale-105 transition-transform" />
            </button>
          </div>
        </header>

        <HelpGuide isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

        {activeTab !== 'team' && (
          <FilterBar 
            filters={filters} 
            setFilters={setFilters} 
            apartments={userData.apartments} 
          />
        )}

        {!editable && (
          <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium">
            {workspace.role === 'viewer' || workspaceIsWritable(workspace)
              ? 'You have view-only access to this workspace. Changes you make here are not saved.'
              : 'This workspace is read-only because its trial or subscription has ended. Your data is safe; changes are not saved.'}
          </div>
        )}


        {syncError && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-800"
          >
            <AlertTriangle className="shrink-0" size={20} />
            <p className="text-xs font-medium">{syncError}</p>
            <button 
              onClick={() => setSyncError(null)}
              className="ml-auto text-[10px] font-black uppercase tracking-widest hover:underline"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && <Dashboard data={userData} setData={setUserData} filters={filters} onTabChange={setActiveTab} />}
            {activeTab === 'calendar' && <Calendar data={userData} filters={filters} />}
            {activeTab === 'reservations' && <Reservations data={userData} setData={setUserData} filters={filters} />}
            {activeTab === 'operations' && (
              <Operations 
                data={userData} 
                setData={setUserData} 
                filters={filters} 
                prefilledExpense={prefilledExpense}
                onClearPrefill={() => setPrefilledExpense(null)}
              />
            )}
            {activeTab === 'setup' && <Setup data={userData} setData={setUserData} />}
            {activeTab === 'analytics' && <Analytics data={userData} filters={filters} />}
            {activeTab === 'occupancy' && <OccupancyRevenue data={userData} filters={filters} />}
            {activeTab === 'ocr' && (
              <ReceiptOCR 
                onSuccess={(extractedData) => {
                  setPrefilledExpense({
                    amount_aed: extractedData.total_amount,
                    category: extractedData.category || 'Maintenance',
                    notes: `Extracted from receipt: ${extractedData.vendor_name || ''} - ${extractedData.date || ''}`,
                    date: extractedData.date || format(new Date(), 'yyyy-MM-dd')
                  });
                  setActiveTab('operations');
                }} 
              />
            )}
            {activeTab === 'daily-pl' && <DailyPL data={userData} filters={filters} />}
            {activeTab === 'projections' && <Projections />}
            {activeTab === 'cashflow' && <Cashflow data={userData} filters={filters} />}
            {activeTab === 'assets' && <Assets data={userData} setData={setUserData} />}
            {activeTab === 'documents' && <Documents data={userData} setData={setUserData} />}
            {activeTab === 'reports' && <InvestorReports data={userData} />}
            {activeTab === 'data' && (
              <DataManager 
                data={userData} 
                setData={setUserData} 
                filters={filters} 
                currentKPIs={[]} 
                timeline={[]} 
                handleReset={handleReset} 
              />
            )}
            {activeTab === 'team' && <Team />}
            {activeTab === 'settings' && <Settings data={userData} setData={setUserData} workspace={workspace} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
