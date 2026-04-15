/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Search, HelpCircle, BookOpen, LayoutDashboard, 
  Building2, ClipboardList, Users, CreditCard, 
  BarChart3, CheckCircle2, Zap, Info, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '../lib/utils';

interface HelpGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const AccordionItem: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ title, icon, children, isOpen, onToggle }) => (
  <div className="border-b border-zinc-100 last:border-0">
    <button 
      onClick={onToggle}
      className="w-full flex items-center justify-between py-4 px-2 hover:bg-zinc-50 transition-colors text-left group"
    >
      <div className="flex items-center gap-3">
        <div className="text-emerald-500 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <span className="font-bold text-zinc-900">{title}</span>
      </div>
      {isOpen ? <ChevronUp size={18} className="text-zinc-400" /> : <ChevronDown size={18} className="text-zinc-400" />}
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="pb-6 px-2 text-sm text-zinc-500 leading-relaxed space-y-4">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export const HelpGuide: React.FC<HelpGuideProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [openItems, setOpenItems] = useState<string[]>(["getting-started"]);

  const toggleItem = (id: string) => {
    setOpenItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const topics = [
    {
      id: "daily-actions",
      title: "What should I do today?",
      icon: <CheckCircle2 size={20} className="text-emerald-500" />,
      content: (
        <div className="space-y-3">
          <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Recommended Daily Tasks:</p>
          <div className="space-y-2">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <p className="text-xs">Add today's <strong>Cleaning Records</strong> for check-outs.</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <p className="text-xs">Check <strong>Upcoming Alerts</strong> for due rent cheques.</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <p className="text-xs">Review <strong>Pending Payments</strong> to vendors.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "getting-started",
      title: "1. Getting Started",
      icon: <BookOpen size={20} />,
      content: (
        <div className="space-y-4">
          <p>Welcome to your <strong>Short-Term Rental Management Dashboard</strong>. Follow these steps to set up and manage your portfolio successfully:</p>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
              <div>
                <p className="font-bold text-zinc-900">Add Property</p>
                <p className="text-xs">Go to <strong>Setup</strong> to add your apartments, rental details, and cheques.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
              <div>
                <p className="font-bold text-zinc-900">Add Booking</p>
                <p className="text-xs">Import from Airbnb/Booking.com or manually add reservations in <strong>Reservations</strong>.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
              <div>
                <p className="font-bold text-zinc-900">Manage Guest Stay</p>
                <p className="text-xs">Track check-ins/outs and guest details in the <strong>Dashboard</strong> or <strong>Reservations</strong>.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">4</div>
              <div>
                <p className="font-bold text-zinc-900">Record Service</p>
                <p className="text-xs">After checkout, record cleaning or maintenance tasks in <strong>Operations</strong>.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "dashboard-overview",
      title: "2. Dashboard Overview",
      icon: <LayoutDashboard size={20} />,
      content: (
        <div className="space-y-3">
          <p>The <strong>Dashboard</strong> is your mission control. Here is what you will find:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Portfolio Overview:</strong> Key stats like Total Revenue, Occupancy, and Net Profit.</li>
            <li><strong>Upcoming Alerts:</strong> Reminders for due rent cheques and tasks.</li>
            <li><strong>Revenue Trend:</strong> A visual chart of your monthly performance.</li>
            <li><strong>Navigation:</strong> Use the sidebar to switch between different modules.</li>
          </ul>
        </div>
      )
    },
    {
      id: "properties-module",
      title: "3. Properties Module",
      icon: <Building2 size={20} />,
      content: (
        <div className="space-y-3">
          <p>Managed in the <strong>Setup</strong> tab, this is where you define your assets:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Add Property:</strong> Enter the name, building, and rental details.</li>
            <li><strong>Rent Cheques:</strong> Record your annual rent payments to track ROI accurately.</li>
            <li><strong>Setup Costs:</strong> Track initial furniture and legal costs to see when you break even.</li>
          </ul>
          <p className="text-xs italic text-zinc-400">Tip: Use a unique nickname for each property to find them quickly in lists.</p>
        </div>
      )
    },
    {
      id: "bookings-module",
      title: "4. Bookings / Reservations",
      icon: <ClipboardList size={20} />,
      content: (
        <div className="space-y-3">
          <p>Track all guest stays in the <strong>Reservations</strong> tab:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Import Data:</strong> Upload CSV files from Airbnb or Booking.com to save time.</li>
            <li><strong>Manual Entry:</strong> Add direct bookings or walk-ins manually.</li>
            <li><strong>Status Tracking:</strong> Monitor Confirmed vs. Cancelled bookings.</li>
          </ul>
          <p className="text-xs italic text-zinc-400">Note: Linking bookings to the correct property is essential for accurate profit reports.</p>
        </div>
      )
    },
    {
      id: "operations-guide",
      title: "5. Operations Module",
      icon: <Users size={20} />,
      content: (
        <div className="space-y-4">
          <section>
            <p className="font-bold text-zinc-900 mb-1">Vendors</p>
            <p>A <strong>Vendor</strong> is any person or company providing services (Cleaning, Maintenance, Laundry). Add them first to start tracking their work and payments.</p>
          </section>
          <section>
            <p className="font-bold text-zinc-900 mb-1">Service Records</p>
            <p>Add a record every time work is done. <strong>Example:</strong> "After checkout, add a cleaning record with the agreed cost." This increases the amount you owe the vendor.</p>
          </section>
          <section className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
            <p className="font-bold text-zinc-900 mb-2">Understanding Vendor Balance</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-bold">Work Done</p>
                <p>Total value of services provided.</p>
              </div>
              <div>
                <p className="font-bold">Paid</p>
                <p>Total money you have sent.</p>
              </div>
              <div>
                <p className="font-bold text-rose-600">Pending</p>
                <p>Amount you still need to pay.</p>
              </div>
              <div>
                <p className="font-bold text-emerald-600">Advance</p>
                <p>Extra amount paid for future work.</p>
              </div>
            </div>
          </section>
        </div>
      )
    },
    {
      id: "reports-insights",
      title: "6. Reports & Insights",
      icon: <BarChart3 size={20} />,
      content: (
        <div className="space-y-3">
          <p>Make data-driven decisions using our reporting tools:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Performance Analytics:</strong> Compare properties by Revenue, ADR, and Occupancy.</li>
            <li><strong>ROI Tracking:</strong> See how long it takes to recover your setup costs and rent.</li>
            <li><strong>Occupancy Heatmap:</strong> Visualize your booking density across the portfolio.</li>
          </ul>
        </div>
      )
    }
  ];

  const filteredTopics = useMemo(() => {
    if (!searchQuery) return topics;
    const query = searchQuery.toLowerCase();
    return topics.filter(t => 
      t.title.toLowerCase().includes(query) || 
      t.id.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col"
          >
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-900 text-white">
              <div className="flex items-center gap-3">
                <HelpCircle className="text-emerald-500" />
                <h2 className="text-xl font-black tracking-tight uppercase">Help & User Guide</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 bg-zinc-50 border-b border-zinc-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search help topics..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            <div className="flex-grow overflow-y-auto p-6 space-y-2 custom-scrollbar">
              {filteredTopics.length > 0 ? (
                filteredTopics.map(topic => (
                  <AccordionItem 
                    key={topic.id}
                    title={topic.title}
                    icon={topic.icon}
                    isOpen={openItems.includes(topic.id)}
                    onToggle={() => toggleItem(topic.id)}
                  >
                    {topic.content}
                  </AccordionItem>
                ))
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search size={24} className="text-zinc-300" />
                  </div>
                  <p className="text-zinc-400 font-bold">No help topics found</p>
                  <p className="text-xs text-zinc-400 mt-1">Try searching for "Operations" or "Vendors"</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-zinc-100 bg-zinc-50">
              <div className="flex items-start gap-3 p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                <Info size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-zinc-900">Need more help?</p>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                    If you can't find what you're looking for, please contact our support team at <span className="text-emerald-600 font-bold">support@str-manager.com</span>
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
