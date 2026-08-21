'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  GitCommit,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  ShieldCheck,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertTriangle,
  FileCheck,
  Calendar,
  Layers,
  Filter,
  Info,
  Save,
  Lock,
  Menu,
  Activity,
  Settings,
  MessageSquare
} from 'lucide-react';

interface ChangeRecord {
  id: string;
  number: string;
  title: string;
  description: string;
  changeType: string;
  state: string;
  approvalState: string;
  riskScore: number;
  configurationItem: string;
  assignedTo: string;
  requestedBy: string;
  plannedStartDate: string;
  plannedEndDate: string;
  implementationPlan: string;
  backoutPlan: string;
  cabNotes: string;
  createdAt: string;
  updatedAt: string;
}

export default function ChangesPage() {
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('All');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [approvalFilter, setApprovalFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedChange, setSelectedChange] = useState<ChangeRecord | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    changeType: 'NORMAL',
    configurationItem: 'router-border-nyc-01',
    riskScore: 2,
    plannedStartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    plannedEndDate: new Date(Date.now() + 97200000).toISOString().slice(0, 16),
    implementationPlan: '',
    backoutPlan: '',
  });

  const [editForm, setEditForm] = useState({
    state: '',
    approvalState: '',
    riskScore: 2,
    cabNotes: '',
    implementationPlan: '',
    backoutPlan: '',
  });

  const fetchChanges = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/changes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setChanges(data);
        }
      }
    } catch (err) {
      console.error('Failed to load changes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChanges();
    const interval = setInterval(fetchChanges, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title) return;
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });

      if (res.ok) {
        const created = await res.json();
        setChanges((prev) => [created, ...prev]);
        setIsCreateModalOpen(false);
        setCreateForm({
          title: '',
          description: '',
          changeType: 'NORMAL',
          configurationItem: 'router-border-nyc-01',
          riskScore: 2,
          plannedStartDate: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
          plannedEndDate: new Date(Date.now() + 97200000).toISOString().slice(0, 16),
          implementationPlan: '',
          backoutPlan: '',
        });
      }
    } catch (err) {
      console.error('Failed to create change:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateChange = async (changeId: string) => {
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/v1/changes/${changeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (res.ok) {
        const updated = await res.json();
        setChanges((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSelectedChange(updated);
      }
    } catch (err) {
      console.error('Failed to update change:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredChanges = useMemo(() => {
    return changes.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.configurationItem.toLowerCase().includes(q) ||
        (c.assignedTo || '').toLowerCase().includes(q);

      const matchesType = typeFilter === 'ALL' || c.changeType === typeFilter;
      const matchesState = stateFilter === 'ALL' || c.state === stateFilter;
      const matchesApproval = approvalFilter === 'ALL' || c.approvalState === approvalFilter;

      return matchesSearch && matchesType && matchesState && matchesApproval;
    });
  }, [changes, search, typeFilter, stateFilter, approvalFilter]);

  const totalPages = Math.ceil(filteredChanges.length / pageSize) || 1;
  const paginatedChanges = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredChanges.slice(start, start + pageSize);
  }, [filteredChanges, page]);

  return (
    <div className="flex flex-col min-h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. Sub-Header with Dropdown Search & Fast Pagination */}
      <div className="bg-white border-b border-[#cbd5e1] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <button className="p-1 hover:bg-slate-100 rounded text-slate-700 cursor-pointer">
            <Menu className="w-4 h-4" />
          </button>

          <span className="text-sm font-extrabold text-[#1a2c30] tracking-tight">
            Change Orders
          </span>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-600 font-medium">Search</span>
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value)}
              className="bg-white border border-[#cbd5e1] rounded px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-[#288554]"
            >
              <option value="All">for text</option>
              <option value="Number">Change ID</option>
              <option value="Title">Title</option>
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
            to {Math.min(page * pageSize, filteredChanges.length)} of {filteredChanges.length}
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
            All &gt; Type is {typeFilter === 'ALL' ? 'All Types' : typeFilter} &gt; Active = true
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white border border-[#cbd5e1] text-slate-800 text-xs rounded px-2 py-1 focus:outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="STANDARD">Standard</option>
            <option value="NORMAL">Normal</option>
            <option value="EMERGENCY">Emergency</option>
          </select>

          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white border border-[#cbd5e1] text-slate-800 text-xs rounded px-2 py-1 focus:outline-none"
          >
            <option value="ALL">All States</option>
            <option value="NEW">New</option>
            <option value="ASSESS">Assess / CAB</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IMPLEMENT">Implement</option>
            <option value="REVIEW">Review</option>
            <option value="CLOSED">Closed</option>
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
                    <span className="text-[10px] text-slate-400">☰</span> Change Number
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Short Description
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Type
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1 cursor-pointer text-[#288554]">
                    <span className="text-[10px]">☰</span> State ▼
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Approval
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Configuration Item
                  </span>
                </th>
                <th className="p-2.5 whitespace-nowrap font-extrabold text-[#1a2c30]">
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">☰</span> Assigned To
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-500 font-medium">
                    Querying Change records from database...
                  </td>
                </tr>
              ) : paginatedChanges.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-500 font-medium">
                    No change records match the active query.
                  </td>
                </tr>
              ) : (
                paginatedChanges.map((item, idx) => (
                  <tr
                    key={item.id}
                    onClick={() => {
                      setSelectedChange(item);
                      setEditForm({
                        state: item.state,
                        approvalState: item.approvalState,
                        riskScore: item.riskScore,
                        cabNotes: item.cabNotes || '',
                        implementationPlan: item.implementationPlan || '',
                        backoutPlan: item.backoutPlan || '',
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
                    </td>
                    <td className="p-2.5 font-medium text-[#2d3748] max-w-md truncate" title={item.title}>
                      {item.title}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.changeType === 'EMERGENCY'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : item.changeType === 'NORMAL'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {item.changeType}
                      </span>
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#e6f7ef] text-[#1e6844] border border-[#30bb7b]/30">
                        {item.state}
                      </span>
                    </td>
                    <td className="p-2.5 whitespace-nowrap text-[#2d3748] font-medium">
                      {item.approvalState === 'APPROVED' ? (
                        <span className="text-emerald-700 font-bold">Approved</span>
                      ) : item.approvalState === 'REQUESTED' ? (
                        <span className="text-amber-700 font-bold">CAB Review</span>
                      ) : (
                        <span className="text-slate-500">Not Requested</span>
                      )}
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-[#2d3748] underline hover:text-[#0284c7] whitespace-nowrap">
                      {item.configurationItem}
                    </td>
                    <td className="p-2.5 text-[#2d3748] whitespace-nowrap">{item.assignedTo || 'Unassigned'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Change Detail Modal */}
      {selectedChange && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1a2c30] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm">Change Order: {selectedChange.id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-100 text-blue-900 font-bold">
                  {selectedChange.changeType}
                </span>
              </div>
              <button
                onClick={() => setSelectedChange(null)}
                className="p-1 rounded text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs bg-[#f8fafc]">
              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-2">
                <label className="block text-slate-700 font-bold">Change Title</label>
                <div className="text-sm font-bold text-slate-900">{selectedChange.title}</div>
              </div>

              {/* Implementation Plan Yellow Box */}
              <div className="bg-[#fffbeb] p-4 rounded border border-[#fde68a] shadow-sm space-y-2">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Implementation Runbook & Execution Steps</span>
                </div>
                <textarea
                  rows={3}
                  value={editForm.implementationPlan}
                  onChange={(e) => setEditForm({ ...editForm, implementationPlan: e.target.value })}
                  className="w-full bg-white border border-[#fde68a] rounded p-2 text-xs text-amber-950 font-mono focus:outline-none"
                />
              </div>

              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-2">
                <label className="block text-slate-700 font-bold">Rollback / Backout Plan</label>
                <textarea
                  rows={2}
                  value={editForm.backoutPlan}
                  onChange={(e) => setEditForm({ ...editForm, backoutPlan: e.target.value })}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 font-mono focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedChange(null)}
                  className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateChange(selectedChange.id)}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold transition shadow-sm cursor-pointer disabled:opacity-40"
                >
                  {isSubmitting ? 'Saving...' : 'Save Change Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
