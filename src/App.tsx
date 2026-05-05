/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardList, PlusCircle, FileText, Settings, Menu, X } from "lucide-react";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";

// Views
import DashboardView from "./views/DashboardView";
import InspectionsView from "./views/InspectionsView";
import CreateInspectionView from "./views/CreateInspectionView";
import ReportView from "./views/ReportView";
import DebugView from "./views/DebugView";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/inspections", label: "Inspections", icon: ClipboardList },
  { path: "/create", label: "New Inspection", icon: PlusCircle },
  { path: "/reports", label: "Reports", icon: FileText },
];

function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex font-sans overflow-hidden h-screen">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-slate-900 text-slate-300 shrink-0 print:hidden">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">HouseKeep OS</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                location.pathname === item.path
                  ? "bg-slate-800 text-white italic"
                  : "hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white uppercase">
              US
            </div>
            <div className="text-[10px]">
              <p className="font-semibold text-white">Operator</p>
              <p className="opacity-60 uppercase tracking-wider">Lead Inspector</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Nav Toggle */}
      <div className="md:hidden fixed top-4 right-4 z-50 print:hidden">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2.5 bg-white shadow-lg rounded-lg border border-slate-200"
        >
          {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed inset-0 z-40 bg-slate-900 p-10 md:hidden"
          >
             <nav className="flex flex-col gap-4 pt-16">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-4 text-xl font-bold p-4 rounded-xl",
                      location.pathname === item.path ? "text-blue-500 bg-slate-800" : "text-white"
                    )}
                  >
                    <item.icon size={24} />
                    {item.label}
                  </Link>
                ))}
             </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 print:hidden">
          <h2 className="text-lg font-semibold capitalize">
            {location.pathname === '/' ? 'Operations Dashboard' : location.pathname.replace('/', '')}
          </h2>
          <div className="flex items-center gap-4">
            <div className="hidden lg:block relative text-slate-400 focus-within:text-blue-500">
               <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                 <LayoutDashboard size={14} />
               </span>
               <input 
                 type="text" 
                 placeholder="Search sheet data..." 
                 className="pl-10 pr-4 py-1.5 bg-slate-100 border-none rounded-lg text-xs w-64 focus:ring-1 focus:ring-blue-500"
               />
            </div>
            <Link to="/create" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
              <PlusCircle size={16} />
              New Inspection
            </Link>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6 print:overflow-visible print:p-0">
          <div className="max-w-7xl mx-auto w-full">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </div>
        </main>

        {/* Footer Bar */}
        <footer className="flex justify-between items-center py-2 px-6 text-[11px] text-slate-500 border-t border-slate-200 bg-white shrink-0 print:hidden">
          <div className="flex gap-4">
            <span>Primary Sheet: <strong>Housekeep_DB</strong></span>
            <span>Auth: <strong>Service_Account</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="italic">Pro-Grade Inspection Tool</span>
            <div className="w-1 h-1 rounded-full bg-slate-300"></div>
            <span className="font-medium">v1.2.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardView />} />
          <Route path="/inspections" element={<InspectionsView />} />
          <Route path="/create" element={<CreateInspectionView />} />
          <Route path="/reports" element={<ReportView />} />
          <Route path="/debug" element={<DebugView />} />
        </Routes>
      </Layout>
    </Router>
  );
}

