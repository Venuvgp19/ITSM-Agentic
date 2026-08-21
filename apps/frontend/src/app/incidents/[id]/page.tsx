'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Clock,
  Send,
  AlertTriangle,
  FileText,
  User,
  Tag,
  MessageSquare,
  Sparkles,
  Save,
  CheckCircle2,
  Lock,
  ChevronRight,
  Shield,
  Layers,
  Terminal,
  Activity,
  Trash2,
  Calendar,
  Zap,
  RotateCcw
} from 'lucide-react';

const resolutionCodes = [
  'Pending Triage',
  'Server - Kernel & OS Patch',
  'Network - BGP & Interface Reset',
  'Application - Container Restart',
  'Security - Firewall Rule Applied',
  'Database - Vacuum & Index Rebuilt',
  'User Error - Guidance Provided',
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

const cis = ['Unspecified CI', 'router-border-nyc-01', 'k8s-prod-cluster-east-1', 'db-postgres-primary', 'api-gateway-envoy-v2', 'vpn-gateway-01', 'control plane', 'WorkerNode1HL'];

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = (params.id as string) || 'INC0001042';

  const [incident, setIncident] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState('NEW');
  const [resCode, setResCode] = useState('Pending Triage');
  const [resNotes, setResNotes] = useState('');
  const [ciVal, setCiVal] = useState('Unspecified CI');
  const [department, setDepartment] = useState('UNASSIGNED (No Team)');
  const [assignedTo, setAssignedTo] = useState('UNASSIGNED (Unassigned)');
  const [caller, setCaller] = useState('System Admin');
  const [impact, setImpact] = useState('DEPARTMENT');
  const [urgency, setUrgency] = useState('HIGH');
  const [activities, setActivities] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [activeFormTab, setActiveFormTab] = useState<'notes' | 'resolution' | 'sla'>('notes');

  const [commentText, setCommentText] = useState('');
  const [isWorkNote, setIsWorkNote] = useState(true);

  const normalizeDateTime = (raw?: string | Date | null, fallbackDate = '2026-08-21'): string => {
    if (!raw) return `${fallbackDate} 15:25:34 UTC`;
    
    if (typeof raw === 'string') {
      const trimmed = raw.trim();

      // If already "YYYY-MM-DD HH:mm:ss UTC"
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(\s+UTC)?$/.test(trimmed)) {
        return trimmed.endsWith('UTC') ? trimmed : `${trimmed} UTC`;
      }

      // If 12-hour format "4:03:06 pm" or "2026-08-21 4:03:06 pm"
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
        const datePart = dateMatch ? dateMatch[1] : fallbackDate;
        return `${datePart} ${hh}:${minutes}:${seconds} UTC`;
      }
    }

    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      }
    } catch {}

    return String(raw);
  };

  const formatFullDateTime = (dateVal?: string | Date) => {
    return normalizeDateTime(dateVal);
  };

  const formatActivityTimestamp = (ts?: string, fallbackDate?: string) => {
    const fallbackD = fallbackDate ? fallbackDate.split(' ')[0] : '2026-08-21';
    return normalizeDateTime(ts, fallbackD);
  };

  // Dynamic members belonging exclusively to current Assignment Group
  const currentEligibleMembers = ASSIGNMENT_GROUP_MEMBERS[department] || ['UNASSIGNED (Unassigned)'];

  const handleDepartmentChange = (newDept: string) => {
    setDepartment(newDept);
    const eligible = ASSIGNMENT_GROUP_MEMBERS[newDept] || ['UNASSIGNED (Unassigned)'];
    // If currently assigned person does not belong to new group, default to first member of group
    if (!eligible.includes(assignedTo)) {
      setAssignedTo(eligible[0]);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchIncident = async (isInitial = false) => {
      if (isInitial) setIsLoading(true);
      try {
        const res = await fetch(`/api/v1/incidents/${idParam}`);
        if (res.ok && isMounted) {
          const inc = await res.json();
          const incDept = inc.department || 'UNASSIGNED (No Team)';
          const eligibleForDept = ASSIGNMENT_GROUP_MEMBERS[incDept] || ['UNASSIGNED (Unassigned)'];
          
          let initialAssigned = inc.assignedToName || inc.assignedTo || eligibleForDept[0];
          // If assigned person does not belong to this department, align with group member
          if (!eligibleForDept.includes(initialAssigned) && incDept !== 'UNASSIGNED (No Team)') {
            initialAssigned = eligibleForDept[0];
          }

          const mappedInc = {
            id: inc.id || inc.number || idParam.toUpperCase(),
            number: inc.number || idParam,
            title: inc.shortDescription || inc.title || `Incident ${idParam}`,
            priority: (inc.priority || '').includes('P1') ? '1 - Critical' : (inc.priority || '').includes('P2') ? '2 - High' : (inc.priority || '').includes('P3') ? '3 - Moderate' : '4 - Low',
            state: inc.state || 'NEW',
            department: incDept,
            assignedTo: initialAssigned,
            resolutionCode: inc.resolutionCode || 'Pending Triage',
            resolutionNotes: inc.resolutionNotes || '',
            caller: inc.caller || 'Monitoring Bot',
            ci: inc.configurationItem || inc.ci || 'control plane',
            description: inc.description || `Incident Record ${idParam}`,
            openedAtFormatted: formatFullDateTime(inc.openedAt || inc.createdAt),
            updatedAtFormatted: formatFullDateTime(inc.updatedAt || inc.openedAt || inc.createdAt),
            slaDueAtFormatted: formatFullDateTime(inc.slaDueAt || new Date(Date.now() + 14400000)),
          };
          setIncident(mappedInc);
          setState(mappedInc.state);
          setResCode(mappedInc.resolutionCode);
          setResNotes(mappedInc.resolutionNotes);
          setCiVal(mappedInc.ci);
          setDepartment(mappedInc.department);
          setAssignedTo(mappedInc.assignedTo);
          setCaller(mappedInc.caller);

          if (Array.isArray(inc.activities) && inc.activities.length > 0) {
            setActivities(inc.activities);
          } else {
            setActivities([
              {
                id: 'act_1',
                author: mappedInc.caller,
                isWorkNote: true,
                comment: `Automated monitoring alert created incident ${mappedInc.number} for CI ${mappedInc.ci}.`,
                timestamp: mappedInc.openedAtFormatted,
              },
              {
                id: 'act_2',
                author: mappedInc.assignedTo,
                isWorkNote: true,
                comment: `Assigned to assignment group ${mappedInc.department}. State: ${mappedInc.state}.`,
                timestamp: mappedInc.openedAtFormatted,
              },
            ]);
          }
          if (isInitial) setIsLoading(false);
          return;
        }
      } catch {
        // Fallback
      }

      if (isMounted && isInitial) {
        setIsLoading(false);
      }
    };

    fetchIncident(true);
    const interval = setInterval(() => fetchIncident(false), 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [idParam]);

  const handleSaveToDatabase = async (customState?: string) => {
    if (!incident) return;
    setIsSaving(true);
    const targetState = customState || state;
    try {
      const res = await fetch(`/api/v1/incidents/${incident.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: targetState,
          resolutionCode: resCode,
          resolutionNotes: resNotes,
          configurationItem: ciVal,
          department,
          assignedTo,
          caller,
        }),
      });
      if (res.ok) {
        setState(targetState);
        setSaveMessage(`Incident record ${incident.number} successfully updated in ServiceNow database! ✅`);
        setTimeout(() => setSaveMessage(''), 4000);
      } else {
        setSaveMessage('Failed to update record in database.');
      }
    } catch {
      setSaveMessage('Error connecting to backend API.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const fullTimestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    const newAct = {
      id: `act_${Date.now()}`,
      author: 'System Administrator',
      isWorkNote,
      comment: commentText,
      timestamp: fullTimestamp,
    };

    setActivities([newAct, ...activities]);
    setCommentText('');

    try {
      await fetch(`/api/v1/incidents/${idParam}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAct),
      });
    } catch {}
  };

  const handleDeleteActivity = async (activityId: string) => {
    try {
      await fetch(`/api/v1/incidents/${idParam}/activities/${activityId}`, { method: 'DELETE' });
      setActivities(activities.filter((a) => a.id !== activityId));
    } catch {}
  };

  if (isLoading || !incident) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 py-40 text-slate-800 min-h-screen bg-[#f8fafc]">
        <div className="w-8 h-8 rounded-full border-2 border-[#30bb7b] border-t-transparent animate-spin"></div>
        <p className="text-xs text-slate-500 font-medium">Loading ServiceNow Incident Form...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. Context Breadcrumb Bar */}
      <div className="bg-white border-b border-[#e2e8f0] px-4 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-xs sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/incidents')}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-900 transition font-bold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Incidents</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-mono font-bold text-[#0284c7]">{incident.number}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-medium truncate max-w-md">{incident.title}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSaveToDatabase()}
            disabled={isSaving}
            className="px-3 py-1.5 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50 text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save & Update'}</span>
          </button>

          {state !== 'RESOLVED' && (
            <button
              onClick={() => {
                setResCode('Server - Kernel & OS Patch');
                handleSaveToDatabase('RESOLVED');
              }}
              disabled={isSaving}
              className="px-3 py-1.5 rounded bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50 text-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Resolve Incident</span>
            </button>
          )}
        </div>
      </div>

      {saveMessage && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-emerald-800 text-xs font-bold flex items-center gap-2 shadow-xs animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {saveMessage}
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto max-w-7xl mx-auto w-full">
        {/* 2. Classic ServiceNow 2-Column Record Form */}
        <div className="bg-white border border-[#e2e8f0] rounded shadow-sm p-5 space-y-4">
          <div className="border-b border-[#e2e8f0] pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">INCIDENT RECORD</span>
              <h1 className="text-base font-extrabold text-slate-900 mt-0.5">{incident.number} - {incident.title}</h1>
            </div>

            {/* Date Badges in Record Header */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-[#f8fafc] border border-[#cbd5e1] px-2.5 py-1 rounded text-[11px] text-slate-700 font-mono">
                <Calendar className="w-3 h-3 text-[#30bb7b]" />
                <span>Opened: <strong className="text-slate-900">{incident.openedAtFormatted}</strong></span>
              </div>

              <div className="flex items-center gap-1.5 bg-[#f8fafc] border border-[#cbd5e1] px-2.5 py-1 rounded text-[11px] text-slate-700 font-mono">
                <Clock className="w-3 h-3 text-[#0284c7]" />
                <span>Updated: <strong className="text-slate-900">{incident.updatedAtFormatted}</strong></span>
              </div>
            </div>
          </div>

          {/* Form Fields: 2 Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Left Column */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Number</label>
                <input
                  type="text"
                  value={incident.number}
                  readOnly
                  className="w-full bg-[#f8fafc] border border-[#cbd5e1] rounded p-2 text-xs font-mono font-bold text-[#0284c7]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Caller</label>
                <input
                  type="text"
                  value={caller}
                  onChange={(e) => setCaller(e.target.value)}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#30bb7b] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Configuration Item (CI)</label>
                <select
                  value={ciVal}
                  onChange={(e) => setCiVal(e.target.value)}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 font-mono focus:border-[#30bb7b] focus:outline-none cursor-pointer"
                >
                  {cis.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Opened Date & Time</label>
                <div className="relative flex items-center">
                  <Calendar className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={incident.openedAtFormatted}
                    readOnly
                    className="w-full bg-[#f8fafc] border border-[#cbd5e1] rounded pl-8 pr-3 py-2 text-xs font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Impact</label>
                  <select
                    value={impact}
                    onChange={(e) => setImpact(e.target.value)}
                    className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:outline-none"
                  >
                    <option value="ENTERPRISE">1 - Enterprise</option>
                    <option value="DEPARTMENT">2 - Department</option>
                    <option value="USER">3 - User</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Urgency</label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:outline-none"
                  >
                    <option value="CRITICAL">1 - Critical</option>
                    <option value="HIGH">2 - High</option>
                    <option value="MEDIUM">3 - Medium</option>
                    <option value="LOW">4 - Low</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-slate-700 font-bold mb-1">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 font-bold focus:border-[#30bb7b] focus:outline-none cursor-pointer"
                >
                  <option value="NEW">New</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Assignment Group</label>
                <select
                  value={department}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#30bb7b] focus:outline-none cursor-pointer font-bold"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Assigned To <span className="text-slate-400 font-normal">({department} Members Only)</span>
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#30bb7b] focus:outline-none cursor-pointer font-medium"
                >
                  {currentEligibleMembers.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">SLA Target Due Date</label>
                <div className="relative flex items-center">
                  <Clock className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={incident.slaDueAtFormatted}
                    readOnly
                    className="w-full bg-[#f8fafc] border border-[#cbd5e1] rounded pl-8 pr-3 py-2 text-xs font-mono text-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Contact Type</label>
                <input
                  type="text"
                  value="Self-Service Portal / Autonomous Daemon"
                  readOnly
                  className="w-full bg-[#f8fafc] border border-[#cbd5e1] rounded p-2 text-xs text-slate-500 font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Bottom Tabbed Sections: Notes vs Resolution Info */}
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          {/* Tab Header */}
          <div className="bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center">
            <button
              onClick={() => setActiveFormTab('notes')}
              className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'notes'
                  ? 'border-[#30bb7b] text-slate-900 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#30bb7b]" />
              <span>Notes & Activity Stream ({activities.length})</span>
            </button>

            <button
              onClick={() => setActiveFormTab('resolution')}
              className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'resolution'
                  ? 'border-[#30bb7b] text-slate-900 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Resolution Information</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-5">
            {activeFormTab === 'notes' && (
              <div className="space-y-6">
                {/* Work Note Composer */}
                <form onSubmit={handleAddActivity} className="space-y-3 p-4 rounded bg-[#f8fafc] border border-[#cbd5e1]">
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <label className="flex items-center gap-1.5 cursor-pointer text-amber-800">
                      <input
                        type="radio"
                        name="activityType"
                        checked={isWorkNote}
                        onChange={() => setIsWorkNote(true)}
                        className="text-amber-600 focus:ring-0"
                      />
                      <Lock className="w-3.5 h-3.5" /> Work Notes (Yellow - Internal Only)
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                      <input
                        type="radio"
                        name="activityType"
                        checked={!isWorkNote}
                        onChange={() => setIsWorkNote(false)}
                        className="text-[#30bb7b] focus:ring-0"
                      />
                      <MessageSquare className="w-3.5 h-3.5 text-[#30bb7b]" /> Additional Comments (Customer Visible)
                    </label>
                  </div>

                  <textarea
                    required
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={`Post internal work note or customer update on ${incident.number}...`}
                    className={`w-full p-2.5 rounded text-xs text-slate-900 focus:outline-none border ${
                      isWorkNote
                        ? 'bg-[#fffbeb] border-[#fde68a] focus:border-amber-500 font-mono text-amber-950'
                        : 'bg-white border-[#cbd5e1] focus:border-[#30bb7b]'
                    }`}
                  />

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded font-bold text-xs shadow-sm transition cursor-pointer ${
                        isWorkNote
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-[#288554] hover:bg-[#30bb7b] text-white'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" /> Post Activity Entry
                    </button>
                  </div>
                </form>

                {/* Activity Stream Entries */}
                <div className="space-y-3">
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className={`p-3.5 rounded border space-y-1.5 ${
                        act.isWorkNote
                          ? 'bg-[#fffbeb] border-[#fde68a] text-amber-950'
                          : 'bg-white border-[#e2e8f0] text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2 font-bold">
                          <span className="text-slate-900">{act.author}</span>
                          {act.isWorkNote ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              WORK NOTE
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ADDITIONAL COMMENT
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 font-mono text-[10px]">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {formatActivityTimestamp(act.timestamp, incident.openedAtFormatted)}
                          </span>
                          <button
                            onClick={() => handleDeleteActivity(act.id)}
                            className="text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Delete note"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{act.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeFormTab === 'resolution' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Resolution Code</label>
                  <select
                    value={resCode}
                    onChange={(e) => setResCode(e.target.value)}
                    className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-[#1e6844] font-bold focus:outline-none"
                  >
                    {resolutionCodes.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Resolution Notes</label>
                  <textarea
                    rows={4}
                    value={resNotes}
                    onChange={(e) => setResNotes(e.target.value)}
                    placeholder="Enter diagnostic steps taken, root cause explanation, and verify resolution..."
                    className="w-full bg-white border border-[#cbd5e1] rounded p-2.5 text-xs text-slate-900 focus:border-[#30bb7b] focus:outline-none font-mono"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => handleSaveToDatabase()}
                    className="px-4 py-2 bg-[#288554] hover:bg-[#30bb7b] text-white font-bold rounded flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Resolution Notes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
