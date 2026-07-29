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
  ShieldAlert,
  Terminal,
  FileText,
  Tag,
  Flame,
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
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [knownErrorOnly, setKnownErrorOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

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
    const interval = setInterval(fetchProblems, 5000);
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
      const matchesSearch =
        p.id.toLowerCase().includes(search.toLowerCase()) ||
        p.shortDescription.toLowerCase().includes(search.toLowerCase()) ||
        p.configurationItem.toLowerCase().includes(search.toLowerCase()) ||
        (p.rootCause || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.workaround || '').toLowerCase().includes(search.toLowerCase());

      const matchesPriority = priorityFilter === 'ALL' || p.priority === priorityFilter;
      const matchesState = stateFilter === 'ALL' || p.state === stateFilter;
      const matchesKnownError = !knownErrorOnly || p.knownError;

      return matchesSearch && matchesPriority && matchesState && matchesKnownError;
    });
  }, [problems, search, priorityFilter, stateFilter, knownErrorOnly]);

  const totalPages = Math.ceil(filteredProblems.length / pageSize);
  const paginatedProblems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProblems.slice(start, start + pageSize);
  }, [filteredProblems, page]);

  return (
    <div className="p-8 space-y-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Flame className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                Problem Management Workspace
                <span className="text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold font-mono">
                  Known Error Database (KEDB)
                </span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Investigate systemic underlying root causes, document workarounds, and publish Known Error articles.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchProblems}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            Log New Problem Record
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>TOTAL PROBLEM RECORDS</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-white">{problems.length}</div>
          <p className="text-[11px] text-slate-500">Persistent Problem Database</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>PUBLISHED KNOWN ERRORS</span>
            <BookOpen className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-3xl font-black text-purple-400">
            {problems.filter((p) => p.knownError).length}
          </div>
          <p className="text-[11px] text-slate-500">Documented in KEDB</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>UNDER INVESTIGATION</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-black text-blue-400">
            {problems.filter((p) => p.state === 'UNDER_INVESTIGATION' || p.state === 'NEW').length}
          </div>
          <p className="text-[11px] text-slate-500">Active Engineering Triage</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>RESOLVED PROBLEMS</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400">
            {problems.filter((p) => p.state === 'RESOLVED' || p.state === 'CLOSED').length}
          </div>
          <p className="text-[11px] text-slate-500">Root Cause Fixed</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search problems by ID (e.g. PRB0000005), title, root cause, CI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-3 text-xs w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setKnownErrorOnly(!knownErrorOnly)}
            className={`px-3 py-2 rounded-lg font-bold transition border ${
              knownErrorOnly
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {knownErrorOnly ? '★ Known Errors Only' : 'All Problems & Errors'}
          </button>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="P1">P1 - Critical</option>
            <option value="P2">P2 - High</option>
            <option value="P3">P3 - Moderate</option>
            <option value="P4">P4 - Low</option>
          </select>

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All States</option>
            <option value="NEW">NEW</option>
            <option value="UNDER_INVESTIGATION">UNDER_INVESTIGATION</option>
            <option value="KNOWN_ERROR">KNOWN_ERROR</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
      </div>

      {/* Problems Data Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Problem ID</th>
              <th className="px-6 py-4">Priority / State</th>
              <th className="px-6 py-4">Short Description & Root Cause</th>
              <th className="px-6 py-4">Configuration Item</th>
              <th className="px-6 py-4">Assigned Engineer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {paginatedProblems.map((item) => (
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
                className="hover:bg-slate-800/40 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4 font-mono font-bold text-amber-400 flex items-center gap-2">
                  {item.id}
                  {item.knownError && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      KEDB
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 space-y-1">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${
                      item.priority === 'P1'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : item.priority === 'P2'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {item.priority}
                  </span>
                  <div className="text-[10px] text-slate-400 font-semibold">{item.state}</div>
                </td>
                <td className="px-6 py-4 max-w-md">
                  <div className="font-semibold text-slate-100">{item.shortDescription}</div>
                  <div className="text-slate-400 text-[11px] truncate">
                    <span className="text-rose-400 font-mono font-bold">Root Cause:</span>{' '}
                    {item.rootCause || 'Under investigation'}
                  </div>
                </td>
                <td className="px-6 py-4 font-mono font-bold text-indigo-300">
                  {item.configurationItem}
                </td>
                <td className="px-6 py-4 font-semibold text-slate-200">{item.assignedTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
        <span>
          Showing {filteredProblems.length > 0 ? (page - 1) * pageSize + 1 : 0} -{' '}
          {Math.min(page * pageSize, filteredProblems.length)} of {filteredProblems.length} Problem Records
        </span>

        <div className="flex items-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 transition"
          >
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <span className="font-mono font-bold text-slate-200 px-2">
            Page {page} of {Math.max(1, totalPages)}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 transition"
          >
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Create Problem Record Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400" /> Log New Problem Record
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProblem} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Short Description / Title *</label>
                <input
                  type="text"
                  required
                  value={createForm.shortDescription}
                  onChange={(e) => setCreateForm({ ...createForm, shortDescription: e.target.value })}
                  placeholder="e.g. Systemic Core BGP Router Packet Loss under load"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Priority</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="P1">P1 - CRITICAL</option>
                    <option value="P2">P2 - HIGH</option>
                    <option value="P3">P3 - MODERATE</option>
                    <option value="P4">P4 - LOW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Configuration Item (CI)</label>
                  <input
                    type="text"
                    value={createForm.configurationItem}
                    onChange={(e) => setCreateForm({ ...createForm, configurationItem: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-indigo-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Technical Root Cause</label>
                <textarea
                  rows={2}
                  value={createForm.rootCause}
                  onChange={(e) => setCreateForm({ ...createForm, rootCause: e.target.value })}
                  placeholder="e.g. Unindexed SQL query performing table scan during peak hours"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Workaround Instructions</label>
                <textarea
                  rows={2}
                  value={createForm.workaround}
                  onChange={(e) => setCreateForm({ ...createForm, workaround: e.target.value })}
                  placeholder="e.g. Flush connection pool proxy and run sysctl tw_reuse parameter tuning"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <input
                  type="checkbox"
                  id="createKnownError"
                  checked={createForm.knownError}
                  onChange={(e) => setCreateForm({ ...createForm, knownError: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700"
                />
                <label htmlFor="createKnownError" className="text-xs text-slate-200 font-bold cursor-pointer">
                  Publish as Known Error in KEDB Catalog
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
                >
                  {isSubmitting ? 'Saving...' : 'Save Problem Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Problem Detail & Edit Drawer Modal */}
      {selectedProblem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 md:p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono mb-1">
                  <span className="font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
                    {selectedProblem.id}
                  </span>
                  <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded font-bold">
                    State: {selectedProblem.state}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white">{selectedProblem.shortDescription}</h2>
              </div>
              <button onClick={() => setSelectedProblem(null)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Configuration Item</span>
                <span className="font-mono text-indigo-300 font-bold">{selectedProblem.configurationItem}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Assigned Engineer</span>
                <span className="font-bold text-slate-200">{selectedProblem.assignedTo}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Related Incidents</span>
                <span className="font-bold text-amber-400">{selectedProblem.relatedIncidentsCount} Incident Telemetry Alerts</span>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">State</label>
                <select
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-bold focus:outline-none"
                >
                  <option value="NEW">NEW</option>
                  <option value="UNDER_INVESTIGATION">UNDER_INVESTIGATION</option>
                  <option value="KNOWN_ERROR">KNOWN_ERROR</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Technical Root Cause Analysis</label>
                <textarea
                  rows={3}
                  value={editForm.rootCause}
                  onChange={(e) => setEditForm({ ...editForm, rootCause: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-rose-300 font-medium focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Documented Workaround Instructions</label>
                <textarea
                  rows={3}
                  value={editForm.workaround}
                  onChange={(e) => setEditForm({ ...editForm, workaround: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-emerald-300 font-mono focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <input
                  type="checkbox"
                  id="editKnownError"
                  checked={editForm.knownError}
                  onChange={(e) => setEditForm({ ...editForm, knownError: e.target.checked })}
                  className="w-4 h-4 rounded text-purple-500 focus:ring-purple-500 bg-slate-900 border-slate-700"
                />
                <label htmlFor="editKnownError" className="text-xs text-purple-300 font-bold cursor-pointer">
                  Publish to Known Error Database (KEDB)
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button onClick={() => setSelectedProblem(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-bold">
                Close
              </button>
              <button
                onClick={() => handleUpdateProblem(selectedProblem.id)}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
              >
                {isSubmitting ? 'Saving...' : 'Update Problem Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
