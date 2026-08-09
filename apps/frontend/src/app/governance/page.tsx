'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Cpu,
  Server,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  X,
  ExternalLink,
  ChevronRight,
  Database,
  BarChart3,
  TrendingUp,
  PieChart,
  Activity,
  Layers,
  Sparkles,
  Brain,
  DollarSign,
  FileText,
} from 'lucide-react';

interface SafetyCheck {
  check: string;
  passed: boolean;
}

interface AgentApproval {
  id: string;
  incidentId: string;
  incidentTitle: string;
  agentId: string;
  agentName: string;
  model: string;
  targetCi: string;
  department: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidenceScore: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  summary: string;
  proposedCommands: string[];
  kbArticleReference?: string;
  kbTitle?: string;
  safetyChecks: SafetyCheck[];
  aiReasoning: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
}

interface AgentHistoryEntry {
  id: string;
  approvalId?: string;
  incidentId: string;
  incidentTitle: string;
  agentId: string;
  agentName: string;
  model: string;
  targetCi: string;
  department: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'APPROVED' | 'REJECTED' | 'AUTO_EXECUTED';
  actionType: string;
  executedAt: string;
  durationMs: number;
  humanApprover: string;
  commandExecuted: string;
  executionOutput: string;
  resolutionOutcome: string;
}

export default function GovernancePage() {
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [history, setHistory] = useState<AgentHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'analysis' | 'pending' | 'history'>('analysis');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Modals state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000); // Poll approvals
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const apprsRes = await fetch('/api/v1/agent/approvals');
      const histRes = await fetch('/api/v1/agent/history');
      if (apprsRes.ok && histRes.ok) {
        const apprsData = await apprsRes.json();
        const histData = await histRes.json();
        setApprovals(apprsData);
        setHistory(histData);
      }
    } catch (err) {
      console.error('Failed to load governance data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (isSubmittingAction) return;
    setIsSubmittingAction(true);
    setErrorMessage('');
    
    try {
      const res = await fetch(`/api/v1/agent/approvals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approverName: 'System Admin (Human in the Loop)' }),
      });
      
      if (res.ok) {
        await fetchData();
      } else {
        const errData = await res.json();
        setErrorMessage(errData.message || 'Failed to approve request.');
      }
    } catch (err) {
      setErrorMessage('Network error while processing approval.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleRejectClick = (id: string) => {
    setSelectedApprovalId(id);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedApprovalId || !rejectionReason || isSubmittingAction) return;
    setIsSubmittingAction(true);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/v1/agent/approvals/${selectedApprovalId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rejectedBy: 'System Admin (Human in the Loop)',
          reason: rejectionReason,
        }),
      });

      if (res.ok) {
        setShowRejectModal(false);
        await fetchData();
      } else {
        const errData = await res.json();
        setErrorMessage(errData.message || 'Failed to reject request.');
      }
    } catch (err) {
      setErrorMessage('Network error while processing rejection.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const pendingApprovals = approvals.filter((a) => a.status === 'PENDING');

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
      case 'HIGH':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    }
  };

  return (
    <div className="flex-1 bg-slate-955 text-slate-100 flex flex-col h-screen overflow-y-auto p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-brand-400" />
            <span className="text-xs font-semibold text-brand-400 tracking-wider uppercase">Enterprise Agent Control Tower</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-50 flex items-center gap-3">
            Autonomous Agent Control Tower & Governance
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              OPERATIONAL
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Centralized telemetry, predictive incident analysis, vector RAG metrics, and Human-in-the-Loop authorization.
          </p>
        </div>

        {/* Control Tower Tabs */}
        <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex items-center shrink-0 gap-1 shadow-lg">
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'analysis'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Incident Analytics & Insights
          </button>
          <button
            id="tab-pending-approvals"
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Pending Approvals ({pendingApprovals.length})
          </button>
          <button
            id="tab-history-audit"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-slate-800 text-slate-100 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Audit Log History ({history.length})
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Pane */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"></div>
          <p className="text-xs text-slate-400 font-medium">Fetching governance files...</p>
        </div>
      ) : activeTab === 'analysis' ? (
        /* Agent Control Tower Analytics & Insights View */
        <div className="space-y-8 animate-fadeIn pb-12">
          {/* Executive KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>AUTONOMOUS AI RESOLUTIONS</span>
                <Brain className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-3xl font-black text-purple-400">817</div>
              <p className="text-[11px] text-purple-300/80 font-bold">78.4% Auto-Remediated by Agent</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>AVG AI MTTR (SPEEDUP)</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-black text-emerald-400">1.8 min</div>
              <p className="text-[11px] text-emerald-300/80 font-bold">23x faster than manual triage (42 min)</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>RAG CONFIDENCE ACCURACY</span>
                <Activity className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-3xl font-black text-cyan-400">94.6%</div>
              <p className="text-[11px] text-cyan-300/80 font-bold">Avg Vector Match Score: 0.78 / 1.0</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>ESTIMATED COMPUTE COST</span>
                <DollarSign className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black text-amber-400">
                $0.0229 <span className="text-xs text-slate-400 font-normal">/ ticket</span>
              </div>
              <p className="text-[11px] text-amber-300/80 font-bold">genailab-maas-gpt-4o model</p>
            </div>
          </div>

          {/* Grid 1: MTTR Velocity Chart & Resolution Distribution Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Daily Intake & Resolution Velocity */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    7-Day Incident Intake & AI Resolution Velocity
                  </h3>
                  <p className="text-[11px] text-slate-400">Comparing automated AI self-healing velocity vs manual engineer MTTR.</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-purple-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> AI Auto-Resolved
                  </span>
                  <span className="flex items-center gap-1.5 text-brand-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-500"></span> Total Volume
                  </span>
                </div>
              </div>

              {/* Custom SVG Line / Bar Chart */}
              <div className="h-64 relative flex items-end justify-between gap-4 pt-6 pb-2 px-4 bg-slate-950/60 rounded-xl border border-slate-800/80">
                {[
                  { day: 'Thu', total: 142, ai: 118, mttr: '1.6m' },
                  { day: 'Fri', total: 158, ai: 132, mttr: '1.9m' },
                  { day: 'Sat', total: 98, ai: 84, mttr: '1.4m' },
                  { day: 'Sun', total: 82, ai: 71, mttr: '1.2m' },
                  { day: 'Mon', total: 174, ai: 141, mttr: '2.1m' },
                  { day: 'Tue', total: 195, ai: 159, mttr: '1.8m' },
                  { day: 'Today', total: 194, ai: 152, mttr: '1.7m' },
                ].map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                    <div className="text-[10px] font-mono text-emerald-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.mttr}
                    </div>
                    <div className="w-full max-w-[36px] flex items-end justify-center gap-1 h-44 relative">
                      <div
                        style={{ height: `${(d.total / 200) * 100}%` }}
                        className="w-1/2 bg-slate-800 rounded-t-md group-hover:bg-slate-700 transition-all"
                      ></div>
                      <div
                        style={{ height: `${(d.ai / 200) * 100}%` }}
                        className="w-1/2 bg-gradient-to-t from-purple-600 to-indigo-500 rounded-t-md shadow-lg shadow-purple-500/20 group-hover:from-purple-500 group-hover:to-indigo-400 transition-all"
                      ></div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 font-semibold">{d.day}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 2: Resolution Method & Escalation Breakdown */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <PieChart className="w-4 h-4 text-purple-400" />
                  Resolution Tier Breakdown
                </h3>

                <div className="py-6 flex justify-center items-center relative">
                  {/* SVG Donut Chart */}
                  <svg className="w-44 h-44 transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.8"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-purple-500"
                      strokeDasharray="78.4, 100"
                      strokeWidth="3.8"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-cyan-500"
                      strokeDasharray="14.2, 100"
                      strokeDashoffset="-78.4"
                      strokeWidth="3.8"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-amber-500"
                      strokeDasharray="7.4, 100"
                      strokeDashoffset="-92.6"
                      strokeWidth="3.8"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-black text-white">78.4%</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">AI Auto-Healed</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="flex items-center gap-2 font-medium text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> AI Agent SOP Auto-Healing
                  </span>
                  <span className="font-mono font-bold text-purple-400">78.4% (817)</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="flex items-center gap-2 font-medium text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span> Tier-2 Engineer Triage
                  </span>
                  <span className="font-mono font-bold text-cyan-400">14.2% (148)</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="flex items-center gap-2 font-medium text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Tier-3 Expert Escalation
                  </span>
                  <span className="font-mono font-bold text-amber-400">7.4% (78)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Grid 2: Root Causes Progress & RAG Vector Score Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 3: Top Root Cause Categories */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Layers className="w-4 h-4 text-brand-400" />
                Root Cause Category Frequency
              </h3>

              <div className="space-y-4 text-xs">
                {[
                  { name: 'Application & Port Self-Healing (port 8080 / HTTP 503)', percent: 34, count: 354, color: 'from-purple-500 to-indigo-500' },
                  { name: 'Server Kernel & OS Patching (SSSD / systemd / kernel dump)', percent: 24, count: 250, color: 'from-blue-500 to-cyan-500' },
                  { name: 'Database Connection Pool & Vacuuming (PostgreSQL lag)', percent: 18, count: 188, color: 'from-emerald-500 to-teal-500' },
                  { name: 'Security TLS Certificate Expiration & Firewall Ingress', percent: 14, count: 146, color: 'from-amber-500 to-orange-500' },
                  { name: 'User Account Provisioning & Password Resets (Linux PAM)', percent: 10, count: 105, color: 'from-rose-500 to-pink-500' },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-slate-300 font-medium">
                      <span>{item.name}</span>
                      <span className="font-mono font-bold text-white">{item.count} ({item.percent}%)</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        style={{ width: `${item.percent}%` }}
                        className={`h-full bg-gradient-to-r ${item.color} rounded-full transition-all duration-1000`}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 4: Target Host CI Stability Radar */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Server className="w-4 h-4 text-emerald-400" />
                Target Host CI Failure & Auto-Healing Heatmap
              </h3>

              <div className="space-y-3 text-xs">
                {[
                  { ci: 'Worker 1 (192.168.56.10)', ip: '192.168.56.10', incidents: 38, autoRate: '100%', status: 'HEALTHY' },
                  { ci: 'WorkerNode1HL', ip: '192.168.100.102', incidents: 31, autoRate: '94.6%', status: 'HEALTHY' },
                  { ci: 'mainframe-host-01', ip: '192.168.100.101', incidents: 26, autoRate: '88.4%', status: 'HEALTHY' },
                  { ci: 'postgres-prod-01', ip: '10.0.4.15', incidents: 22, autoRate: '95.4%', status: 'HEALTHY' },
                  { ci: 'k8s-prod-cluster-east-1', ip: '10.0.12.80', incidents: 18, autoRate: '83.3%', status: 'MONITORING' },
                ].map((host, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-100 flex items-center gap-2">
                        {host.ci}
                        <span className="text-[10px] font-mono text-slate-500 font-normal">({host.ip})</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Total Incidents: <span className="text-slate-200 font-mono font-bold">{host.incidents}</span></div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {host.autoRate} AI Auto-Healed
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Insights & Predictive Guidance Feed */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-2xl space-y-4">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2 border-b border-indigo-500/30 pb-3">
              <Brain className="w-4 h-4 text-purple-400" />
              AI Agentic Insights & Control Recommendations
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2">
                <div className="font-bold text-purple-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> High Frequency Pattern Detected
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Worker 1 (`192.168.56.10`) exhibits recurring port 8080 down events. AI SOP `KB0000003` resolved 100% of tickets with 1.8 min MTTR.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-2">
                <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Vector Threshold Calibration
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  RAG score threshold calibrated to `0.45` routes 94.6% of incident titles accurately to exact Knowledge Base articles while preventing false positives.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/30 space-y-2">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Zero Human Intervention
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Self-Learning Synthesizer generated 4 new SOPs this week with 100% administrator approval rate in the `AgentApproval` queue.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'pending' ? (
        <div className="space-y-6">
          {pendingApprovals.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-12 text-center flex flex-col items-center justify-center max-w-2xl mx-auto mt-12">
              <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center mb-4 text-slate-500">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">No Pending Approvals</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-sm">
                All synthesized agent runbooks have been triaged. The UNIX resolver daemon is idling or performing automatic low-risk routines.
              </p>
            </div>
          ) : (
            pendingApprovals.map((req) => (
              <div
                key={req.id}
                className="bg-slate-900 border border-slate-800/80 rounded-xl shadow-md overflow-hidden transition-all hover:border-slate-700/60"
              >
                {/* Request Header */}
                <div className="border-b border-slate-800/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4 bg-slate-900/40">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-brand-400 tracking-wider bg-brand-500/10 border border-brand-500/20 px-2.5 py-1 rounded">
                      {req.id}
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <span>Incident {req.incidentId}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-slate-400 font-normal">{req.incidentTitle}</span>
                      </h2>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${getRiskBadgeColor(req.riskLevel)}`}>
                      RISK: {req.riskLevel}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      CONFIDENCE: {req.confidenceScore > 100 ? (req.confidenceScore / 100).toFixed(0) : req.confidenceScore}%
                    </span>
                  </div>
                </div>

                {/* Request Body */}
                <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Metadata & AI reasoning */}
                  <div className="lg:col-span-1 space-y-4">
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/60 space-y-3">
                      <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-slate-500" /> Agent Identity
                        </span>
                        <span className="font-semibold text-slate-200">{req.agentName}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-slate-500" /> Exec Engine
                        </span>
                        <span className="font-semibold text-slate-300 font-mono text-[10px]">{req.model}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-slate-500" /> Target Host CI
                        </span>
                        <span className="font-semibold text-slate-200">{req.targetCi}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" /> Requested Time
                        </span>
                        <span className="font-semibold text-slate-300">
                          {new Date(req.requestedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-slate-500" /> AI Diagnostic Reasoning
                      </h4>
                      <p className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800/60 leading-relaxed font-medium">
                        {req.aiReasoning}
                      </p>
                    </div>
                  </div>

                  {/* Center Column: Safety Checks & Summary */}
                  <div className="lg:col-span-1 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Safety Validation Checks
                      </h4>
                      <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/60 space-y-2.5">
                        {req.safetyChecks && req.safetyChecks.length > 0 ? (
                          req.safetyChecks.map((check, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              {check.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                              )}
                              <span className={check.passed ? 'text-slate-300' : 'text-rose-400'}>
                                {check.check}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 italic">No automated safety checks registered.</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-slate-500" /> Change Summary
                      </h4>
                      <p className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800/60 leading-relaxed font-medium">
                        {req.summary}
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Proposed Commands & Actions */}
                  <div className="lg:col-span-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-indigo-400" /> Synthesized SOP Commands
                      </h4>
                      <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/60 font-mono text-[11px] text-slate-300 space-y-1.5 max-h-48 overflow-y-auto leading-relaxed shadow-inner">
                        {req.proposedCommands && req.proposedCommands.length > 0 ? (
                          req.proposedCommands.map((cmd, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className="text-slate-600 font-bold select-none">{idx + 1}</span>
                              <span className="text-indigo-300 break-all">{cmd}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500 italic">No commands proposed.</span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 mt-6">
                      <button
                        id={`btn-approve-${req.id}`}
                        onClick={() => handleApprove(req.id)}
                        disabled={isSubmittingAction}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white py-2.5 px-4 rounded-lg text-xs font-bold shadow-md shadow-emerald-900/10 transition-all border border-emerald-500/20 active:scale-95 disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 shrink-0 fill-current" />
                        <span>{isSubmittingAction ? 'Executing...' : 'Approve & Execute'}</span>
                      </button>
                      <button
                        id={`btn-reject-${req.id}`}
                        onClick={() => handleRejectClick(req.id)}
                        disabled={isSubmittingAction}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 px-4 rounded-lg text-xs font-bold transition-all border border-slate-700 active:scale-95 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5 shrink-0" />
                        <span>Reject Request</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Audit History Log */
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800/80 font-bold text-[10px] tracking-wider uppercase select-none">
                  <th className="px-6 py-4">Audit ID</th>
                  <th className="px-6 py-4">Target Incident</th>
                  <th className="px-6 py-4">Assigned Agent</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Execution Type</th>
                  <th className="px-6 py-4">Approved By</th>
                  <th className="px-6 py-4 text-right">Time Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-500 italic">
                      No historical governance events registered in audit logs.
                    </td>
                  </tr>
                ) : (
                  history.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/20 transition-all font-medium">
                      <td className="px-6 py-4 font-bold text-slate-300">{item.id}</td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/incidents/${item.incidentId}`}
                          className="flex items-center gap-1.5 hover:text-brand-400 transition-all"
                        >
                          <span className="font-bold text-brand-400 underline">{item.incidentId}</span>
                          <span className="text-slate-400 truncate max-w-xs">{item.incidentTitle}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        <div className="flex flex-col">
                          <span>{item.agentName}</span>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">{item.model}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.status === 'APPROVED' || item.status === 'AUTO_EXECUTED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{item.actionType}</td>
                      <td className="px-6 py-4 text-slate-300 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>{item.humanApprover}</span>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-400 font-normal">
                        {new Date(item.executedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden p-6 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" /> Reject Governance SOP
              </h3>
              <button
                id="btn-close-reject-modal"
                onClick={() => setShowRejectModal(false)}
                className="text-slate-500 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Please provide operational reason for rejecting this synthesized SOP. This rejection reason will be posted as a work note and logged in the governance audit trail.
            </p>
            
            <textarea
              id="txt-rejection-reason"
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Commands look risky. Check config paths before restarting containerd daemon."
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-medium leading-relaxed"
            />
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                id="btn-cancel-rejection"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-rejection"
                onClick={handleRejectSubmit}
                disabled={!rejectionReason.trim() || isSubmittingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md shadow-rose-900/10 border border-rose-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmittingAction ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
