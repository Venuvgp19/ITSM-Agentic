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
  AlertTriangle,
  FileCheck,
  Calendar,
  Layers,
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
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [approvalFilter, setApprovalFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

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
    const interval = setInterval(fetchChanges, 5000);
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
      console.error('Failed to create change order:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateChange = async (changeId: string, customPayload?: any) => {
    try {
      setIsSubmitting(true);
      const payload = customPayload || editForm;
      const res = await fetch(`/api/v1/changes/${changeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        setChanges((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSelectedChange(updated);
      }
    } catch (err) {
      console.error('Failed to update change order:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredChanges = useMemo(() => {
    return changes.filter((c) => {
      const matchesSearch =
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.configurationItem.toLowerCase().includes(search.toLowerCase()) ||
        c.assignedTo.toLowerCase().includes(search.toLowerCase());

      const matchesType = typeFilter === 'ALL' || c.changeType === typeFilter;
      const matchesState = stateFilter === 'ALL' || c.state === stateFilter;
      const matchesApproval = approvalFilter === 'ALL' || c.approvalState === approvalFilter;

      return matchesSearch && matchesType && matchesState && matchesApproval;
    });
  }, [changes, search, typeFilter, stateFilter, approvalFilter]);

  const totalPages = Math.ceil(filteredChanges.length / pageSize);
  const paginatedChanges = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredChanges.slice(start, start + pageSize);
  }, [filteredChanges, page]);

  return (
    <div className="p-8 space-y-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400">
              <GitCommit className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                Change Advisory Board (CAB) & Orders
                <span className="text-xs px-3 py-1 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/30 font-semibold font-mono">
                  ITIL v4 Change Management
                </span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Evaluate risk, authorize Requests for Change (RFC), schedule maintenance windows, and enforce backout plans.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchChanges}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold text-xs shadow-lg shadow-brand-500/20 flex items-center gap-2 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            Submit Request for Change (RFC)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>TOTAL CHANGE ORDERS</span>
            <GitCommit className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-3xl font-black text-white">{changes.length}</div>
          <p className="text-[11px] text-slate-500">Persistent Change Catalog</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>EMERGENCY RFCS</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-black text-rose-400">
            {changes.filter((c) => c.changeType === 'EMERGENCY').length}
          </div>
          <p className="text-[11px] text-slate-500">High Risk Fast-Track</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>AWAITING CAB APPROVAL</span>
            <FileCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400">
            {changes.filter((c) => c.approvalState === 'REQUESTED').length}
          </div>
          <p className="text-[11px] text-slate-500">Pending Review & Sign-off</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>APPROVED & SCHEDULED</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400">
            {changes.filter((c) => c.approvalState === 'APPROVED' || c.state === 'SCHEDULED').length}
          </div>
          <p className="text-[11px] text-slate-500">Maintenance Window Set</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search change orders by ID (e.g. CHG0000010), title, CI, assignee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="flex items-center gap-3 text-xs w-full md:w-auto overflow-x-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Change Types</option>
            <option value="STANDARD">STANDARD</option>
            <option value="NORMAL">NORMAL</option>
            <option value="EMERGENCY">EMERGENCY</option>
          </select>

          <select
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All CAB Approvals</option>
            <option value="NOT_REQUESTED">NOT_REQUESTED</option>
            <option value="REQUESTED">REQUESTED</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All States</option>
            <option value="DRAFT">DRAFT</option>
            <option value="ASSESS">ASSESS</option>
            <option value="AUTHORIZE">AUTHORIZE</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="IMPLEMENTATION">IMPLEMENTATION</option>
            <option value="REVIEW">REVIEW</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
      </div>

      {/* Change Orders Data Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Change ID</th>
              <th className="px-6 py-4">Type / Risk</th>
              <th className="px-6 py-4">Change Title & CI</th>
              <th className="px-6 py-4">CAB Approval</th>
              <th className="px-6 py-4">State</th>
              <th className="px-6 py-4">Assigned Team</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {paginatedChanges.map((item) => (
              <tr
                key={item.id}
                onClick={() => {
                  setSelectedChange(item);
                  setEditForm({
                    state: item.state,
                    approvalState: item.approvalState,
                    riskScore: item.riskScore,
                    cabNotes: item.cabNotes,
                    implementationPlan: item.implementationPlan,
                    backoutPlan: item.backoutPlan,
                  });
                }}
                className="hover:bg-slate-800/40 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4 font-mono font-bold text-brand-400">{item.id}</td>
                <td className="px-6 py-4 space-y-1">
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${
                      item.changeType === 'EMERGENCY'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : item.changeType === 'NORMAL'
                        ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {item.changeType}
                  </span>
                  <div className="text-[10px] text-slate-400 font-semibold">Risk Lvl: {item.riskScore}/5</div>
                </td>
                <td className="px-6 py-4 max-w-md">
                  <div className="font-semibold text-slate-100">{item.title}</div>
                  <div className="text-indigo-300 font-mono text-[11px] font-bold">
                    Target CI: {item.configurationItem}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded-full ${
                      item.approvalState === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : item.approvalState === 'REQUESTED'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : item.approvalState === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.approvalState}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-slate-200">{item.state}</td>
                <td className="px-6 py-4 font-semibold text-slate-300">{item.assignedTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
        <span>
          Showing {filteredChanges.length > 0 ? (page - 1) * pageSize + 1 : 0} -{' '}
          {Math.min(page * pageSize, filteredChanges.length)} of {filteredChanges.length} Change Orders
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

      {/* Log RFC Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                <GitCommit className="w-5 h-5 text-brand-400" /> Submit Request for Change (RFC) Order
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateChange} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Change Order Title *</label>
                <input
                  type="text"
                  required
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Upgrade NYC Border Router Firmware to v15.4"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Change Type</label>
                  <select
                    value={createForm.changeType}
                    onChange={(e) => setCreateForm({ ...createForm, changeType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="EMERGENCY">EMERGENCY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Target CI</label>
                  <input
                    type="text"
                    value={createForm.configurationItem}
                    onChange={(e) => setCreateForm({ ...createForm, configurationItem: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-indigo-300 font-mono font-bold focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Risk Score (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={createForm.riskScore}
                    onChange={(e) => setCreateForm({ ...createForm, riskScore: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-bold focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Implementation Step-by-Step Plan</label>
                <textarea
                  rows={2}
                  value={createForm.implementationPlan}
                  onChange={(e) => setCreateForm({ ...createForm, implementationPlan: e.target.value })}
                  placeholder="e.g. 1. Pre-backup configuration. 2. Install patch. 3. Run health diagnostic."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Backout / Rollback Procedure</label>
                <textarea
                  rows={2}
                  value={createForm.backoutPlan}
                  onChange={(e) => setCreateForm({ ...createForm, backoutPlan: e.target.value })}
                  placeholder="e.g. Revert to OS partition B snapshot and reset BGP routes."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
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
                  className="px-5 py-2 rounded-lg bg-brand-500 text-slate-950 font-bold shadow-lg shadow-brand-500/20"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit RFC to CAB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Order Detail & CAB Approval Drawer Modal */}
      {selectedChange && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 md:p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono mb-1">
                  <span className="font-bold text-brand-400 bg-brand-500/10 px-2.5 py-1 rounded border border-brand-500/20">
                    {selectedChange.id}
                  </span>
                  <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded font-bold">
                    Type: {selectedChange.changeType}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white">{selectedChange.title}</h2>
              </div>
              <button onClick={() => setSelectedChange(null)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action CAB Approval Buttons */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">CAB Quick Approval Actions</span>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  onClick={() => handleUpdateChange(selectedChange.id, { approvalState: 'APPROVED', state: 'SCHEDULED' })}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" /> Approve Change Order
                </button>
                <button
                  onClick={() => handleUpdateChange(selectedChange.id, { approvalState: 'REJECTED', state: 'CLOSED' })}
                  className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <X className="w-4 h-4" /> Reject RFC
                </button>
                <button
                  onClick={() => handleUpdateChange(selectedChange.id, { approvalState: 'REQUESTED', state: 'AUTHORIZE' })}
                  className="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold transition cursor-pointer"
                >
                  Request CAB Review
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Configuration Item</span>
                <span className="font-mono text-indigo-300 font-bold">{selectedChange.configurationItem}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Assigned CAB Team</span>
                <span className="font-bold text-slate-200">{selectedChange.assignedTo}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Risk Assessment</span>
                <span className="font-bold text-rose-400">Level {selectedChange.riskScore} / 5</span>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">State</label>
                  <select
                    value={editForm.state}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-bold focus:outline-none"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="ASSESS">ASSESS</option>
                    <option value="AUTHORIZE">AUTHORIZE</option>
                    <option value="SCHEDULED">SCHEDULED</option>
                    <option value="IMPLEMENTATION">IMPLEMENTATION</option>
                    <option value="REVIEW">REVIEW</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Approval Status</label>
                  <select
                    value={editForm.approvalState}
                    onChange={(e) => setEditForm({ ...editForm, approvalState: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-emerald-400 font-bold focus:outline-none"
                  >
                    <option value="NOT_REQUESTED">NOT_REQUESTED</option>
                    <option value="REQUESTED">REQUESTED</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Implementation Step-by-Step Plan</label>
                <textarea
                  rows={3}
                  value={editForm.implementationPlan}
                  onChange={(e) => setEditForm({ ...editForm, implementationPlan: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Backout / Rollback Procedure</label>
                <textarea
                  rows={3}
                  value={editForm.backoutPlan}
                  onChange={(e) => setEditForm({ ...editForm, backoutPlan: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-amber-300 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">CAB Notes & Recommendations</label>
                <textarea
                  rows={2}
                  value={editForm.cabNotes}
                  onChange={(e) => setEditForm({ ...editForm, cabNotes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-purple-300 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button onClick={() => setSelectedChange(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-bold">
                Close
              </button>
              <button
                onClick={() => handleUpdateChange(selectedChange.id)}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-brand-500 text-slate-950 font-bold shadow-lg shadow-brand-500/20"
              >
                {isSubmitting ? 'Saving...' : 'Save Change Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
