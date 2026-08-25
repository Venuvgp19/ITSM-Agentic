'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
  Tag,
  User,
  Server,
  Database,
  Lock,
  BarChart3,
  TrendingUp,
  PieChart,
  Activity,
  Cpu,
  Layers,
  Sparkles,
  Brain,
  Filter,
  SlidersHorizontal,
  Info,
  ChevronDown,
  X,
  Check,
  Calendar,
  Settings,
  MessageSquare,
  Menu
} from 'lucide-react';

import { IncidentAnalysisReport } from '@/components/IncidentAnalysisReport';

export const ASSIGNMENT_GROUP_MEMBERS: Record<string, string[]> = {
  'Unix': [
    'Richard Stallman',
    'Linus Torvalds',
    'Ken Thompson',
    'Dennis Ritchie',
  ],
  'Network Ops': [
    'Sarah Connor',
    'Vint Cerf',
    'Radia Perlman',
    'Bob Kahn',
  ],
  'App Support': [
    'Alex Mercer',
    'Ada Lovelace',
    'Grace Hopper',
    'Margaret Hamilton',
  ],
  'Desktop Support': [
    'David Miller',
    'Alan Turing',
    'Tim Berners-Lee',
    'John von Neumann',
  ],
  'DBA Team': [
    'Edgar Codd',
    'Michael Stonebraker',
    'Jim Gray',
    'Larry Ellison',
  ],
  'SecOps': [
    'Bruce Schneier',
    'Gene Spafford',
    'Whitfield Diffie',
    'Dorothy Denning',
  ],
  'DevOps Ops': [
    'Kelsey Hightower',
    'Brendan Burns',
    'Werner Vogels',
    'Adrian Cockcroft',
  ],
  'UNASSIGNED (No Team)': [
    'Unassigned',
  ],
};

const departments = [
  'UNASSIGNED (No Team)',
  'Unix',
  'Network Ops',
  'App Support',
  'Desktop Support',
  'DevOps Ops',
  'SecOps',
  'DBA Team',
];

const FALLBACK_CIS = ['Unspecified CI', 'control plane', 'WorkerNode1HL'];
const callers = ['Monitoring Bot', 'Sarah Connor', 'David Miller', 'Alex Mercer', 'System Admin', 'Richard Stallman'];

export default function IncidentsPage() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('All');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'matrix' | 'analysis'>('matrix');
  const [ciOptions, setCiOptions] = useState<string[]>(FALLBACK_CIS);

  // ServiceNow Incident Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState({
    shortDescription: '',
    description: '',
    impact: 'DEPARTMENT',
    urgency: 'HIGH',
    department: 'UNASSIGNED (No Team)',
    assignedTo: 'UNASSIGNED (Unassigned)',
    caller: 'System Admin',
    ci: 'control plane',
    resolutionCode: 'Pending Triage',
    resolutionNotes: '',
    state: 'NEW',
  });

  const formatDateTimeStr = (dt?: string | Date | null) => {
    if (!dt) return '2026-08-21 15:25:34';
    if (typeof dt === 'string') {
      const trimmed = dt.trim();
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(trimmed)) {
        return trimmed.slice(0, 19);
      }
      const time12Match = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)/i);
      if (time12Match) {
        let hours = parseInt(time12Match[1], 10);
        const minutes = time12Match[2];
        const seconds = time12Match[3] || '00';
        const ampm = time12Match[4].toLowerCase();
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        const hh = hours.toString().padStart(2, '0');
        const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
        const datePart = dateMatch ? dateMatch[1] : '2026-08-21';
        return `${datePart} ${hh}:${minutes}:${seconds}`;
      }
    }
    try {
      const d = new Date(dt);
      if (isNaN(d.getTime())) return String(dt);
      return d.toISOString().replace('T', ' ').slice(0, 19);
    } catch {
      return String(dt);
    }
  };

  const handleModalDeptChange = (newDept: string) => {
    const eligible = ASSIGNMENT_GROUP_MEMBERS[newDept] || ['UNASSIGNED (Unassigned)'];
    setFormState((prev) => ({
      ...prev,
      department: newDept,
      assignedTo: eligible.includes(prev.assignedTo) ? prev.assignedTo : eligible[0],
    }));
  };

  const loadIncidentsFromDatabase = async () => {
    try {
      const res = await fetch('/api/v1/incidents');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const apiMapped = data.map((inc: any) => {
            const incDept = inc.department || 'UNASSIGNED (No Team)';
            const eligibleForDept = ASSIGNMENT_GROUP_MEMBERS[incDept] || ['UNASSIGNED (Unassigned)'];
            let mappedAssigned = inc.assignedTo || inc.assignedToName || eligibleForDept[0];
            
            // If the assigned person in database is unassigned but department is Unix/etc., map to valid group member
            if (!eligibleForDept.includes(mappedAssigned) && incDept !== 'UNASSIGNED (No Team)') {
              mappedAssigned = eligibleForDept[0];
            }

            return {
              id: inc.id,
              number: inc.number || inc.id,
              title: inc.shortDescription || inc.title,
              priority: (inc.priority || '').includes('P1') ? '1 - Critical' : (inc.priority || '').includes('P2') ? '2 - High' : (inc.priority || '').includes('P3') ? '3 - Moderate' : '4 - Low',
              state: inc.state || 'NEW',
              caller: inc.caller || 'System Admin',
              department: incDept,
              assignedTo: mappedAssigned,
              ci: inc.configurationItem || 'Unspecified CI',
              resolutionCode: inc.resolutionCode || 'Pending Triage',
              resolutionNotes: inc.resolutionNotes || '',
              openedAt: inc.openedAt || inc.createdAt,
              openedAtFormatted: formatDateTimeStr(inc.openedAt || inc.createdAt),
            };
          });
          setIncidents(apiMapped);
        }
      }
    } catch {
      // Backend handles fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIncidentsFromDatabase();
    const interval = setInterval(loadIncidentsFromDatabase, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch('/api/v1/cmdb/ci')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return;
        const names = data.map((c: any) => c.name).filter(Boolean).sort();
        setCiOptions(['Unspecified CI', ...names]);
      })
      .catch(() => {});
  }, []);

  const isUnassignedIncident = (inc: any) => {
    const d = (inc.department || '').trim().toUpperCase();
    const a = (inc.assignedTo || '').trim().toUpperCase();
    return d === 'UNASSIGNED (NO TEAM)' || d === 'UNASSIGNED' || a === 'UNASSIGNED (UNASSIGNED)' || a === 'UNASSIGNED' || a === '';
  };

  const computedPriority = useMemo(() => {
    if (formState.impact === 'ENTERPRISE' && formState.urgency === 'CRITICAL') return 'P1';
    if (formState.impact === 'DEPARTMENT' && formState.urgency === 'CRITICAL') return 'P2';
    if (formState.impact === 'USER' && formState.urgency === 'LOW') return 'P4';
    return 'P3';
  }, [formState.impact, formState.urgency]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        (inc.number && inc.number.toLowerCase().includes(q)) ||
        (inc.title && inc.title.toLowerCase().includes(q)) ||
        (inc.caller && inc.caller.toLowerCase().includes(q)) ||
        (inc.ci && inc.ci.toLowerCase().includes(q)) ||
        (inc.department && inc.department.toLowerCase().includes(q)) ||
        (inc.assignedTo && inc.assignedTo.toLowerCase().includes(q)) ||
        (inc.openedAtFormatted && inc.openedAtFormatted.toLowerCase().includes(q));

      const matchesDept =
        deptFilter === 'ALL'
          ? true
          : deptFilter.includes('UNASSIGNED')
          ? isUnassignedIncident(inc)
          : inc.department === deptFilter;

      const matchesPriority = priorityFilter === 'ALL' || inc.priority.includes(priorityFilter);
      const matchesState = stateFilter === 'ALL' || inc.state === stateFilter;

      return matchesSearch && matchesDept && matchesPriority && matchesState;
    });
  }, [incidents, search, deptFilter, priorityFilter, stateFilter]);

  const totalPages = Math.ceil(filteredIncidents.length / pageSize) || 1;
  const paginatedIncidents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredIncidents.slice(start, start + pageSize);
  }, [filteredIncidents, page, pageSize]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.shortDescription) return;

    setIsSubmitting(true);

    const payload = {
      shortDescription: formState.shortDescription,
      description: formState.description || formState.shortDescription,
      impact: formState.impact,
      urgency: formState.urgency,
      department: formState.department,
      assignedTo: formState.assignedTo,
      caller: formState.caller,
      configurationItem: formState.ci,
      resolutionCode: formState.resolutionCode || 'Pending Triage',
      resolutionNotes: formState.resolutionNotes || 'Unassigned ticket pending triage.',
      state: formState.state,
      priority: computedPriority,
    };

    try {
      const res = await fetch('/api/v1/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer demo-jwt-access-token-itsm',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await loadIncidentsFromDatabase();
      }
    } catch {
      // Backend handles fallback
    } finally {
      setIsSubmitting(false);
      setIsModalOpen(false);
      setFormState({
        shortDescription: '',
        description: '',
        impact: 'DEPARTMENT',
        urgency: 'HIGH',
        department: 'UNASSIGNED (No Team)',
        assignedTo: 'UNASSIGNED (Unassigned)',
        caller: 'System Admin',
        ci: 'control plane',
        resolutionCode: 'Pending Triage',
        resolutionNotes: '',
        state: 'NEW',
      });
    }
  };

  const modalEligibleMembers = ASSIGNMENT_GROUP_MEMBERS[formState.department] || ['UNASSIGNED (Unassigned)'];

  return (
    <div className="flex flex-col min-h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. ServiceNow Sub-Header with Dropdown Search & Pagination controls */}
      <div className="bg-white border-b border-[#cbd5e1] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Left: Hamburger & Title & Search by Column */}
        <div className="flex items-center gap-3 flex-wrap">
          <button className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer">
            <Menu className="w-4 h-4" />
          </button>

          <span className="text-sm font-extrabold text-[#1a2c30] tracking-tight">
            Incidents
          </span>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-600 font-medium">Search</span>
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value)}
              className="bg-white border border-[#cbd5e1] rounded px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-[#288554]"
            >
              <option value="All">for text</option>
              <option value="Number">Number</option>
              <option value="Short Description">Short Description</option>
              <option value="Caller">Caller</option>
              <option value="CI">Configuration Item</option>
            </select>

            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search..."
                className="bg-white border border-[#cbd5e1] focus:border-[#288554] rounded px-2.5 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none w-44 transition"
              />
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1 bg-[#288554] hover:bg-[#30bb7b] text-white font-bold rounded flex items-center gap-1 transition cursor-pointer shadow-xs text-xs ml-2"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>New</span>
          </button>
        </div>

        {/* Right: Activity pulse & Fast Navigation Bar */}
        <div className="flex items-center gap-2 text-xs text-slate-700 font-mono">
          <Activity className="w-4 h-4 text-[#288554] mr-1" />

          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="p-1 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
            title="First Page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="border border-[#cbd5e1] bg-white px-2 py-0.5 rounded text-slate-900 font-bold">
            {page}
          </span>

          <span className="text-slate-600 text-[11px]">
            to {Math.min(page * pageSize, filteredIncidents.length)} of {filteredIncidents.length}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="p-1 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
            title="Last Page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Filter Condition Breadcrumbs */}
      <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-mono">
          <MessageSquare className="w-3.5 h-3.5 text-[#288554]" />
          <Filter className="w-3.5 h-3.5 text-[#288554]" />
          <span className="text-[#1a2c30] font-bold">
            All &gt; Assignment group is {deptFilter === 'ALL' ? 'All Operations' : deptFilter} &gt; Active = true
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Assignment Group Filter */}
          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white border border-[#cbd5e1] text-slate-800 text-xs rounded px-2 py-1 focus:outline-none"
          >
            <option value="ALL">All Groups</option>
            <option value="UNASSIGNED (No Team)">⚡ UNASSIGNED (No Team)</option>
            {departments.filter(d => !d.includes('UNASSIGNED')).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white border border-[#cbd5e1] text-slate-800 text-xs rounded px-2 py-1 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="1 - Critical">1 - Critical</option>
            <option value="2 - High">2 - High</option>
            <option value="3 - Moderate">3 - Moderate</option>
            <option value="4 - Low">4 - Low</option>
          </select>
        </div>
      </div>

      {/* 3. High-Contrast ServiceNow Light Data Table */}
      <div className="flex-1 bg-white">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-white border-b-2 border-[#cbd5e1] text-[#2d3748] font-bold text-[11px] sticky top-0 z-10 select-none">
                <th className="p-2.5 w-8 text-center">
                  <input type="checkbox" className="rounded border-slate-400 text-[#288554] focus:ring-0" />
                </th>
                <th className="p-2.5 w-10 text-center text-[#288554]">
                  <span className="flex items-center justify-center gap-1">
                    <Settings className="w-3.5 h-3.5 cursor-pointer text-slate-500 hover:text-[#288554]" />
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1 cursor-pointer hover:text-[#0284c7]">
                    <span className="text-[10px] text-slate-400">☰</span> Number
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Short Description
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Configuration Item
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1 cursor-pointer text-[#288554]">
                    <span className="text-[10px]">☰</span> Priority ▼
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> State
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Assignment Group
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Assigned To
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Opened Date & Time
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-slate-500 font-medium">
                    Querying ServiceNow PostgreSQL database records...
                  </td>
                </tr>
              ) : paginatedIncidents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-slate-500 font-medium">
                    No incident records match the active query.
                  </td>
                </tr>
              ) : (
                paginatedIncidents.map((inc, idx) => (
                  <tr
                    key={inc.id}
                    onClick={() => router.push(`/incidents/${inc.id}`)}
                    className={`transition-colors cursor-pointer ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-[#f2f4f7]'
                    } hover:bg-[#e6f0f2]`}
                  >
                    <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="rounded border-slate-400 text-[#288554] focus:ring-0" />
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="w-4 h-4 rounded-full border border-[#288554] text-[#288554] flex items-center justify-center font-bold text-[10px] mx-auto hover:bg-[#288554] hover:text-white transition">
                        i
                      </div>
                    </td>
                    <td className="p-2.5 font-mono font-bold text-[#1a2c30] underline hover:text-[#0284c7] whitespace-nowrap">
                      {inc.number}
                    </td>
                    <td className="p-2.5 font-medium text-[#2d3748] max-w-md truncate" title={inc.title}>
                      {inc.title}
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-[#2d3748] underline hover:text-[#0284c7] whitespace-nowrap">
                      {inc.ci}
                    </td>
                    <td className="p-2.5 whitespace-nowrap font-bold">
                      {inc.priority.includes('1') ? (
                        <span className="text-rose-700">1 - Critical</span>
                      ) : inc.priority.includes('2') ? (
                        <span className="text-orange-700">2 - High</span>
                      ) : (
                        <span className="text-amber-800">3 - Moderate</span>
                      )}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#e6f7ef] text-[#1e6844] border border-[#30bb7b]/30">
                        {inc.state}
                      </span>
                    </td>
                    <td className="p-2.5 text-[#2d3748] whitespace-nowrap">{inc.department}</td>
                    <td className="p-2.5 text-[#2d3748] truncate max-w-[150px] whitespace-nowrap font-medium">{inc.assignedTo}</td>
                    <td className="p-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {inc.openedAtFormatted}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. ServiceNow Create Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1a2c30] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm">Incident - New Record</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#288554] text-white font-bold">
                  {computedPriority}
                </span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="p-6 space-y-6 overflow-y-auto flex-1 text-xs bg-[#f8fafc]">
              <div className="space-y-3 bg-white p-4 rounded border border-[#e2e8f0] shadow-sm">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Short Description <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.shortDescription}
                    onChange={(e) => setFormState({ ...formState, shortDescription: e.target.value })}
                    placeholder="Brief summary of the issue..."
                    className="w-full bg-white border border-[#cbd5e1] focus:border-[#288554] rounded p-2.5 text-xs text-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Detailed Description</label>
                  <textarea
                    rows={2}
                    value={formState.description}
                    onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                    placeholder="Enter diagnostic logs..."
                    className="w-full bg-white border border-[#cbd5e1] focus:border-[#288554] rounded p-2.5 text-xs text-slate-900 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-4 rounded border border-[#e2e8f0] shadow-sm">
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Caller</label>
                    <select
                      value={formState.caller}
                      onChange={(e) => setFormState({ ...formState, caller: e.target.value })}
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:outline-none"
                    >
                      {callers.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Configuration Item (CI)</label>
                    <select
                      value={formState.ci}
                      onChange={(e) => setFormState({ ...formState, ci: e.target.value })}
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:outline-none font-mono"
                    >
                      {ciOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Assignment Group</label>
                    <select
                      value={formState.department}
                      onChange={(e) => handleModalDeptChange(e.target.value)}
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#288554] focus:outline-none font-bold"
                    >
                      {departments.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">State</label>
                    <select
                      value={formState.state}
                      onChange={(e) => setFormState({ ...formState, state: e.target.value })}
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:outline-none"
                    >
                      <option value="NEW">New</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="ON_HOLD">On Hold</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Assigned To <span className="text-slate-400 font-normal">({formState.department} Only)</span>
                    </label>
                    <select
                      value={formState.assignedTo}
                      onChange={(e) => setFormState({ ...formState, assignedTo: e.target.value })}
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#288554] focus:outline-none font-medium"
                    >
                      {modalEligibleMembers.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formState.shortDescription}
                  className="px-5 py-2 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold transition shadow-sm cursor-pointer disabled:opacity-40"
                >
                  {isSubmitting ? 'Saving...' : 'Submit Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
