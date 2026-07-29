'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  AlertTriangle,
  Flame,
  GitCommit,
  Server,
  ShoppingBag,
  FileText,
  Workflow,
  FormInput,
  Settings,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Incidents', href: '/incidents', icon: AlertTriangle },
  { name: 'Problem Records', href: '/problems', icon: Flame },
  { name: 'Change Orders', href: '/changes', icon: GitCommit },
  { name: 'CMDB & Assets', href: '/cmdb', icon: Server },
  { name: 'Service Catalog', href: '/catalog', icon: ShoppingBag },
  { name: 'Knowledge Base', href: '/knowledge', icon: FileText },
  { name: 'Workflow Studio', href: '/studio/workflow-builder', icon: Workflow },
  { name: 'Form Designer', href: '/studio/form-builder', icon: FormInput },
  { name: 'Admin & Security', href: '/admin', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen select-none shrink-0">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/20 font-bold text-xl">
          S
        </div>
        <div>
          <h1 className="font-bold text-slate-100 text-sm tracking-wide">ENTERPRISE ITSM</h1>
          <p className="text-[10px] text-slate-400 font-medium">Cloud Service Platform</p>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold text-slate-500 tracking-wider uppercase">
          Workspaces & Modules
        </div>
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-3 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                isActive
                  ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 mr-3 ${isActive ? 'text-brand-400' : 'text-slate-500'}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[11px] font-medium text-slate-300">System Healthy</span>
        </div>
        <span className="text-[10px] text-slate-400">v1.0.0</span>
      </div>
    </aside>
  );
}
