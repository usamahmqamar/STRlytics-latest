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
  console.log("App component rendering...");
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
    if (!auth) {
      console.error("Firebase Auth not initialized");
      // Use a guest user for bypass
      setUser({ uid: 'guest_user', email: 'guest@example.com' } as any);
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        toast.success(`Welcome back, ${u.displayName || u.email}`, { id: 'auth-success' });
      } else {
        // BYPASS: Set a guest user if not logged in
        setUser({ uid: 'guest_user', email: 'guest@example.com' } as any);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listener
  useEffect(() => {
    if (!user || !db) {
      if (!db) console.error("Firestore DB not initialized");
      return;
    }

    const userDocRef = doc(db, 'user_data', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const rawData = snapshot.data();
        if (!rawData || !rawData.data) {
          console.warn("User document exists but 'data' field is missing. Initializing with defaults.");
          setUserData(DEFAULT_USER_DATA);
          setLoading(false);
          return;
        }
        const data = rawData.data as UserData;
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
          toast.error("Database quota reached", { id: 'quota-error' });
        } else {
          setSyncError("Failed to sync data. Please check your connection.");
          toast.error("Sync failed. Check connection.", { id: 'sync-error' });
        }
      });
    }, 2000); // Reduced to 2 seconds to ensure changes reflect quickly

    return () => clearTimeout(timer);
  }, [userData, user]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (!auth) {
      alert("Firebase Auth is not initialized. Please check your configuration.");
      return;
    }
    
    setIsLoggingIn(true);
    console.log("Attempting Google Sign-In...");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Login successful:", result.user.email);
    } catch (error: any) {
      console.error("Login Error:", error);
      
      let errorMessage = "An unexpected error occurred during login.";
      if (error.code === 'auth/popup-blocked') {
        errorMessage = "The login popup was blocked by your browser. Please allow popups for this site.";
      } else if (error.code === 'auth/unauthorized-domain') {
        errorMessage = `This domain (${window.location.hostname}) is not authorized in the Firebase Console. Please add it to Authentication > Settings > Authorized domains.`;
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = "Google Sign-In is not enabled in your Firebase project. Please enable it in the Firebase Console.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      alert(`Login Failed: ${errorMessage}`);
    } finally {
      setIsLoggingIn(false);
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

  if (!user && loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Sign-in is bypassed

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
        isSidebarCollapsed ? "ml-20" : "ml-64"
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
