import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Terminal,
  BrainCircuit,
  FileCode2,
  Server,
  AlertOctagon,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  MessageSquare,
  Copy,
  Cpu,
  Radio,
  Workflow,
  Lightbulb,
  FileText
} from 'lucide-react';

export interface SafetyCheck {
  check: string;
  passed: boolean;
}

export interface RouterAgentOutput {
  ticketId: string;
  category: string;
  impactUrgency: string;
  assignedPriority: string;
  dispatchRoute: string;
  userAcknowledgment: string;
}

export interface ResolverAgentOutput {
  diagnosis: string;
  matchedRunbook: string;
  remediationStepsApplied: string[];
  resolutionStatus: string;
  userResolutionNotice: string;
}

export interface SynthesizerAgentOutput {
  draftKbId: string;
  kbTitle: string;
  synthesizedSolution: string;
  trendInsight: string;
}

export interface AgentApproval {
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
  routerOutput?: RouterAgentOutput;
  resolverOutput?: ResolverAgentOutput;
  synthesizerOutput?: SynthesizerAgentOutput;
}

interface PendingApprovalsViewProps {
  approvals: AgentApproval[];
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}

export function PendingApprovalsView({ approvals, onApprove, onReject }: PendingApprovalsViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(approvals[0]?.id || null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'CRITICAL':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'HIGH':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'MEDIUM':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
  };

  const handleApprove = async (id: string) => {
    setIsSubmitting(id);
    try {
      await onApprove(id);
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleRejectSubmit = async (id: string) => {
    if (!rejectionReason.trim()) return;
    setIsSubmitting(id);
    try {
      await onReject(id, rejectionReason);
      setRejectingId(null);
      setRejectionReason('');
    } finally {
      setIsSubmitting(null);
    }
  };

  const copyCommands = (cmds: string[], id: string) => {
    navigator.clipboard.writeText(cmds.join('\n'));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (approvals.length === 0) {
    return (
      <div className="bg-[#111827] border border-slate-800/80 rounded-2xl p-16 text-center flex flex-col items-center justify-center shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-950/20">
          <CheckCircle2 className="w-8 h-8 animate-pulse" />
        </div>
        <h3 className="text-xl font-bold text-slate-100">All Approvals Clear!</h3>
        <p className="text-sm text-slate-400 max-w-md mt-2 leading-relaxed">
          There are currently no high-risk autonomous agent operations waiting for human signature. Low-risk background policies are executing clean health sweeps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvals.map((appr) => {
        const isExpanded = expandedId === appr.id;
        const isRejecting = rejectingId === appr.id;
        const isLoading = isSubmitting === appr.id;

        return (
          <div
            key={appr.id}
            className={`bg-[#111827] border transition-all rounded-2xl overflow-hidden shadow-xl ${
              appr.riskLevel === 'CRITICAL'
                ? 'border-rose-500/40 hover:border-rose-500/60'
                : 'border-slate-800 hover:border-slate-700'
            }`}
          >
            {/* Header Card */}
            <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-slate-900/40">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-md ${getRiskBadge(
                    appr.riskLevel
                  )}`}
                >
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-md border border-cyan-800/60 shadow-sm">
                      {appr.id}
                    </span>
                    <span className="font-mono text-xs text-slate-400">Target Ticket:</span>
                    <span className="font-mono text-xs font-extrabold text-slate-100">{appr.incidentId}</span>
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border tracking-wide ${getRiskBadge(
                        appr.riskLevel
                      )}`}
                    >
                      {appr.riskLevel} RISK
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-100 mt-2 tracking-tight">{appr.incidentTitle}</h3>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-400 mt-2">
                    <span className="flex items-center gap-1.5 text-slate-200 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      {appr.agentName}
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Server className="w-3.5 h-3.5 text-slate-500" />
                      {appr.targetCi}
                    </span>
                    <span className="text-slate-400 font-mono">LLM: {appr.model}</span>
                  </div>
                </div>
              </div>

              {/* Confidence Score & Action Buttons */}
              <div className="flex items-center justify-between lg:justify-end gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                <div className="text-right px-4 py-2 bg-slate-950/60 rounded-xl border border-slate-800/80 shadow-inner">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Confidence</div>
                  <div className="text-base font-black text-emerald-400 flex items-center justify-end gap-1">
                    <span>{appr.confidenceScore}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(appr.id)}
                    disabled={isLoading}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 active:scale-95 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span className="animate-spin">⌛</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Approve & Execute
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setRejectingId(isRejecting ? null : appr.id);
                      setRejectionReason('');
                    }}
                    disabled={isLoading}
                    className="px-4 py-2.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : appr.id)}
                    className="p-2.5 text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700 transition-all"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Rejection Drawer */}
            {isRejecting && (
              <div className="bg-rose-950/20 border-t border-rose-900/40 p-5 space-y-3">
                <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                  <MessageSquare className="w-4 h-4" />
                  Provide Human Operator Rejection Reason:
                </div>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="State technical reason for rejecting proposed commands..."
                  className="w-full bg-[#0b0f19] border border-rose-900/50 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-sans min-h-[80px]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setRejectingId(null)}
                    className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRejectSubmit(appr.id)}
                    disabled={!rejectionReason.trim() || isLoading}
                    className="px-5 py-2 text-xs bg-rose-600 hover:bg-rose-500 font-bold text-white rounded-lg transition-all disabled:opacity-50"
                  >
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}

            {/* Expanded 3-AGENT REPORT VIEW */}
            {isExpanded && (
              <div className="border-t border-slate-800 p-6 space-y-6 bg-[#0b0f19]/80">
                <div className="text-xs font-extrabold uppercase text-cyan-400 tracking-wider flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-cyan-400" />
                  Sequential 3-Agent Execution Pipeline Audit Report
                </div>

                {/* 3-Agent Cards Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* AGENT 1: ROUTER AGENT */}
                  <div className="bg-[#111827] border border-slate-800/80 rounded-2xl p-5 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2 font-bold text-xs text-amber-400">
                        <Radio className="w-4 h-4 text-amber-400" />
                        AGENT 1: 🚦 ROUTER AGENT
                      </div>
                      <span className="text-[10px] font-black text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                        {appr.routerOutput?.assignedPriority || 'P1 Critical'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">Category: </span>
                        <span className="text-slate-200 font-bold">{appr.routerOutput?.category || 'Infrastructure > Unix'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Impact / Urgency: </span>
                        <span className="text-slate-200 font-semibold">{appr.routerOutput?.impactUrgency || 'High / High'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Dispatch Queue: </span>
                        <span className="text-cyan-300 font-mono text-[11px]">{appr.routerOutput?.dispatchRoute || 'Unix Tier 3 Queue'}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-800/60 text-slate-300 text-[11px] italic bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                        "{appr.routerOutput?.userAcknowledgment || 'Incident acknowledged. Dispatching auto-resolver agent.'}"
                      </div>
                    </div>
                  </div>

                  {/* AGENT 2: RESOLVER AGENT */}
                  <div className="bg-[#111827] border border-slate-800/80 rounded-2xl p-5 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2 font-bold text-xs text-cyan-400">
                        <Terminal className="w-4 h-4 text-cyan-400" />
                        AGENT 2: 🛠️ RESOLVER AGENT
                      </div>
                      <span className="text-[10px] font-black text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                        {appr.resolverOutput?.resolutionStatus || 'PENDING_APPROVAL'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">Diagnosis: </span>
                        <span className="text-slate-200 leading-relaxed block mt-0.5">{appr.resolverOutput?.diagnosis || appr.aiReasoning}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Runbook: </span>
                        <span className="text-cyan-400 font-semibold">{appr.resolverOutput?.matchedRunbook || `${appr.kbArticleReference}: ${appr.kbTitle}`}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-800/60 text-slate-300 text-[11px] bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                        "{appr.resolverOutput?.userNotice || 'Remediation formulated. Paused for human signature.'}"
                      </div>
                    </div>
                  </div>

                  {/* AGENT 3: KNOWLEDGE SYNTHESIZER AGENT */}
                  <div className="bg-[#111827] border border-slate-800/80 rounded-2xl p-5 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2 font-bold text-xs text-emerald-400">
                        <BrainCircuit className="w-4 h-4 text-emerald-400" />
                        AGENT 3: 🧠 KNOWLEDGE SYNTHESIZER
                      </div>
                      <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                        {appr.synthesizerOutput?.draftKbId || 'KB-90045'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">Draft KB Title: </span>
                        <span className="text-emerald-300 font-bold block mt-0.5">{appr.synthesizerOutput?.kbTitle || 'SOP: High Kernel Contention Recovery'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Synthesized Fix: </span>
                        <span className="text-slate-300 leading-relaxed block mt-0.5">{appr.synthesizerOutput?.synthesizedSolution || 'Issue SIGKILL and flush drop_caches memory.'}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-800/60 text-emerald-400 text-[11px] bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-900/40">
                        💡 <span className="font-bold">Trend Insight:</span> {appr.synthesizerOutput?.trendInsight || '3rd occurrence this week. Recommend Problem Ticket PRB-0042.'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Proposed Commands & Pre-flight Checks */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-slate-200 flex items-center gap-2 uppercase tracking-wider">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      Proposed Executable CLI / SSH Payload
                    </span>
                    <button
                      onClick={() => copyCommands(appr.proposedCommands, appr.id)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedId === appr.id ? 'Copied!' : 'Copy Script'}
                    </button>
                  </div>

                  <div className="bg-[#080c14] border border-slate-800 rounded-xl p-4 font-mono text-xs text-emerald-400 space-y-2 overflow-x-auto shadow-inner">
                    {appr.proposedCommands.map((cmd, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <span className="text-slate-600 select-none">$</span>
                        <span className="text-slate-100">{cmd}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
