import React from 'react';
import {
  ShieldCheck,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Cpu,
  Brain,
  Layers,
  ArrowUpRight,
  ExternalLink,
  Radio,
  Server,
  Sparkles,
  ChevronRight,
  Clock,
  DollarSign,
  Lock,
  Filter,
  Flame,
  FileCheck2,
  SlidersHorizontal,
  Bot
} from 'lucide-react';
import { AgentApproval } from './PendingApprovalsView';

interface OverviewProps {
  approvals: AgentApproval[];
  stats: any;
  loading: boolean;
  onNavigateTab: (tabId: string) => void;
}

export function AIControlTowerOverview({ approvals, stats, loading, onNavigateTab }: OverviewProps) {
  // Recommendations derived from system telemetry
  const recommendations = [
    {
      id: 'rec-1',
      title: 'Review High-Impact HITL Remediation Request',
      description: approvals.length > 0
        ? `${approvals.length} pending human-in-the-loop approval(s) waiting for operator authorization.`
        : 'All critical agent execution requests are currently reviewed and authorized.',
      severity: approvals.length > 0 ? 'CRITICAL' : 'OPTIMAL',
      actionText: approvals.length > 0 ? 'Open HITL Gate' : 'View Approvals',
      targetTab: 'approvals',
      badge: approvals.length > 0 ? `${approvals.length} Urgent` : 'Healthy',
      color: approvals.length > 0 ? 'amber' : 'emerald',
    },
    {
      id: 'rec-2',
      title: 'Automated SOP Re-Synthesis Recommended',
      description: '49 Active Reusable Investigative SOPs indexed in ChromaDB. Vector similarity confidence: 94.2%.',
      severity: 'INFO',
      actionText: 'Explore 3D Vector Universe',
      targetTab: 'vector',
      badge: '49 SOPs',
      color: 'purple',
    },
    {
      id: 'rec-3',
      title: 'EU AI Act & ISO 42001 Compliance Verification',
      description: 'Active governance enforcement is at 96.4% compliance. Least privilege SSH & PAM containment verified.',
      severity: 'SUCCESS',
      actionText: 'View Compliance Posture',
      targetTab: 'risk',
      badge: '96.4% Compliant',
      color: 'cyan',
    },
  ];

  const recentIncidents = [
    { id: 'INC8127335', host: 'WorkerNode1HL', sop: 'KB0000036', status: 'RESOLVED', action: 'Restricted Sudoers Provisioning (5 Users)', time: '3m ago' },
    { id: 'INC8127330', host: 'control plane', sop: 'KB0000050', status: 'APPROVED', action: 'ReAct Loop Throttle runaway kube-apiserver', time: '18m ago' },
    { id: 'INC8127329', host: 'WorkerNode1HL', sop: 'KB0000048', status: 'RESOLVED', action: 'K8s CNI Network Flannel Interface Fix', time: '42m ago' },
    { id: 'INC8127325', host: 'control plane', sop: 'KB0000045', status: 'RESOLVED', action: 'Etcd Cluster Disk Defrag & Compaction', time: '1h ago' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. ServiceNow AI Control Tower Recommendations Banner */}
      <div className="pro-card rounded-2xl p-5 border border-slate-800 bg-gradient-to-r from-slate-900/90 via-[#0e1719]/90 to-slate-900/90 backdrop-blur-xl relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">AI CONTROL TOWER RECOMMENDATIONS</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Active AI Insights
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time active governance actions, pending asset reviews, and autonomous remediation alerts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab('inventory')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-700 shadow-sm"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI Asset Inventory</span>
            </button>
            <button
              onClick={() => onNavigateTab('risk')}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Security Posture</span>
            </button>
          </div>
        </div>

        {/* 3 Horizontal Recommendation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              onClick={() => onNavigateTab(rec.targetTab)}
              className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
                rec.color === 'amber'
                  ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-950/30'
                  : rec.color === 'purple'
                  ? 'bg-purple-950/20 border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-950/30'
                  : 'bg-cyan-950/20 border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-950/30'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                      rec.color === 'amber'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                        : rec.color === 'purple'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    }`}
                  >
                    {rec.badge}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition" />
                </div>
                <h3 className="text-xs font-extrabold text-white group-hover:text-cyan-300 transition">
                  {rec.title}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                  {rec.description}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-slate-300 group-hover:text-cyan-300">
                <span>{rec.actionText}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Executive KPI Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bento 1: AI Asset Inventory Count */}
        <div
          onClick={() => onNavigateTab('inventory')}
          className="pro-card rounded-2xl p-5 cursor-pointer relative overflow-hidden group hover:border-cyan-500/50"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Managed AI Assets
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-110 transition">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">16</span>
            <span className="text-xs text-emerald-400 font-bold">● 100% Active</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2 font-mono">
            <span>4 Agents</span>
            <span>4 Models</span>
            <span>49 SOPs</span>
          </div>
        </div>

        {/* Bento 2: HITL Approvals Gate */}
        <div
          onClick={() => onNavigateTab('approvals')}
          className={`pro-card rounded-2xl p-5 cursor-pointer relative overflow-hidden group ${
            approvals.length > 0 ? 'border-amber-500/50 glow-amber' : 'hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              HITL Human Gate
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:scale-110 transition">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black font-mono ${approvals.length > 0 ? 'text-amber-400 animate-pulse' : 'text-white'}`}>
              {approvals.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {approvals.length > 0 ? 'Pending Authorization' : 'All Clear'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2 font-mono">
            <span>Gate Mode: <strong className="text-emerald-400">ENFORCED</strong></span>
          </div>
        </div>

        {/* Bento 3: Autonomous MTTR & Resolution Rate */}
        <div
          onClick={() => onNavigateTab('value')}
          className="pro-card rounded-2xl p-5 cursor-pointer relative overflow-hidden group hover:border-emerald-500/50"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Autonomous MTTR
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-emerald-400">38s</span>
            <span className="text-xs text-slate-400 line-through">4.2h manual</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2 font-mono">
            <span>Success Rate: <strong className="text-emerald-400">98.9%</strong></span>
            <span>Saved: <strong>142 hrs</strong></span>
          </div>
        </div>

        {/* Bento 4: Compliance Posture Score */}
        <div
          onClick={() => onNavigateTab('risk')}
          className="pro-card rounded-2xl p-5 cursor-pointer relative overflow-hidden group hover:border-purple-500/50"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Compliance Posture
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-110 transition">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-purple-400">96.4%</span>
            <span className="text-xs text-emerald-400 font-bold">EU AI Act Pass</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2 font-mono">
            <span>ISO 42001: <strong>Compliant</strong></span>
            <span>Kill Switch: <strong className="text-emerald-400">ARMED</strong></span>
          </div>
        </div>
      </div>

      {/* 3. Operational Hub: Live Fleet Stream & Asset Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Execution & Incident Stream */}
        <div className="lg:col-span-2 pro-card rounded-2xl p-5 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                Live Agent Execution & Remediation Stream
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('timeline')}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Full ReAct Trace</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5">
            {recentIncidents.map((inc) => (
              <div
                key={inc.id}
                onClick={() => onNavigateTab('timeline')}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-cyan-500/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono font-bold text-xs text-cyan-400 group-hover:underline">
                    {inc.id}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                    {inc.host}
                  </span>
                  <span className="text-xs text-slate-300 font-medium truncate">
                    {inc.action}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 text-xs">
                  <span className="font-mono text-[10px] text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/30">
                    {inc.sop}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                      inc.status === 'RESOLVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {inc.status}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">{inc.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: AI Fleet Architecture & Active Guardrails */}
        <div className="pro-card rounded-2xl p-5 border border-slate-800 space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  Fleet Engine Status
                </h3>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5 font-mono">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Active LLM Model</span>
                  <span className="text-cyan-300 font-bold">NVIDIA NIM Llama-3.3 70B</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Fallback Router</span>
                  <span className="text-slate-300">Nemotron-3.5 30B</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>ITSM MCP Protocol</span>
                  <span className="text-emerald-400 font-bold">Port 3001 (Active)</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                  Active Guardrails
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Host Mutex SSH Whitelist</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Post-Remediation Verification Guard</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Prompt Injection & Tool Isolation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('config')}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Configure AI Engine</span>
          </button>
        </div>
      </div>
    </div>
  );
}
