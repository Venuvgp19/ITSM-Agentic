'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  FileQuestion,
  GitPullRequest,
  Server,
  BookOpen,
  LayoutDashboard,
  ShoppingBag,
  Settings,
  Search,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Zap,
  Radio,
  Archive,
  Star,
  Clock,
  Filter
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  badge?: string;
  isSubItem?: boolean;
}

interface NavSection {
  title: string;
  defaultOpen?: boolean;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: 'Incident Management',
    defaultOpen: true,
    items: [
      { label: 'Assigned to Me', href: '/incidents' },
      { label: 'Assigned to My Groups', href: '/incidents' },
      { label: 'Critical and High Risk', href: '/incidents' },
      { label: 'All Incidents', href: '/incidents', badge: '1,035' },
    ],
  },
  {
    title: 'Problem Management',
    defaultOpen: true,
    items: [
      { label: 'Known Error Database (KEDB)', href: '/problems' },
      { label: 'All Problems', href: '/problems' },
    ],
  },
  {
    title: 'Change Management',
    defaultOpen: false,
    items: [
      { label: 'Open Changes', href: '/changes' },
      { label: 'Change Calendar', href: '/changes' },
      { label: 'All Change Orders', href: '/changes' },
    ],
  },
  {
    title: 'Configuration (CMDB)',
    defaultOpen: false,
    items: [
      { label: 'Configuration Items (CIs)', href: '/cmdb' },
      { label: 'Dependency Views', href: '/cmdb' },
    ],
  },
  {
    title: 'Knowledge Base',
    defaultOpen: true,
    items: [
      { label: 'Master SOPs & Runbooks', href: '/knowledge', badge: '49' },
      { label: 'Published Articles', href: '/knowledge' },
    ],
  },
  {
    title: 'Service Catalog',
    defaultOpen: false,
    items: [
      { label: 'Catalog Items', href: '/catalog' },
      { label: 'My Requests', href: '/catalog' },
    ],
  },
  {
    title: 'Administration',
    defaultOpen: false,
    items: [
      { label: 'Users (sys_user)', href: '/admin' },
      { label: 'Roles & Permissions', href: '/admin' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [filterText, setFilterText] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'history'>('all');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'Incident Management': true,
    'Problem Management': true,
    'Knowledge Base': true,
    'Change Management': false,
    'Configuration (CMDB)': false,
    'Service Catalog': false,
    'Administration': false,
  });

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const filteredSections = sections
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((item) =>
        item.label.toLowerCase().includes(filterText.toLowerCase()) ||
        sec.title.toLowerCase().includes(filterText.toLowerCase())
      ),
    }))
    .filter((sec) => sec.items.length > 0);

  return (
    <aside className="w-64 bg-[#1a2c30] text-[#cfdcde] flex flex-col shrink-0 select-none z-20 border-r border-[#142225] font-sans">
      {/* 1. Filter Navigator Input */}
      <div className="p-2.5 bg-[#1a2c30] border-b border-[#142225]">
        <div className="relative flex items-center">
          <Filter className="w-3 h-3 absolute left-2.5 text-[#8fa3a8] pointer-events-none" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter navigator"
            className="w-full bg-[#142225] border border-[#2e4348] focus:border-[#30bb7b] rounded pl-8 pr-2.5 py-1 text-xs text-white placeholder-[#8fa3a8] focus:outline-none transition"
          />
        </div>

        {/* Navigator Sub-Tabs (All, Favorites, History) */}
        <div className="flex items-center justify-around mt-2 pt-1 border-t border-[#24373a] text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={`p-1.5 rounded transition cursor-pointer flex items-center justify-center w-8 ${
              activeTab === 'all'
                ? 'bg-[#2a444a] text-[#30bb7b] border border-[#30bb7b]/40'
                : 'text-[#8fa3a8] hover:text-white'
            }`}
            title="All Applications"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`p-1.5 rounded transition cursor-pointer flex items-center justify-center w-8 ${
              activeTab === 'favorites'
                ? 'bg-[#2a444a] text-amber-400 border border-amber-400/40'
                : 'text-[#8fa3a8] hover:text-white'
            }`}
            title="Favorites"
          >
            <Star className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`p-1.5 rounded transition cursor-pointer flex items-center justify-center w-8 ${
              activeTab === 'history'
                ? 'bg-[#2a444a] text-blue-400 border border-blue-400/40'
                : 'text-[#8fa3a8] hover:text-white'
            }`}
            title="History"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Menu Navigation Tree */}
      <div className="flex-1 overflow-y-auto py-2 space-y-1 text-xs scrollbar-thin">
        {filteredSections.map((section) => {
          const isOpen = openSections[section.title] ?? false;

          return (
            <div key={section.title} className="space-y-0.5">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.title)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-slate-100 hover:bg-[#22373c] font-bold text-xs cursor-pointer transition"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">
                    {isOpen ? '▼' : '►'}
                  </span>
                  <span className="truncate">{section.title}</span>
                </div>
              </button>

              {/* Section Items */}
              {isOpen && (
                <div className="space-y-0.5 pl-5 pr-2">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;

                    return (
                      <Link
                        key={item.label + item.href}
                        href={item.href}
                        className={`flex items-center justify-between px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                          isActive
                            ? 'bg-[#243f44] text-white font-bold border-l-2 border-[#30bb7b]'
                            : 'text-[#cfdcde] hover:bg-[#22373c] hover:text-white'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-[#142225] text-[#30bb7b] border border-[#2e4348]">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Footer System Status */}
      <div className="p-2.5 bg-[#142225] border-t border-[#24373a] text-[10px] text-[#8fa3a8] flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="w-2 h-2 rounded-full bg-[#30bb7b] animate-pulse"></span>
          <span>Washington DC</span>
        </div>
        <span className="text-[9px] font-mono text-slate-400">Node: 101</span>
      </div>
    </aside>
  );
}
