'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import {
  Search,
  ExternalLink,
  Radio,
  HelpCircle,
  MessageSquare,
  ChevronDown,
  User,
  Settings,
  LogOut,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export function Topbar() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const displayName = user?.firstName || 'Venu';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="h-12 bg-[#162224] border-b border-[#24373a] px-4 flex items-center justify-between z-30 shrink-0 select-none text-white">
      {/* Left: ServiceNow Classic Logo & Instance Release */}
      <div className="flex items-center gap-3">
        <Link href="/incidents" className="flex items-center gap-2 group cursor-pointer">
          <div className="flex items-baseline gap-1">
            <span className="font-extrabold text-base tracking-tight text-white font-sans">
              servicenow<span className="text-[#30bb7b] font-black text-lg">.</span>
            </span>
            <span className="text-xs font-semibold text-slate-200 ml-1.5 hidden sm:inline">
              Service Management
            </span>
          </div>
        </Link>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 max-w-lg mx-6 hidden md:block">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search ServiceNow global records (⌘ /)..."
            className="w-full bg-[#0e1719] border border-[#2e4348] focus:border-[#30bb7b] rounded-full pl-9 pr-8 py-1 text-xs text-white placeholder-slate-400 focus:outline-none transition"
          />
          <span className="absolute right-2.5 text-[10px] text-slate-400 font-mono border border-slate-700 px-1.5 py-0.2 rounded bg-[#162224]">
            /
          </span>
        </div>
      </div>

      {/* Right: User Profile & Quick Actions */}
      <div className="flex items-center gap-3">
        {/* Agent Control Tower Link Button */}
        <a
          href="http://localhost:5173"
          target="_blank"
          rel="noreferrer"
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#288554] hover:bg-[#30bb7b] text-white text-[11px] font-bold transition shadow-sm cursor-pointer"
          title="Launch Agent Control Tower"
        >
          <Radio className="w-3 h-3 animate-pulse" />
          <span>Control Tower</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-80" />
        </a>

        {/* Header Utilities */}
        <div className="flex items-center gap-2 border-l border-[#2e4348] pl-3 relative" ref={dropdownRef}>
          <button className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-[#22363a] transition cursor-pointer" title="Conversations">
            <MessageSquare className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-[#22363a] transition cursor-pointer" title="Help & Documentation">
            <HelpCircle className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-[#22363a] transition cursor-pointer" title="Settings">
            <Settings className="w-4 h-4" />
          </button>

          {/* User Profile Pill & Dropdown */}
          <div
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 ml-1 cursor-pointer hover:bg-[#22363a] py-1 px-2 rounded transition"
          >
            <div className="w-6 h-6 rounded-full bg-[#288554] text-white font-bold text-xs flex items-center justify-center border border-[#30bb7b]">
              {initial}
            </div>
            <span className="text-xs font-semibold text-slate-200 hidden sm:inline">{displayName}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </div>

          {/* User Profile Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-11 w-64 bg-white border border-[#cbd5e1] rounded-lg shadow-2xl z-50 text-slate-800 text-xs overflow-hidden animate-in fade-in slide-in-from-top-1">
              <div className="bg-[#1a2c30] text-white p-3 border-b border-[#2e4348]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#288554] text-white font-bold text-sm flex items-center justify-center border border-[#30bb7b]">
                    {initial}
                  </div>
                  <div className="truncate">
                    <div className="font-extrabold text-sm text-white">{displayName}</div>
                    <div className="text-[10px] text-slate-300 font-mono">Operator ID: Venu</div>
                  </div>
                </div>
              </div>

              <div className="p-2 space-y-1">
                <div className="px-3 py-1.5 text-[11px] text-slate-600 bg-slate-50 rounded border border-slate-100 font-medium">
                  <div className="flex items-center justify-between">
                    <span>Role:</span>
                    <strong className="text-[#1a2c30]">Global Admin & SRE</strong>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span>Instance:</span>
                    <strong className="text-[#288554]">Washington DC</strong>
                  </div>
                </div>

                <Link
                  href="/admin"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>User Administration (sys_user)</span>
                </Link>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-rose-50 text-rose-700 font-bold transition cursor-pointer text-left border-t border-slate-100 mt-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out of ServiceNow</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
