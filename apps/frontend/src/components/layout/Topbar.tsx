'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { Search, Bell, Command, Shield, LogOut } from 'lucide-react';

export function Topbar() {
  const router = useRouter();
  const { user, isAuthenticated, logout, init } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    init();
    setMounted(true);
  }, [init]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const displayName = mounted && user ? `${user.firstName} ${user.lastName}` : 'System Admin';
  const displayEmail = mounted && user?.email ? user.email : 'admin@acme.com';
  const initials = mounted && user ? `${user.firstName[0]}${user.lastName[0] || ''}`.toUpperCase() : 'AD';
  const tenantName = mounted && user?.tenantName ? user.tenantName : 'Acme Global Tech';
  const isAuth = mounted ? isAuthenticated : false;

  return (
    <header className="h-16 bg-slate-900/60 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Global Search Bar Command Palette Trigger */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <div
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 hover:border-slate-700 text-slate-400 text-xs px-3.5 py-2 rounded-lg w-full cursor-pointer transition-all shadow-inner"
        >
          <Search className="w-4 h-4 text-slate-500" />
          <span className="flex-1">Search CIs, Incidents, Knowledge Articles, Workflows...</span>
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
            <Command className="w-3 h-3" /> K
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Tenant Indicator */}
        <div className="hidden sm:flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full text-xs text-slate-300 font-medium">
          <Shield className="w-3.5 h-3.5 text-brand-400" />
          <span suppressHydrationWarning>{tenantName}</span>
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-800 transition">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-500 ring-2 ring-slate-900"></span>
        </button>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-600 to-brand-600 flex items-center justify-center font-bold text-xs text-white shadow-md" suppressHydrationWarning>
            {initials}
          </div>
          <div className="hidden md:block text-left">
            <div className="text-xs font-semibold text-slate-200" suppressHydrationWarning>{displayName}</div>
            <div className="text-[10px] text-slate-400" suppressHydrationWarning>{displayEmail}</div>
          </div>

          {isAuth ? (
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-400 transition ml-1"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition"
            >
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
