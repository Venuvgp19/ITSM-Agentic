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

  // Compute Real-Time Dynamic Metrics matching /incidents perfectly
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

  const stats = [
    { name: 'Total Database Incidents', value: totalIncidents.toLocaleString(), change: 'Disk JSON DB', changeType: 'neutral', icon: Server, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    { name: 'Unassigned Queue', value: unassignedCount.toLocaleString(), change: 'Pending AI Router', changeType: 'decrease', icon: Clock, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    { name: 'Active Incidents', value: activeCount.toLocaleString(), change: 'In Triage & Progress', changeType: 'increase', icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { name: 'Resolved & Closed', value: resolvedCount.toLocaleString(), change: 'Successfully Handled', changeType: 'increase', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  ];

  // Top recent incidents sorted descending
  const recentIncidents = [...incidents]
    .sort((a, b) => {
      const numA = parseInt((a.number || a.id || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.number || b.id || '').replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    })
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-brand-900/40 to-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-brand-400 uppercase tracking-wider mb-1">
            <Zap className="w-4 h-4" /> Enterprise Incident & Ops Command Center
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100">ITIL Service Management Overview</h1>
          <p className="text-xs text-slate-400 mt-1">Real-time status of Incidents, SLAs, Changes, and Infrastructure Configuration Items.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/incidents"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition shadow-lg shadow-brand-500/20"
          >
            <Plus className="w-4 h-4" /> Create Incident
          </Link>
          <Link
            href="/studio/workflow-builder"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition"
          >
            Workflow Studio
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className={`p-5 rounded-xl border backdrop-blur-md ${stat.bg} space-y-3`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.name}</span>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-slate-100 tracking-tight">{stat.value}</span>
                <span className="text-xs font-medium text-slate-400">{stat.change}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Split: Incident Feed & SLA Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incident Command Center Data Table Preview */}
        <div className="lg:col-span-2 glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-400" /> Real-Time Live Incident Stream
              </h2>
              <p className="text-xs text-slate-400">Live stream synchronized with backend database file (`incidents.json`).</p>
            </div>
            <Link href="/incidents" className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1">
              View All ({totalIncidents}) <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Number</th>
                  <th className="py-3 px-3">Short Description</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-3">State</th>
                  <th className="py-3 px-3">Department</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {recentIncidents.map((inc) => (
                  <tr key={inc.id || inc.number} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3 font-mono font-bold text-brand-400">
                      <Link href={`/incidents/${inc.id || inc.number}`} className="hover:underline">
                        {inc.number || inc.id}
                      </Link>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-200">{inc.shortDescription || inc.title}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        (inc.priority || '').includes('P1')
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : (inc.priority || '').includes('P2')
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {inc.priority || 'P4'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-300">{inc.state}</td>
                    <td className="py-3 px-3 text-slate-400">{inc.department || 'UNASSIGNED (No Team)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SLA & System Status */}
        <div className="glass-panel p-6 space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> SLA Target Compliance
            </h2>
            <p className="text-xs text-slate-400">Response & Resolution SLAs across business calendars.</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">P1 Critical Response (15 mins)</span>
                <span className="text-emerald-400">98.4%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '98.4%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">P2 High Resolution (4 hours)</span>
                <span className="text-brand-400">94.1%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: '94.1%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Service Request Fulfillment</span>
                <span className="text-amber-400">89.0%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '89%' }}></div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Upcoming CAB Change Review</span>
            <p className="text-xs text-slate-200 font-semibold">CHG0000842 - Migration to Kubernetes Cluster East-2</p>
            <p className="text-[11px] text-slate-400">Scheduled: Tomorrow at 20:00 UTC</p>
          </div>
        </div>
      </div>
    </div>
  );
}
