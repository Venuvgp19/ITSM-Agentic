'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  User,
  Shield,
  Send,
  MessageSquare,
  FileText,
  Server,
  CheckCircle2,
  Lock,
  Tag,
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

const departments = ['Unix', 'Network Ops', 'App Support', 'Desktop Support', 'DevOps Ops', 'SecOps', 'DBA Team'];
const cis = ['router-border-nyc-01', 'k8s-prod-cluster-east-1', 'db-postgres-primary', 'api-gateway-envoy-v2', 'vpn-gateway-01'];

const resolutionCodes = [
  'Server - Kernel & OS Patch',
  'DB - Connection Pool & Vacuum',
  'Application - Code & SSO Fix',
  'Hardware - Component Replacement',
  'Network - BGP & Interface Reset',
  'Security - TLS & Firewall Rule',
  'User Error - Training Provided',
];

const departmentLogTemplates: Record<string, { member: string; log: string; resCode: string }> = {
  Unix: { member: 'Richard Stallman (Unix)', log: 'Analyzed kernel core dump, tuned sysctl kernel parameters, and restarted systemd daemon.', resCode: 'Server - Kernel & OS Patch' },
  'Network Ops': { member: 'Sarah Connor (Network Ops)', log: 'Flushed BGP routing tables, reset interface eth0, link latency returned to <5ms.', resCode: 'Network - BGP & Interface Reset' },
  'App Support': { member: 'Alex Mercer (App Support)', log: 'Cleared Redis session cache, updated OAuth callback endpoints, SSO login verified.', resCode: 'Application - Code & SSO Fix' },
  'Desktop Support': { member: 'David Miller (Desktop Support)', log: 'Reinstalled printer driver, cleared print spooler queue, hardware connectivity online.', resCode: 'Hardware - Component Replacement' },
  'DevOps Ops': { member: 'DevOps Lead', log: 'Scaled Kubernetes Deployment replicas from 3 to 12, pod status returned to Healthy.', resCode: 'Server - Kernel & OS Patch' },
  SecOps: { member: 'Security Team', log: 'Rotated expired TLS certificates, updated firewall ingress rules, security alert resolved.', resCode: 'Security - TLS & Firewall Rule' },
  'DBA Team': { member: 'DBA Team', log: 'Ran autovacuum on primary table, optimized connection pool size, DB performance back to baseline.', resCode: 'DB - Connection Pool & Vacuum' },
};

function getIncidentDetailById(idStr: string) {
  const numMatch = idStr.match(/\d+/);
  const num = numMatch ? parseInt(numMatch[0], 10) : 1042;
  
  const title = `${sampleTitles[num % sampleTitles.length]} (#${num})`;
  const priority = num % 5 === 0 ? 'P1 - CRITICAL' : num % 3 === 0 ? 'P2 - HIGH' : num % 2 === 0 ? 'P3 - MODERATE' : 'P4 - LOW';
  
  const isUnassigned = num % 4 === 0 || num > 766;
  const dept = isUnassigned ? 'UNASSIGNED (No Team)' : departments[num % departments.length];
  const deptInfo = departmentLogTemplates[dept];
  const assignedTo = isUnassigned ? 'UNASSIGNED (Unassigned)' : (deptInfo?.member || 'UNASSIGNED (Unassigned)');
  
  const ci = cis[num % cis.length];
  const resCode = isUnassigned ? 'Pending Triage' : resolutionCodes[num % resolutionCodes.length];
  const state = isUnassigned ? 'NEW' : 'RESOLVED';

  return {
    id: idStr.toUpperCase(),
    number: num,
    title,
    priority,
    state,
    department: dept,
    assignedTo,
    resolutionCode: resCode,
    resolutionNotes: isUnassigned ? 'Unassigned ticket pending triage.' : (deptInfo?.log || ''),
    caller: 'Monitoring Bot',
    ci,
    description: `Incident Record #${num}. Automated monitor alerted on ${ci}. ${isUnassigned ? 'Pending team assignment.' : `Assigned to ${dept} team for resolution.`}`,
    createdAt: '2026-07-21 10:14 UTC',
  };
}

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = (params.id as string) || 'INC0001042';

  const [incident, setIncident] = useState(() => getIncidentDetailById(idParam));
  const [state, setState] = useState(incident.state);
  const [resCode, setResCode] = useState(incident.resolutionCode);
  const [ciVal, setCiVal] = useState(incident.ci);

  const [activities, setActivities] = useState([
    { id: 'act_1', author: 'Monitoring Bot', isWorkNote: true, comment: `Automated telemetry created incident ${incident.id} for target CI ${incident.ci}.`, timestamp: '10:14 AM' },
    { id: 'act_2', author: incident.assignedTo, isWorkNote: true, comment: `Department ${incident.department} member assigned. Executing diagnostic procedures.`, timestamp: '10:22 AM' },
  ]);

  const [commentText, setCommentText] = useState('');
  const [isWorkNote, setIsWorkNote] = useState(true);

  useEffect(() => {
    const fetchIncident = async () => {
      try {
        const res = await fetch(`/api/v1/incidents/${idParam}`);
        if (res.ok) {
          const inc = await res.json();
          const mappedInc = {
            id: inc.id || inc.number || idParam.toUpperCase(),
            number: inc.number || idParam,
            title: inc.shortDescription || inc.title || `Incident ${idParam}`,
            priority: inc.priority || 'P2 - HIGH',
            state: inc.state || 'NEW',
            department: inc.department || 'UNASSIGNED (No Team)',
            assignedTo: inc.assignedTo || 'UNASSIGNED (Unassigned)',
            resolutionCode: inc.resolutionCode || 'Pending Triage',
            resolutionNotes: inc.resolutionNotes || '',
            caller: inc.caller || 'Monitoring Bot',
            ci: inc.configurationItem || inc.ci || 'router-border-nyc-01',
            description: inc.description || `Incident Record ${idParam}`,
            createdAt: inc.createdAt || '2026-07-21 10:14 UTC',
          };
          setIncident(mappedInc);
          setState(mappedInc.state);
          setResCode(mappedInc.resolutionCode);
          setCiVal(mappedInc.ci);
          if (Array.isArray(inc.activities) && inc.activities.length > 0) {
            setActivities(inc.activities);
          } else {
            setActivities([
              { id: 'act_1', author: mappedInc.caller, isWorkNote: true, comment: `Automated telemetry created incident ${mappedInc.id} for target CI ${mappedInc.ci}.`, timestamp: '10:14 AM' },
              { id: 'act_2', author: mappedInc.assignedTo, isWorkNote: true, comment: `Department ${mappedInc.department} assigned. State: ${mappedInc.state}.`, timestamp: '10:22 AM' },
            ]);
          }
          return;
        }
      } catch {
        // Fallback
      }

      const updatedInc = getIncidentDetailById(idParam);
      setIncident(updatedInc);
      setState(updatedInc.state);
      setResCode(updatedInc.resolutionCode);
      setActivities([
        { id: 'act_1', author: 'Monitoring Bot', isWorkNote: true, comment: `Automated telemetry created incident ${updatedInc.id} for target CI ${updatedInc.ci}.`, timestamp: '10:14 AM' },
        { id: 'act_2', author: updatedInc.assignedTo, isWorkNote: true, comment: `Department ${updatedInc.department} assigned.`, timestamp: '10:22 AM' },
      ]);
    };

    fetchIncident();
  }, [idParam]);

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newAct = {
      id: `act_${Date.now()}`,
      author: 'System Admin',
      isWorkNote,
      comment: commentText,
      timestamp: new Date().toLocaleTimeString(),
    };

    setActivities([newAct, ...activities]);
    setCommentText('');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/incidents')}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-100 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to 1,000 Incident Matrix
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono">Incident ID: {incident.id}</span>
          {state === 'RESOLVED' && (
            <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> State: RESOLVED
            </span>
          )}
          {state === 'CLOSED' && (
            <span className="px-3 py-1.5 rounded-lg bg-slate-500/20 text-slate-300 border border-slate-500/30 font-bold text-xs flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> State: CLOSED
            </span>
          )}
          {state === 'IN_PROGRESS' && (
            <span className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold text-xs flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> State: IN_PROGRESS
            </span>
          )}
          {state === 'NEW' && (
            <span className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> State: NEW
            </span>
          )}
        </div>
      </div>

      {/* Incident Header Banner */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-mono font-bold text-brand-400">{incident.id}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                incident.priority.startsWith('P1')
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {incident.priority}
              </span>
              {(state === 'RESOLVED' || state === 'CLOSED') && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Resolution Code: {resCode}
                </span>
              )}
            </div>
            <h1 className="text-xl font-extrabold text-slate-100">{incident.title}</h1>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">State</label>
            <select
              value={state}
              onChange={async (e) => {
                const newState = e.target.value;
                setState(newState);
                try {
                  await fetch(`/api/v1/incidents/${incident.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state: newState }),
                  });
                } catch {}
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="NEW">NEW</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">
              {state === 'RESOLVED' || state === 'CLOSED' ? 'Resolution Code' : 'Resolution Status'}
            </span>
            {state === 'RESOLVED' || state === 'CLOSED' ? (
              <select
                value={resCode}
                onChange={async (e) => {
                  const newCode = e.target.value;
                  setResCode(newCode);
                  try {
                    await fetch(`/api/v1/incidents/${incident.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ resolutionCode: newCode }),
                    });
                  } catch {}
                }}
                className="w-full bg-transparent font-semibold text-cyan-400 focus:outline-none"
              >
                {resolutionCodes.map((code) => (
                  <option key={code} value={code} className="bg-slate-900 text-slate-200">{code}</option>
                ))}
              </select>
            ) : (
              <div className="font-semibold text-amber-400 font-mono text-[11px]">
                {state === 'IN_PROGRESS' ? 'Active Diagnostics' : 'Awaiting Triage'}
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Department</span>
            <div className="font-semibold text-slate-200">{incident.department}</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">
              {state === 'RESOLVED' || state === 'CLOSED' ? 'Resolved By (Member)' : 'Assigned Member'}
            </span>
            <div className="font-semibold text-emerald-400">{incident.assignedTo}</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Configuration Item</span>
            <input
              type="text"
              value={ciVal}
              onChange={(e) => setCiVal(e.target.value)}
              onBlur={async () => {
                try {
                  await fetch(`/api/v1/incidents/${incident.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ configurationItem: ciVal, ci: ciVal }),
                  });
                } catch {}
              }}
              className="w-full bg-transparent font-semibold text-brand-400 focus:outline-none focus:border-brand-500 rounded"
            />
          </div>
        </div>
      </div>

      {/* Main Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Description & Resolution / Work Status */}
        <div className="lg:col-span-1 space-y-6">
          {state === 'RESOLVED' || state === 'CLOSED' ? (
            <div className="glass-panel p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                Official Resolution Log
              </h3>
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> Root Cause Resolved
                </div>
                <div className="text-[11px] font-bold text-cyan-400 font-mono">
                  Close Code: {resCode}
                </div>
                <p className="leading-relaxed">{incident.resolutionNotes || 'Incident root cause resolved and verified.'}</p>
                <div className="text-[10px] text-emerald-400/80 font-mono">Resolved by: {incident.assignedTo}</div>
              </div>
            </div>
          ) : (
            <div className="glass-panel p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                Active Work & Diagnostic Status
              </h3>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-medium space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-blue-400">
                  <Clock className="w-4 h-4" /> Work In Progress
                </div>
                <p className="leading-relaxed">{incident.description || 'Assigned team is performing active diagnostics and troubleshooting.'}</p>
                <div className="text-[10px] text-blue-400/80 font-mono">Assigned Member: {incident.assignedTo}</div>
              </div>
            </div>
          )}

          <div className="glass-panel p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
              SLA Target Metrics
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Response SLA (15 min)</span>
                <span className="text-emerald-400 font-bold">MET (3 min)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Resolution SLA (4 hr)</span>
                <span className="text-emerald-400 font-bold">MET (26 min)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Department Member Work Notes & Activity Stream */}
        <div className="lg:col-span-2 glass-panel p-6 space-y-6">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-brand-400" /> Department Activity & Work Notes Log
            </h2>
            <span className="text-xs text-slate-400 font-mono">{activities.length} Entries Logged</span>
          </div>

          {/* Work Note Composer */}
          <form onSubmit={handleAddActivity} className="space-y-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-4 text-xs font-bold">
              <label className="flex items-center gap-1.5 cursor-pointer text-amber-400">
                <input
                  type="radio"
                  name="activityType"
                  checked={isWorkNote}
                  onChange={() => setIsWorkNote(true)}
                  className="text-amber-500 focus:ring-0"
                />
                <Lock className="w-3.5 h-3.5" /> Department Work Note
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="radio"
                  name="activityType"
                  checked={!isWorkNote}
                  onChange={() => setIsWorkNote(false)}
                  className="text-brand-500 focus:ring-0"
                />
                <MessageSquare className="w-3.5 h-3.5 text-brand-400" /> Customer Visible Comment
              </label>
            </div>

            <textarea
              required
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={`Add department work note for ${incident.id}...`}
              className={`w-full p-3 rounded-lg text-xs text-slate-100 focus:outline-none border ${
                isWorkNote
                  ? 'bg-amber-500/5 border-amber-500/30 focus:border-amber-500'
                  : 'bg-slate-900 border-slate-800 focus:border-brand-500'
              }`}
            />

            <div className="flex justify-end">
              <button
                type="submit"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs shadow transition ${
                  isWorkNote
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-brand-600 hover:bg-brand-500 text-white'
                }`}
              >
                <Send className="w-3.5 h-3.5" /> Post Log Entry
              </button>
            </div>
          </form>

          {/* Activity Stream */}
          <div className="space-y-4">
            {activities.map((act) => (
              <div
                key={act.id}
                className={`p-4 rounded-xl border space-y-2 transition ${
                  act.isWorkNote
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                    : 'bg-slate-950 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-bold">
                    <span className="text-slate-100">{act.author}</span>
                    {act.isWorkNote ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> DEPARTMENT WORK NOTE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> RESOLUTION LOG
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{act.timestamp}</span>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed font-sans">{act.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
