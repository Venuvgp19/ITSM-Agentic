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
  DollarSign,
} from 'lucide-react';

const sampleTitles = [
  'Core Router High Latency in NYC Datacenter',
  'SAP ERP Financials SSO Auth Failure',
  'Printer Spooler Offline - London HQ Floor 3',
  'AWS East Region DB Connection Timeout',
  'VPN Gateway Certificate Expiration Alert',
  'Kubernetes Ingress Controller High CPU Spikes',
  'PostgreSQL Primary Node Replication Lag',
  'Email Gateway Outbound Mail Queue Backlog',
  'Active Directory LDAP Sync Failure',
  'Okta MFA Webhook Delivery Timeout',
  'Unix Kernel Panic on Mainframe Host 01',
];

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

const resolutionCodes = [
  'Pending Triage',
  'Server - Kernel & OS Patch',
  'DB - Connection Pool & Vacuum',
  'Application - Code & SSO Fix',
  'Hardware - Component Replacement',
  'Network - BGP & Interface Reset',
  'Security - TLS & Firewall Rule',
  'User Error - Training Provided',
];

const departmentLogTemplates: Record<string, { member: string; log: string; resCode: string }> = {
  'UNASSIGNED (No Team)': { member: 'UNASSIGNED (Unassigned)', log: 'Unassigned incident logged.', resCode: 'Pending Triage' },
  Unix: { member: 'Richard Stallman (Unix)', log: 'Analyzed kernel core dump, tuned sysctl kernel parameters, and restarted systemd daemon.', resCode: 'Server - Kernel & OS Patch' },
  'Network Ops': { member: 'Sarah Connor (Network Ops)', log: 'Flushed BGP routing tables, reset interface eth0, link latency returned to <5ms.', resCode: 'Network - BGP & Interface Reset' },
  'App Support': { member: 'Alex Mercer (App Support)', log: 'Cleared Redis session cache, updated OAuth callback endpoints, SSO login verified.', resCode: 'Application - Code & SSO Fix' },
  'Desktop Support': { member: 'David Miller (Desktop Support)', log: 'Reinstalled printer driver, cleared print spooler queue, hardware connectivity online.', resCode: 'Hardware - Component Replacement' },
  'DevOps Ops': { member: 'DevOps Team', log: 'Scaled Kubernetes Deployment replicas from 3 to 12, pod status Healthy.', resCode: 'Server - Kernel & OS Patch' },
  SecOps: { member: 'Security Team', log: 'Rotated expired TLS certificates, updated firewall ingress rules, traffic unblocked.', resCode: 'Security - TLS & Firewall Rule' },
  'DBA Team': { member: 'DBA Team', log: 'Ran autovacuum on primary table, optimized connection pool size, DB latency normal.', resCode: 'DB - Connection Pool & Vacuum' },
};

const callers = ['Monitoring Bot', 'Sarah Connor', 'David Miller', 'Alex Mercer', 'System Admin', 'Richard Stallman'];
const cis = ['Unspecified CI', 'router-border-nyc-01', 'k8s-prod-cluster-east-1', 'db-postgres-primary', 'api-gateway-envoy-v2', 'vpn-gateway-01', 'control plane'];
const technicians = ['UNASSIGNED (Unassigned)', 'Richard Stallman (Unix)', 'Sarah Connor (Network Ops)', 'Alex Mercer (App Support)', 'David Miller (Desktop Support)', 'DBA Team', 'Security Team', 'System Admin'];

function generate1000InitialIncidents() {
  const list = [];
  for (let i = 1; i <= 1000; i++) {
    const title = `${sampleTitles[i % sampleTitles.length]} (#${i})`;
    const isUnassigned = i % 4 === 0 || i > 766;
    const dept = isUnassigned ? 'UNASSIGNED (No Team)' : departments[i % (departments.length - 1) + 1];
    const deptInfo = departmentLogTemplates[dept] || departmentLogTemplates['UNASSIGNED (No Team)'];
    const caller = callers[i % callers.length];
    const resolutionCode = isUnassigned ? 'Pending Triage' : resolutionCodes[i % resolutionCodes.length];

    list.push({
      id: `INC${String(i).padStart(7, '0')}`,
      title,
      priority: i % 5 === 0 ? 'P1' : i % 3 === 0 ? 'P2' : i % 2 === 0 ? 'P3' : 'P4',
      state: isUnassigned ? 'NEW' : 'RESOLVED',
      caller,
      department: dept,
      assignedTo: isUnassigned ? 'UNASSIGNED (Unassigned)' : deptInfo.member,
      resolutionCode,
      resolutionNotes: isUnassigned ? 'Pending manual triage.' : deptInfo.log,
      createdAt: '2026-07-21',
    });
  }
  return list;
}

export default function IncidentsPage() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'matrix' | 'analysis'>('matrix');

  // Full 12-Field Form State (Allows setting Department to UNASSIGNED)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState({
    shortDescription: '',
    description: '',
    impact: 'DEPARTMENT',
    urgency: 'HIGH',
    department: 'UNASSIGNED (No Team)',
    assignedTo: 'UNASSIGNED (Unassigned)',
    caller: 'System Admin',
    ci: 'Unspecified CI',
    resolutionCode: 'Pending Triage',
    resolutionNotes: '',
    state: 'NEW',
  });

  const loadIncidentsFromDatabase = async () => {
    try {
      const res = await fetch('/api/v1/incidents');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const apiMapped = data.map((inc: any) => ({
            id: inc.id,
            number: inc.number || inc.id,
            title: inc.shortDescription || inc.title,
            priority: (inc.priority || '').includes('P1') ? 'P1' : (inc.priority || '').includes('P2') ? 'P2' : (inc.priority || '').includes('P3') ? 'P3' : 'P4',
            state: inc.state || 'NEW',
            caller: inc.caller || 'Monitoring Bot',
            department: inc.department || 'UNASSIGNED (No Team)',
            assignedTo: inc.assignedTo || 'UNASSIGNED (Unassigned)',
            resolutionCode: inc.resolutionCode || 'Pending Triage',
            resolutionNotes: inc.resolutionNotes || '',
            createdAt: inc.createdAt || '2026-07-21',
          }));

          apiMapped.sort((a, b) => {
            const numA = parseInt((a.number || '').replace(/\D/g, ''), 10) || 0;
            const numB = parseInt((b.number || '').replace(/\D/g, ''), 10) || 0;
            return numB - numA;
          });
          setIncidents(apiMapped);
        }
      }
    } catch (err) {
      console.error('Failed to load incidents from single source DB:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('custom_user_incidents');
    }
    loadIncidentsFromDatabase();
    const interval = setInterval(loadIncidentsFromDatabase, 5000);
    return () => clearInterval(interval);
  }, []);

  const computedPriority = useMemo(() => {
    if (formState.impact === 'ENTERPRISE' && formState.urgency === 'CRITICAL') return 'P1';
    if (formState.impact === 'ENTERPRISE' || formState.urgency === 'CRITICAL') return 'P1';
    if (formState.impact === 'DEPARTMENT' || formState.urgency === 'HIGH') return 'P2';
    if (formState.urgency === 'MEDIUM') return 'P3';
    return 'P4';
  }, [formState.impact, formState.urgency]);

  const isUnassignedIncident = (inc: any) => {
    const dept = (inc.department || '').toUpperCase();
    const assigned = (inc.assignedTo || '').toUpperCase();
    return dept.includes('UNASSIGNED') || assigned.includes('UNASSIGNED') || !dept || !assigned;
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const matchesSearch =
        inc.id.toLowerCase().includes(search.toLowerCase()) ||
        inc.title.toLowerCase().includes(search.toLowerCase()) ||
        inc.department.toLowerCase().includes(search.toLowerCase()) ||
        inc.assignedTo.toLowerCase().includes(search.toLowerCase());
      const matchesDept =
        deptFilter === 'ALL'
          ? true
          : deptFilter.includes('UNASSIGNED')
          ? isUnassignedIncident(inc)
          : inc.department === deptFilter;
      const matchesPriority = priorityFilter === 'ALL' || inc.priority === priorityFilter;
      return matchesSearch && matchesDept && matchesPriority;
    });
  }, [incidents, search, deptFilter, priorityFilter]);

  const totalPages = Math.ceil(filteredIncidents.length / pageSize);
  const paginatedIncidents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredIncidents.slice(start, start + pageSize);
  }, [filteredIncidents, page]);

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
        ci: 'Unspecified CI',
        resolutionCode: 'Pending Triage',
        resolutionNotes: '',
        state: 'NEW',
      });
    }
  };

  return (
    <div className="p-8 space-y-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Incident Management Console
            </h1>
            <span className="px-3 py-1 text-xs font-bold text-brand-400 bg-brand-500/10 border border-brand-500/30 rounded-full">
              Enterprise ITSM Database (1,000 Records)
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Real-time incident management console connected directly to the database API (<code className="text-brand-400">/api/v1/incidents</code>).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-bold text-xs shadow-lg flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            Log New Incident Record
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>TOTAL DATABASE INCIDENTS</span>
            <FileText className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-3xl font-black text-white">{incidents.length}</div>
          <p className="text-[11px] text-slate-500">Main database store</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>UNASSIGNED QUEUE</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400">
            {incidents.filter(isUnassignedIncident).length}
          </div>
          <p className="text-[11px] text-slate-500">Pending team triage</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>ASSIGNED & RESOLVED</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400">
            {incidents.filter(i => !isUnassignedIncident(i)).length}
          </div>
          <p className="text-[11px] text-slate-500">Assigned to engineering teams</p>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>P1 CRITICAL INCIDENTS</span>
            <Zap className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-black text-red-400">
            {incidents.filter(i => i.priority === 'P1').length}
          </div>
          <p className="text-[11px] text-slate-500">High priority SLA monitoring</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by ID (e.g. INC0000005), title, group, or technician..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="flex items-center gap-3 text-xs w-full md:w-auto overflow-x-auto">
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="P1">P1 - Critical</option>
            <option value="P2">P2 - High</option>
            <option value="P3">P3 - Moderate</option>
            <option value="P4">P4 - Low</option>
          </select>
        </div>
      </div>

          {/* Incidents Table */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 font-semibold bg-slate-900/40 rounded-xl border border-slate-800">
          Loading 1,000+ Incidents from PostgreSQL Database...
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Incident Number</th>
                  <th className="px-6 py-4">Priority / State</th>
                  <th className="px-6 py-4">Short Description & Details</th>
                  <th className="px-6 py-4">Database Department / Group</th>
                  <th className="px-6 py-4">Assigned Technician</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedIncidents.map(item => (
                  <tr
                    key={item.id}
                    onClick={() => router.push(`/incidents/${item.id}`)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-mono font-bold text-brand-400">
                      {item.number}
                    </td>
                    <td className="px-6 py-4 space-y-1">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${
                        item.priority === 'P1' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        item.priority === 'P2' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {item.priority}
                      </span>
                      <div className="text-[10px] text-slate-400">{item.state}</div>
                    </td>
                    <td className="px-6 py-4 max-w-md">
                      <div className="font-semibold text-slate-100">{item.title}</div>
                      <div className="text-slate-400 text-[11px] truncate">{item.resolutionNotes || 'Pending triage notes'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                        item.department.includes('UNASSIGNED') ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {item.department}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-200">
                      {item.assignedTo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
            <span>
              Showing {filteredIncidents.length > 0 ? (page - 1) * pageSize + 1 : 0} -{' '}
              {Math.min(page * pageSize, filteredIncidents.length)} of {filteredIncidents.length} database incidents
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-slate-200 px-2">
                Page {page} of {totalPages || 1}
              </span>
              <button
                disabled={page === totalPages || totalPages === 0}
                onClick={() => setPage(page + 1)}
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Comprehensive 12-Field Incident Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-white text-lg flex items-center gap-2">
                  <Plus className="w-5 h-5 text-brand-400" /> Create Incident & Update All Fields
                </h3>
                <p className="text-xs text-slate-400">Fill in any or all 12 fields. Department can be set to UNASSIGNED (No Team).</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-4 text-xs">
              {/* Row 1: Short Description & State */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-bold mb-1">1. Short Description / Title *</label>
                  <input
                    type="text"
                    required
                    value={formState.shortDescription}
                    onChange={e => setFormState({ ...formState, shortDescription: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                    placeholder="e.g. Core Router Latency Spike on NYC Datacenter Switch"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">2. State</label>
                  <select
                    value={formState.state}
                    onChange={e => setFormState({ ...formState, state: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="NEW">NEW (Unassigned Triage)</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="ON_HOLD">ON_HOLD</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Impact & Urgency & Computed Priority */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">3. Impact</label>
                  <select
                    value={formState.impact}
                    onChange={e => setFormState({ ...formState, impact: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="ENTERPRISE">ENTERPRISE (Whole Org)</option>
                    <option value="DEPARTMENT">DEPARTMENT (Multiple Teams)</option>
                    <option value="TEAM">TEAM (Single Group)</option>
                    <option value="INDIVIDUAL">INDIVIDUAL (Single User)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">4. Urgency</label>
                  <select
                    value={formState.urgency}
                    onChange={e => setFormState({ ...formState, urgency: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="CRITICAL">CRITICAL (Immediate Outage)</option>
                    <option value="HIGH">HIGH (Degraded Performance)</option>
                    <option value="MEDIUM">MEDIUM (Minor Impairment)</option>
                    <option value="LOW">LOW (Informational)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">5. Priority (Auto Calculated)</label>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono font-bold text-amber-400">
                    {computedPriority} (Matrix Calculated)
                  </div>
                </div>
              </div>

              {/* Row 3: Department / Team (Allows UNASSIGNED) & Assigned Technician */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    6. Department / Ticket Group <span className="text-amber-400">(Can be UNASSIGNED)</span>
                  </label>
                  <select
                    value={formState.department}
                    onChange={e => setFormState({ ...formState, department: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-semibold focus:outline-none focus:border-brand-500"
                  >
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">7. Assigned Technician</label>
                  <select
                    value={formState.assignedTo}
                    onChange={e => setFormState({ ...formState, assignedTo: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    {technicians.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Caller & Configuration Item */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">8. Caller / Reporter</label>
                  <select
                    value={formState.caller}
                    onChange={e => setFormState({ ...formState, caller: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    {callers.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">9. Configuration Item (CI)</label>
                  <select
                    value={formState.ci}
                    onChange={e => setFormState({ ...formState, ci: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    {cis.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 5: Detailed Symptoms Description */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">10. Detailed Description / Symptoms</label>
                <textarea
                  rows={2}
                  value={formState.description}
                  onChange={e => setFormState({ ...formState, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                  placeholder="Detailed diagnostic steps and log telemetry..."
                />
              </div>

              {/* Row 6: Resolution Code & Resolution Notes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">11. Resolution Code</label>
                  <select
                    value={formState.resolutionCode}
                    onChange={e => setFormState({ ...formState, resolutionCode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    {resolutionCodes.map(rc => (
                      <option key={rc} value={rc}>{rc}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-bold mb-1">12. Resolution Notes / Log</label>
                  <input
                    type="text"
                    value={formState.resolutionNotes}
                    onChange={e => setFormState({ ...formState, resolutionNotes: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-brand-500"
                    placeholder="Root-cause diagnostic analysis..."
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold shadow-lg transition flex items-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  {isSubmitting ? 'Saving to Database...' : 'Save Incident in Database'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
