/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth, type Workspace } from './auth/AuthProvider';
import { canEdit, canManage, workspaceIsWritable } from './lib/permissions';
import { Payouts } from './components/Payouts';
import { ImportBookings } from './components/ImportBookings';
import { NeedsProperty } from './components/GettingStarted';
import { hasUnsaved, loadWorkspaceData, saveChanges, TABLE_LABELS, type LoadedWorkspace } from './services/dataStore';
import { subscribeToWorkspace } from './services/live';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setMonitoringUser } from './lib/monitoring';
import { setActiveWorkspace } from './services/ai';
import { UserData } from './types';
import { convertUserData, currenciesInUse, isSupportedCurrency, type Rates } from './lib/money';
import { earliestDate, loadRates } from './services/fx';
import { DEFAULT_USER_DATA } from './constants';
import { Toaster, toast } from 'react-hot-toast';
import { Sidebar, NAV_LABELS } from './components/Sidebar';
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
  AlertTriangle, Loader2, Sparkles, Menu 
} from 'lucide-react';
import { GlobalSearch } from './components/GlobalSearch';
import { cn } from './lib/utils';
import { format, startOfMonth, endOfMonth, differenceInDays, parseISO, addDays, startOfDay } from 'date-fns';

export const APP_TABS = [
  'dashboard', 'calendar', 'reservations', 'occupancy', 'projections', 'reports', 'setup',
  'assets', 'documents', 'ocr', 'daily-pl', 'analytics', 'cashflow', 'payouts', 'operations', 'data', 'team', 'settings',
];

// Screens where the property, date and currency filters change what is shown.
// Screens that show nothing useful until a property exists; they get one clear next step instead.
const NEEDS_PROPERTY = new Set(['calendar', 'occupancy', 'daily-pl', 'analytics', 'cashflow', 'reports', 'operations', 'payouts', 'assets', 'ocr']);

const FILTERED_TABS = new Set(['dashboard', 'reservations', 'occupancy', 'daily-pl', 'analytics', 'cashflow', 'payouts', 'reports', 'operations']);

export default function App() {
  // Sign-in and the active workspace come from AuthProvider; RequireAuth and RequireWorkspace
  // guarantee both exist before this component renders.
  const { user, workspace: activeWorkspace, signOut } = useAuth();
  const workspace = activeWorkspace!;
  const [loading, setLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData>(DEFAULT_USER_DATA);
  const snapshotRef = useRef<LoadedWorkspace['snapshot'] | null>(null);
  const versionsRef = useRef<LoadedWorkspace['versions']>(new Map());
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [filters, setFilters] = useState({
    apartmentId: 'ALL',
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    displayCurrency: 'AED'
  });
  const [rates, setRates] = useState<Rates>(new Map());
  const editable = workspace ? canEdit(workspace) : false;
  const blockedForSetup = userData.apartments.length === 0 && NEEDS_PROPERTY.has(activeTab);
  // Latest values for the save loop (avoids saving stale data from an old render).
  const latest = useRef({ userData, workspace, user });
  latest.current = { userData, workspace, user };

  const loadData = async (ws: Workspace, userId: string) => {
    const loaded = await loadWorkspaceData(ws, userId);
    snapshotRef.current = loaded.snapshot;
    versionsRef.current = loaded.versions;
    loadedDataRef.current = loaded.data;
    setUserData(loaded.data);
  };

  useEffect(() => { setMonitoringUser(user?.id ?? null, workspace?.id ?? null); }, [user?.id, workspace?.id]);

  // Money is stored in each listing's own currency. Screens that total across listings see a
  // converted copy: one listing selected → its own currency; all listings → the workspace's
  // display currency. Each amount converts at the rate for its own date.
  const workspaceCurrency = isSupportedCurrency(workspace?.base_currency) ? workspace!.base_currency : 'AED';
  const viewCurrency = (filters.apartmentId !== 'ALL'
    && userData.apartments.find(a => a.apartment_id === filters.apartmentId)?.currency) || workspaceCurrency;
  // Rates for the currencies in use, plus the common ones PDFs and bank statements arrive in.
  const currencyKey = [...new Set([...currenciesInUse(userData, workspaceCurrency), 'EUR', 'GBP', 'INR', 'USD'])].sort().join(',');
  const firstMoneyDate = useMemo(() => earliestDate([
    ...userData.reservations.map(r => r.check_in), ...userData.dailyExpenses.map(e => e.date),
    ...userData.apartments.map(a => a.start_operation_date),
  ]), [userData.reservations, userData.dailyExpenses, userData.apartments]);
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    loadRates(currencyKey.split(','), firstMoneyDate)
      .then(r => { if (!cancelled) setRates(r); })
      .catch(err => console.error('Exchange rates failed to load:', (err as any)?.code || err));
    return () => { cancelled = true; };
  }, [workspace?.id, currencyKey, firstMoneyDate]);
  const view = useMemo(() => convertUserData(userData, viewCurrency, rates, workspaceCurrency),
    [userData, viewCurrency, rates, workspaceCurrency]);
  const viewFilters = useMemo(() => ({ ...filters, displayCurrency: viewCurrency }), [filters, viewCurrency]);
  const viewData = view.data;

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
        versionsRef.current = loaded.versions;
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
      const result = await saveChanges(workspace, user.id, snapshotRef.current, userData, versionsRef.current);
      snapshotRef.current = result.snapshot;
      versionsRef.current = result.versions;
      if (result.conflicts.length) {
        // Someone else changed these first. Keep their version and say so; never overwrite.
        const kinds = [...new Set(result.conflicts.map(c => TABLE_LABELS[c.table] || c.table))].join(', ');
        const n = result.conflicts.length;
        toast(`A teammate changed ${n === 1 ? 'a record' : `${n} records`} (${kinds}) while you were editing. Their version is now shown; make your change again if it is still needed.`,
          { id: 'conflict', duration: 9000, icon: '⚠️' });
        await loadData(workspace, user.id);
      }
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

  // Live updates: when a teammate saves, reload (at most every few seconds) unless this
  // screen has edits that are not saved yet; those save first and are checked for conflicts.
  useEffect(() => {
    if (!workspace || !user || loading) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      timer = null;
      const { userData: current, workspace: ws, user: u } = latest.current;
      if (!ws || !u || savingRef.current || hasUnsaved(snapshotRef.current, current, ws.id)) {
        timer = setTimeout(refresh, 3000);
        return;
      }
      loadData(ws, u.id).catch(() => {});
    };
    const stop = subscribeToWorkspace(workspace.id, () => {
      if (!timer) timer = setTimeout(refresh, 2000);
    });
    return () => { stop(); if (timer) clearTimeout(timer); };
  }, [workspace?.id, user?.id, loading]);

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
        onSearchClick={() => { setIsMenuOpen(false); setIsSearchOpen(true); }}
        mobileOpen={isMenuOpen}
        onCloseMobile={() => setIsMenuOpen(false)}
      />

      <main className={cn(
        "min-h-screen transition-[padding] duration-300",
        isSidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-64",
        "print:pl-0"
      )}>
       <div className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="mb-6 flex items-center justify-between gap-4 lg:items-end print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setIsMenuOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 lg:hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              aria-label="Open menu"
            >
              <Menu size={17} />
            </button>
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-zinc-900 sm:text-[28px] dark:text-zinc-50">
              {NAV_LABELS[activeTab] ?? 'Dashboard'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <div
              role="status"
              className={cn(
                "flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-500 dark:text-zinc-400",
                syncStatus === 'error' && "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
              )}
              title={syncError ?? undefined}
            >
              {syncStatus === 'synced' ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="hidden sm:inline">Saved at {format(lastSyncTime, 'HH:mm')}</span>
                </>
              ) : syncStatus === 'syncing' ? (
                <>
                  <Loader2 size={12} className="animate-spin text-zinc-400" />
                  <span>Saving</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={12} />
                  <span>Not saved</span>
                </>
              )}
            </div>

            <button
              onClick={() => setIsHelpOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:text-zinc-100"
              title="Help and user guide"
              aria-label="Help and user guide"
            >
              <HelpCircle size={15} />
            </button>
          </div>
        </header>

        <ImportBookings
          open={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          orgId={workspace.id}
          data={userData}
          setData={setUserData}
          canWrite={editable}
          rates={rates}
          baseCurrency={workspaceCurrency}
        />
        <HelpGuide isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

        {FILTERED_TABS.has(activeTab) && userData.apartments.length > 0 && (
          <FilterBar 
            filters={filters} 
            setFilters={setFilters} 
            apartments={userData.apartments} 
            viewCurrency={viewCurrency}
            missingRates={[...view.missing]}
          />
        )}

        {!editable && (
          <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium">
            {workspace.deletion_requested_at
              ? 'This workspace is scheduled for deletion and is read-only. An owner can cancel this in Settings, Your data.'
              : workspace.role === 'viewer' || workspaceIsWritable(workspace)
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
              className="ml-auto text-[11px] font-semibold hover:underline"
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
            <ErrorBoundary key={activeTab} area={activeTab}>
            {activeTab === 'dashboard' && <Dashboard data={viewData} rawData={userData} setData={setUserData} filters={viewFilters} onTabChange={setActiveTab} onImportPdfs={() => setIsImportOpen(true)} />}
            {blockedForSetup && (
              <NeedsProperty screen={NAV_LABELS[activeTab] ?? 'This screen'} onAdd={() => setActiveTab('setup')} />
            )}
            {!blockedForSetup && activeTab === 'calendar' && <Calendar data={viewData} filters={viewFilters} />}
            {activeTab === 'reservations' && <Reservations data={userData} setData={setUserData} filters={viewFilters} onImportPdfs={() => setIsImportOpen(true)} />}
            {!blockedForSetup && activeTab === 'payouts' && <Payouts data={userData} orgId={workspace.id} canManage={canManage(workspace)} filters={viewFilters} rates={rates} baseCurrency={workspaceCurrency} />}
            {!blockedForSetup && activeTab === 'operations' && (
              <Operations 
                data={userData} 
                setData={setUserData} 
                filters={viewFilters} 
                view={viewData}
                baseCurrency={workspaceCurrency}
                prefilledExpense={prefilledExpense}
                onClearPrefill={() => setPrefilledExpense(null)}
              />
            )}
            {activeTab === 'setup' && <Setup data={userData} setData={setUserData} baseCurrency={workspaceCurrency} baseCountry={workspace.country ?? ''} />}
            {!blockedForSetup && activeTab === 'analytics' && <Analytics data={viewData} filters={viewFilters} />}
            {!blockedForSetup && activeTab === 'occupancy' && <OccupancyRevenue data={viewData} filters={viewFilters} />}
            {!blockedForSetup && activeTab === 'ocr' && (
              <ReceiptOCR 
                onSuccess={(extractedData) => {
                  setPrefilledExpense({
                    amount: extractedData.total_amount,
                    category: extractedData.category || 'Maintenance',
                    notes: `Extracted from receipt: ${extractedData.vendor_name || ''} - ${extractedData.date || ''}`,
                    date: extractedData.date || format(new Date(), 'yyyy-MM-dd')
                  });
                  setActiveTab('operations');
                }} 
              />
            )}
            {!blockedForSetup && activeTab === 'daily-pl' && <DailyPL data={viewData} filters={viewFilters} />}
            {activeTab === 'projections' && <Projections orgId={workspace.id} data={userData} setData={setUserData} canWrite={editable} canAddProperty={canManage(workspace)} onOpenProperty={() => setActiveTab('setup')} baseCurrency={workspaceCurrency} />}
            {!blockedForSetup && activeTab === 'cashflow' && <Cashflow data={viewData} filters={viewFilters} />}
            {!blockedForSetup && activeTab === 'assets' && <Assets data={userData} setData={setUserData} />}
            {activeTab === 'documents' && <Documents data={userData} setData={setUserData} />}
            {!blockedForSetup && activeTab === 'reports' && <InvestorReports data={viewData} currency={viewCurrency} />}
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
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
       </div>
      </main>
    </div>
  );
}
