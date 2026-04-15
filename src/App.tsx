/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  getDocFromServer 
} from 'firebase/firestore';
import { auth, db, googleProvider } from './services/firebase';
import { UserData } from './types';
import { DEFAULT_USER_DATA } from './constants';
import { Sidebar } from './components/Sidebar';
import { FilterBar } from './components/FilterBar';
import { Dashboard } from './components/Dashboard';
// import { Calendar } from './components/Calendar';
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
import { Button } from './components/ui/Button';
import { 
  TrendingUp, Globe, Bell, HelpCircle, 
  Settings as SettingsIcon, Database, 
  AlertTriangle, Loader2, Sparkles 
} from 'lucide-react';
import { GlobalSearch } from './components/GlobalSearch';
import { cn } from './lib/utils';
import { format, startOfMonth, endOfMonth, differenceInDays, parseISO, addDays, startOfDay } from 'date-fns';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData>(DEFAULT_USER_DATA);
  const lastSavedDataRef = useRef<string>(JSON.stringify(DEFAULT_USER_DATA));
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
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

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listener
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'user_data', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data().data as UserData;
        const dataStr = JSON.stringify(data);
        
        if (dataStr !== lastSavedDataRef.current) {
          lastSavedDataRef.current = dataStr;
          setUserData({
            ...DEFAULT_USER_DATA,
            ...data,
            apartments: data.apartments || DEFAULT_USER_DATA.apartments,
            reservations: data.reservations || [],
            dailyExpenses: data.dailyExpenses || [],
            vendors: data.vendors || DEFAULT_USER_DATA.vendors,
            serviceRecords: data.serviceRecords || DEFAULT_USER_DATA.serviceRecords,
            payments: data.payments || [],
            invoices: data.invoices || [],
            dashboardWidgets: data.dashboardWidgets || DEFAULT_USER_DATA.dashboardWidgets
          });
        }
      } else {
        // Initialize new user data
        setDoc(userDocRef, {
          uid: user.uid,
          data: DEFAULT_USER_DATA,
          updatedAt: new Date().toISOString()
        });
      }
    }, (error) => {
      console.error("Firestore Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Auto-save data
  useEffect(() => {
    const currentDataStr = JSON.stringify(userData);
    if (!user || currentDataStr === lastSavedDataRef.current) return;
    
    setSyncStatus('syncing');
    const timer = setTimeout(() => {
      lastSavedDataRef.current = currentDataStr;
      const userDocRef = doc(db, 'user_data', user.uid);
      setDoc(userDocRef, {
        uid: user.uid,
        data: userData,
        updatedAt: new Date().toISOString()
      }, { merge: true })
      .then(() => {
        setSyncStatus('synced');
        setLastSyncTime(new Date());
        setSyncError(null);
      })
      .catch(err => {
        console.error("Auto-save failed:", err);
        setSyncStatus('error');
        if (err.code === 'resource-exhausted') {
          setSyncError("Daily storage quota reached. Changes will be saved locally but might not sync until tomorrow.");
        } else {
          setSyncError("Failed to sync data. Please check your connection.");
        }
      });
    }, 2000); // Reduced to 2 seconds to ensure changes reflect quickly

    return () => clearTimeout(timer);
  }, [userData, user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

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
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 overflow-hidden relative">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/5 blur-[120px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-[2.5rem] p-12 text-center relative z-10 shadow-[0_32px_64px_rgba(0,0,0,0.05)] border border-zinc-100"
        >
          <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-10 border border-emerald-500/20">
            <TrendingUp size={40} className="text-emerald-600" />
          </div>
          <h1 className="text-4xl font-black text-zinc-900 mb-3 tracking-tight">STR Copilot</h1>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-12">Advanced Analytics Engine</p>
          
          <button 
            onClick={handleLogin}
            className="w-full group relative flex items-center justify-center gap-4 px-8 py-5 bg-zinc-900 text-white rounded-2xl font-bold text-lg hover:bg-zinc-800 transition-all duration-300 shadow-xl shadow-zinc-200 active:scale-[0.98]"
          >
            <Globe size={24} className="group-hover:rotate-12 transition-transform" />
            Sign in with Google
          </button>
          
          <p className="mt-10 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] leading-relaxed">
            Secure Enterprise Access<br/>
            Powered by Gemini 3 Flash
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen bg-zinc-50 text-zinc-900 selection:bg-emerald-500/20 selection:text-emerald-900",
      userData.displaySettings?.fontSize === 'sm' && "text-xs",
      userData.displaySettings?.fontSize === 'md' && "text-sm",
      userData.displaySettings?.fontSize === 'lg' && "text-base",
      userData.displaySettings?.fontSize === 'xl' && "text-lg",
      "font-sans"
    )}>
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
        "transition-all duration-500 p-8 max-w-7xl mx-auto min-h-screen relative z-10",
        isSidebarCollapsed ? "ml-20" : "ml-64"
      )}>
        <header className="flex items-center justify-between mb-16 relative">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">System Live</span>
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600">v3.0.4</span>
            </div>
            <h2 className="text-4xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100 uppercase leading-none">
              {activeTab.replace('-', ' ')}
            </h2>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Database Sync</span>
              <span className="text-[10px] font-mono text-zinc-500">
                {syncStatus === 'synced' ? `Last: ${format(lastSyncTime, 'HH:mm:ss')}` : 'Syncing...'}
              </span>
            </div>

            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
              syncStatus === 'synced' ? "text-emerald-500 bg-emerald-50 border border-emerald-100" :
              syncStatus === 'syncing' ? "text-amber-500 bg-amber-50 border border-amber-100" :
              "text-rose-500 bg-rose-50 border border-rose-100"
            )}>
              {syncStatus === 'synced' ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Saved
                </>
              ) : syncStatus === 'syncing' ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Syncing
                </>
              ) : (
                <>
                  <AlertTriangle size={12} />
                  Error
                </>
              )}
            </div>

            <button 
              onClick={() => setIsHelpOpen(true)}
              className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[1.5rem] text-zinc-400 hover:text-emerald-500 hover:border-emerald-500 transition-all shadow-xl group relative overflow-hidden"
              title="Help & User Guide"
            >
              <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <HelpCircle size={24} className="group-hover:scale-110 transition-transform relative z-10" />
            </button>
          </div>
        </header>

        <HelpGuide isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

        <FilterBar 
          filters={filters} 
          setFilters={setFilters} 
          apartments={userData.apartments} 
        />

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
                handleReset={() => setUserData(DEFAULT_USER_DATA)} 
              />
            )}
            {activeTab === 'settings' && <Settings data={userData} setData={setUserData} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
