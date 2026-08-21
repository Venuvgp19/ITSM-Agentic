'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  Zap,
  BookOpen,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldAlert,
  Terminal,
  FileText,
  Tag,
  Flame,
  Filter,
  Info,
  Save,
  Check,
  Lock,
  MessageSquare,
  Activity,
  Menu,
  Settings
} from 'lucide-react';

interface ProblemRecord {
  id: string;
  number: string;
  shortDescription: string;
  description: string;
  rootCause: string;
  workaround: string;
  knownError: boolean;
  state: string;
  priority: string;
  configurationItem: string;
  assignedTo: string;
  relatedIncidentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function ProblemsPage() {
  const [problems, setProblems] = useState<ProblemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [knownErrorOnly, setKnownErrorOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedProblem, setSelectedProblem] = useState<ProblemRecord | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [createForm, setCreateForm] = useState({
    shortDescription: '',
    description: '',
    configurationItem: 'router-border-nyc-01',
    priority: 'P2',
    state: 'NEW',
    rootCause: '',
    workaround: '',
    knownError: false,
  });

  const [editForm, setEditForm] = useState({
    state: '',
    priority: '',
    rootCause: '',
    workaround: '',
    knownError: false,
  });

  const fetchProblems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/problems');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setProblems(data);
        }
      }
    } catch (err) {
      console.error('Failed to load problems:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProblems();
    const interval = setInterval(fetchProblems, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.shortDescription) return;
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });

      if (res.ok) {
        const created = await res.json();
        setProblems((prev) => [created, ...prev]);
        setIsCreateModalOpen(false);
        setCreateForm({
          shortDescription: '',
          description: '',
          configurationItem: 'router-border-nyc-01',
          priority: 'P2',
          state: 'NEW',
          rootCause: '',
          workaround: '',
          knownError: false,
        });
      }
    } catch (err) {
      console.error('Failed to create problem:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProblem = async (problemId: string) => {
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/v1/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (res.ok) {
        const updated = await res.json();
        setProblems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setSelectedProblem(updated);
      }
    } catch (err) {
      console.error('Failed to update problem:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProblems = useMemo(() => {
    return problems.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        p.id.toLowerCase().includes(q) ||
        p.shortDescription.toLowerCase().includes(q) ||
        p.configurationItem.toLowerCase().includes(q) ||
        (p.rootCause || '').toLowerCase().includes(q) ||
        (p.workaround || '').toLowerCase().includes(q);

      const matchesPriority = priorityFilter === 'ALL' || p.priority === priorityFilter;
      const matchesState = stateFilter === 'ALL' || p.state === stateFilter;
      const matchesKnownError = !knownErrorOnly || p.knownError;

      return matchesSearch && matchesPriority && matchesState && matchesKnownError;
    });
  }, [problems, search, priorityFilter, stateFilter, knownErrorOnly]);

  const totalPages = Math.ceil(filteredProblems.length / pageSize) || 1;
  const paginatedProblems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProblems.slice(start, start + pageSize);
  }, [filteredProblems, page]);

  return (
    <div className="flex flex-col min-h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. ServiceNow Sub-Header with Dropdown Search & Pagination controls */}
      <div className="bg-white border-b border-[#cbd5e1] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <button className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer">
            <Menu className="w-4 h-4" />
          </button>

          <span className="text-sm font-extrabold text-[#1a2c30] tracking-tight">
            Problems
          </span>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-600 font-medium">Search</span>
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value)}
              className="bg-white border border-[#cbd5e1] rounded px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-[#288554]"
            >
              <option value="All">for text</option>
              <option value="Number">Problem ID</option>
              <option value="Short Description">Short Description</option>
              <option value="CI">Configuration Item</option>
            </select>

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

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3 py-1 bg-[#288554] hover:bg-[#30bb7b] text-white font-bold rounded flex items-center gap-1 transition cursor-pointer shadow-xs text-xs ml-2"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>New</span>
          </button>
        </div>

        {/* Right: Fast Navigation Bar */}
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
            to {Math.min(page * pageSize, filteredProblems.length)} of {filteredProblems.length}
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
            All &gt; State != Closed &gt; Active = true
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setKnownErrorOnly(!knownErrorOnly)}
            className={`px-2.5 py-1 rounded text-xs font-bold transition border cursor-pointer ${
              knownErrorOnly
                ? 'bg-purple-50 text-purple-800 border-purple-300'
                : 'bg-white text-slate-700 border-[#cbd5e1] hover:bg-slate-50'
            }`}
          >
            {knownErrorOnly ? '★ Known Errors (KEDB)' : 'All Problems & KEDB'}
          </button>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white border border-[#cbd5e1] text-slate-800 text-xs rounded px-2 py-1 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="P1">1 - Critical</option>
            <option value="P2">2 - High</option>
            <option value="P3">3 - Moderate</option>
            <option value="P4">4 - Low</option>
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
                  <Settings className="w-3.5 h-3.5 cursor-pointer text-slate-500 hover:text-[#288554]" />
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1 cursor-pointer hover:text-[#0284c7]">
                    <span className="text-[10px] text-slate-400">☰</span> Problem ID
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Short Description
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Root Cause Summary
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
                    <span className="text-[10px] text-slate-400">☰</span> Configuration Item
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Assigned Engineer
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-500 font-medium">
                    Querying Problem records from database...
                  </td>
                </tr>
              ) : paginatedProblems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-500 font-medium">
                    No problem records match the active query.
                  </td>
                </tr>
              ) : (
                paginatedProblems.map((item, idx) => (
                  <tr
                    key={item.id}
                    onClick={() => {
                      setSelectedProblem(item);
                      setEditForm({
                        state: item.state,
                        priority: item.priority,
                        rootCause: item.rootCause,
                        workaround: item.workaround,
                        knownError: item.knownError,
                      });
                    }}
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
                      {item.id}
                      {item.knownError && (
                        <span className="ml-1 px-1 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          KEDB
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 font-medium text-[#2d3748] max-w-sm truncate" title={item.shortDescription}>
                      {item.shortDescription}
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-slate-600 max-w-xs truncate">
                      {item.rootCause || 'Under investigation'}
                    </td>
                    <td className="p-2.5 whitespace-nowrap font-bold">
                      {item.priority === 'P1' ? (
                        <span className="text-rose-700">1 - Critical</span>
                      ) : item.priority === 'P2' ? (
                        <span className="text-orange-700">2 - High</span>
                      ) : (
                        <span className="text-amber-800">3 - Moderate</span>
                      )}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#e6f7ef] text-[#1e6844] border border-[#30bb7b]/30">
                        {item.state}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-[#2d3748] underline hover:text-[#0284c7] whitespace-nowrap">
                      {item.configurationItem}
                    </td>
                    <td className="p-2.5 text-[#2d3748] whitespace-nowrap">{item.assignedTo}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Problem Detail Modal */}
      {selectedProblem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1a2c30] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm">Problem Record: {selectedProblem.id}</span>
                {selectedProblem.knownError && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-100 text-purple-900 font-bold">
                    Known Error Article
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedProblem(null)}
                className="p-1 rounded text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs bg-[#f8fafc]">
              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-2">
                <label className="block text-slate-700 font-bold">Short Description</label>
                <div className="text-sm font-bold text-slate-900">{selectedProblem.shortDescription}</div>
              </div>

              {/* Workaround Yellow Box */}
              <div className="bg-[#fffbeb] p-4 rounded border border-[#fde68a] shadow-sm space-y-2">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Documented Workaround (Internal / Service Desk)</span>
                </div>
                <textarea
                  rows={3}
                  value={editForm.workaround}
                  onChange={(e) => setEditForm({ ...editForm, workaround: e.target.value })}
                  className="w-full bg-white border border-[#fde68a] rounded p-2 text-xs text-amber-950 font-mono focus:outline-none"
                />
              </div>

              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-2">
                <label className="block text-slate-700 font-bold">Systemic Root Cause</label>
                <textarea
                  rows={3}
                  value={editForm.rootCause}
                  onChange={(e) => setEditForm({ ...editForm, rootCause: e.target.value })}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 font-mono focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedProblem(null)}
                  className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateProblem(selectedProblem.id)}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold transition shadow-sm cursor-pointer disabled:opacity-40"
                >
                  {isSubmitting ? 'Saving...' : 'Save Problem Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
