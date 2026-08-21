'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Server,
  Activity,
  ArrowUpRight,
  Plus,
  ShieldCheck,
  Zap,
  RefreshCw,
  Layers,
  ChevronRight,
  TrendingUp,
  FileText
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/v1/incidents');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setIncidents(data);
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalIncidents = incidents.length;

  const unassignedCount = incidents.filter((i) => {
    const dept = (i.department || '').toUpperCase();
    const assigned = (i.assignedTo || '').toUpperCase();
    return dept.includes('UNASSIGNED') || assigned.includes('UNASSIGNED') || dept === '';
  }).length;

  const activeCount = incidents.filter((i) => {
    const st = (i.state || '').toUpperCase();
    return st === 'NEW' || st === 'IN_PROGRESS' || st === 'IN PROGRESS' || st === 'ON_HOLD' || st === 'ON HOLD';
  }).length;

  const resolvedCount = incidents.filter((i) => {
    const st = (i.state || '').toUpperCase();
    return st === 'RESOLVED' || st === 'CLOSED';
  }).length;

  const p1Count = incidents.filter((i) => (i.priority || '').includes('P1')).length;
  const p2Count = incidents.filter((i) => (i.priority || '').includes('P2')).length;

  const stats = [
    { name: 'Total Database Incidents', value: totalIncidents.toLocaleString(), change: 'PostgreSQL DB', icon: Server, color: 'text-[#1e6844]', border: 'border-[#30bb7b]/30' },
    { name: 'Unassigned Queue', value: unassignedCount.toLocaleString(), change: 'Pending AI Dispatch', icon: Clock, color: 'text-rose-600', border: 'border-rose-300' },
    { name: 'Active In Progress', value: activeCount.toLocaleString(), change: 'In Triage & Diagnostics', icon: AlertTriangle, color: 'text-amber-600', border: 'border-amber-300' },
    { name: 'Resolved & Closed', value: resolvedCount.toLocaleString(), change: 'Successfully Solved', icon: CheckCircle2, color: 'text-emerald-600', border: 'border-emerald-300' },
  ];

  // Top recent incidents
  const recentIncidents = [...incidents]
    .sort((a, b) => {
      const numA = parseInt((a.number || a.id || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.number || b.id || '').replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    })
    .slice(0, 6);

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. Context Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">Service Operations Workspace</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-extrabold flex items-center gap-1.5">
            ServiceNow Executive Dashboard
            <span className="px-1.5 py-0.2 rounded bg-[#f1f5f9] text-[#1e6844] font-mono text-[10px] font-bold border border-[#cbd5e1]">
              Live Telemetry
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchDashboardData}
            className="p-1.5 rounded bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-[#cbd5e1] transition cursor-pointer shadow-xs"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#30bb7b]' : ''}`} />
          </button>

          <Link
            href="/incidents"
            className="px-3 py-1.5 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Open Incident Matrix</span>
          </Link>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl mx-auto w-full">
        {/* Banner */}
        <div className="bg-white border border-[#e2e8f0] p-5 rounded-lg shadow-sm border-l-4 border-l-[#30bb7b] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#1e6844] uppercase tracking-wider mb-1 font-mono">
              <Zap className="w-4 h-4 text-[#30bb7b]" /> Enterprise SRE Command Overview
            </div>
            <h1 className="text-lg md:text-xl font-extrabold text-slate-900">ServiceNow IT Service Management Portal</h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Real-time synchronization across 1,035 incident records, 49 Master SOP Runbooks, and autonomous resolution daemons.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded bg-rose-50 border border-rose-200 text-xs font-mono font-bold text-rose-700">
              P1 Critical: {p1Count}
            </span>
            <span className="px-3 py-1.5 rounded bg-orange-50 border border-orange-200 text-xs font-mono font-bold text-orange-700">
              P2 High: {p2Count}
            </span>
          </div>
        </div>

        {/* 4-KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.name}
                className="bg-white border border-[#e2e8f0] rounded-lg p-4 shadow-sm space-y-2 hover:border-[#cbd5e1] transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{s.name}</span>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono text-slate-900">{s.value}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{s.change}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Incidents Table */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden shadow-sm space-y-3 p-4">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#30bb7b]" />
              Recent Incidents Stream
            </h3>
            <Link
              href="/incidents"
              className="text-xs text-[#0284c7] hover:underline font-bold flex items-center gap-1"
            >
              <span>View All 1,035 Records</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f1f5f9] border-b border-[#e2e8f0] text-[#475569] font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-2.5 font-bold text-slate-900">Number</th>
                  <th className="p-2.5">Short Description</th>
                  <th className="p-2.5">Priority</th>
                  <th className="p-2.5">State</th>
                  <th className="p-2.5">Assignment Group</th>
                  <th className="p-2.5">Target CI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {recentIncidents.map((inc, idx) => (
                  <tr
                    key={inc.id || inc.number}
                    className={`hover:bg-[#f1f5f9] transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}
                  >
                    <td className="p-2.5 font-mono font-bold text-[#0284c7]">
                      <Link href={`/incidents/${inc.id || inc.number}`} className="hover:underline">
                        {inc.number || inc.id}
                      </Link>
                    </td>
                    <td className="p-2.5 font-medium text-slate-800 truncate max-w-sm">
                      {inc.shortDescription || inc.title}
                    </td>
                    <td className="p-2.5 font-mono font-bold">
                      {(inc.priority || '').includes('P1') ? (
                        <span className="text-rose-600">1 - Critical</span>
                      ) : (inc.priority || '').includes('P2') ? (
                        <span className="text-orange-600">2 - High</span>
                      ) : (
                        <span className="text-amber-700">3 - Moderate</span>
                      )}
                    </td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#e6f7ef] text-[#1e6844] border border-[#30bb7b]/30">
                        {inc.state || 'NEW'}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-700">{inc.department || 'UNASSIGNED'}</td>
                    <td className="p-2.5 font-mono text-[11px] text-slate-600">{inc.configurationItem || inc.ci || 'Unspecified CI'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
