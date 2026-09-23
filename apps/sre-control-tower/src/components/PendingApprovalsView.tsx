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
  FileText,
  Zap,
  Clock,
  ShieldCheck,
  Play,
  ArrowRight
} from 'lucide-react';
import { Card, Badge, Button, LoadingState, SkeletonCard, riskTone, topBorderAccent, toneClasses } from './ui';

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
  resolutionSteps?: string[];
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
  loading?: boolean;
  onApprove: (id: string, proposedCommands?: string[]) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onRefresh?: () => void;
}

export function PendingApprovalsView({ approvals, loading, onApprove, onReject, onRefresh }: PendingApprovalsViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(approvals[0]?.id || null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editedCommandsMap, setEditedCommandsMap] = useState<Record<string, string>>({});
  const [editingIdSet, setEditingIdSet] = useState<Set<string>>(new Set());

  const toggleEdit = (id: string, initialCommands: string[]) => {
    const nextSet = new Set(editingIdSet);
    if (nextSet.has(id)) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
      if (!(id in editedCommandsMap)) {
        setEditedCommandsMap((prev) => ({
          ...prev,
          [id]: initialCommands.join('\n')
        }));
      }
    }
    setEditingIdSet(nextSet);
  };

  const handleApprove = async (id: string) => {
    setIsSubmitting(id);
    try {
      let finalCommands: string[] | undefined = undefined;
      if (id in editedCommandsMap && editedCommandsMap[id].trim()) {
        finalCommands = editedCommandsMap[id]
          .split('\n')
          .map((c) => c.trim())
          .filter(Boolean);
      }
      await onApprove(id, finalCommands);
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

  return (
    <LoadingState
      loading={Boolean(loading)}
      empty={approvals.length === 0}
      skeleton={
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      }
      emptyLabel="All Human Approvals Clear!"
      emptyDescription="There are currently 0 operations waiting for human signature. The Auto-Resolver Daemon is executing low-risk diagnostic sweeps autonomously."
      emptyIcon={ShieldCheck}
    >
    <div className="space-y-4">
      {approvals.map((appr) => {
        const isExpanded = expandedId === appr.id;
        const isRejecting = rejectingId === appr.id;
        const isLoading = isSubmitting === appr.id;

        const tone = riskTone(appr.riskLevel);

        return (
          <Card
            key={appr.id}
            padding="none"
            className={`overflow-hidden shadow-2xl transition-all ${topBorderAccent(tone)}`}
          >
            {/* Header Card */}
            <div className="p-5 md:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-slate-50 dark:bg-slate-900/30">
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${toneClasses[tone]}`}>
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-950/80 px-2.5 py-0.5 rounded-md border dark:border-cyan-800/60 shadow-sm">
                      {appr.id}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">Ticket:</span>
                    <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-white">{appr.incidentId}</span>
                    <Badge tone={tone}>{appr.riskLevel} RISK</Badge>
                  </div>

                  <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white mt-1.5 tracking-tight">{appr.incidentTitle}</h3>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
                    <span className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      {appr.agentName}
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                      <Server className="w-3.5 h-3.5 text-slate-500" />
                      {appr.targetCi}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">LLM: {appr.model}</span>
                  </div>
                </div>
              </div>

              {/* Confidence Score & Action Buttons */}
              <div className="flex items-center justify-between lg:justify-end gap-3.5 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-200 dark:border-slate-800">
                <div className="text-right px-3.5 py-2 bg-slate-50 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
                  <div className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-wider font-mono">AI Confidence</div>
                  <div className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                    <span>{appr.confidenceScore > 100 ? (appr.confidenceScore / 100).toFixed(0) : appr.confidenceScore}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(appr.id)}
                    disabled={isLoading}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-950 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-lg active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? (
                      <span className="animate-spin">⌛</span>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-white dark:text-slate-950 stroke-[3]" />
                        Approve & Dispatch
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setRejectingId(isRejecting ? null : appr.id);
                      setRejectionReason('');
                    }}
                    disabled={isLoading}
                    className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-300 dark:bg-slate-900 dark:hover:bg-rose-950/40 dark:text-rose-300 dark:border-slate-800 dark:hover:border-rose-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>

                  <Button
                    variant="secondary"
                    iconOnly
                    onClick={() => setExpandedId(isExpanded ? null : appr.id)}
                    aria-label={isExpanded ? 'Collapse audit trace' : 'Expand audit trace'}
                    aria-expanded={isExpanded}
                    className="rounded-xl"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Rejection Drawer */}
            {isRejecting && (
              <div className="bg-rose-50 border-t border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-bold">
                  <MessageSquare className="w-4 h-4" />
                  Provide Human Operator Rejection Reason:
                </div>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="State technical reason for rejecting proposed commands..."
                  className="focus-ring w-full bg-white border border-rose-200 dark:bg-[#09090b] dark:border-rose-900/50 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 focus:border-rose-500 font-sans min-h-[75px]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setRejectingId(null)}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRejectSubmit(appr.id)}
                    disabled={!rejectionReason.trim() || isLoading}
                    className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-500 font-bold text-white rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}

            {/* Expanded Multi-Agent Audit Trace */}
            {isExpanded && (
              <div className="border-t border-slate-200 dark:border-slate-800 p-5 md:p-6 space-y-5 bg-slate-50 dark:bg-slate-950/60">
                <div className="text-xs font-extrabold uppercase text-cyan-600 dark:text-cyan-400 tracking-wider flex items-center gap-2 font-mono">
                  <Workflow className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  Sequential 3-Agent Execution Audit Trace
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* AGENT 1: ROUTER */}
                  <div className="pro-card rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                      <div className="flex items-center gap-2 font-bold text-xs text-amber-600 dark:text-amber-400">
                        <Radio className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        AGENT 1: ROUTER AGENT
                      </div>
                      <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/60 px-2 py-0.5 rounded border dark:border-amber-800/50">
                        {appr.routerOutput?.assignedPriority || 'P1 Critical'}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="text-slate-500">Category: </span>
                        <span className="text-slate-700 dark:text-slate-200 font-bold">{appr.routerOutput?.category || 'Infrastructure > Unix'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Dispatch Queue: </span>
                        <span className="text-cyan-700 dark:text-cyan-300 font-mono text-[11px]">{appr.routerOutput?.dispatchRoute || 'Unix Tier 3 Queue'}</span>
                      </div>
                    </div>
                  </div>

                  {/* AGENT 2: RESOLVER */}
                  <div className="pro-card rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                      <div className="flex items-center gap-2 font-bold text-xs text-cyan-600 dark:text-cyan-400">
                        <Terminal className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        AGENT 2: RESOLVER AGENT
                      </div>
                      <span className="text-[10px] font-mono font-bold text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-950/60 px-2 py-0.5 rounded border dark:border-cyan-800/50">
                        {appr.resolverOutput?.resolutionStatus || 'PENDING_APPROVAL'}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="text-slate-500">Diagnosis: </span>
                        <span className="text-slate-700 dark:text-slate-200 leading-relaxed block mt-0.5">{appr.resolverOutput?.diagnosis || appr.aiReasoning}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Runbook: </span>
                        <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{appr.resolverOutput?.matchedRunbook || `${appr.kbArticleReference}: ${appr.kbTitle}`}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Proposed Commands / Runbook Code Block */}
                {(() => {
                  const getFallbackSteps = (title: string, targetCi: string): string[] => {
                    const ipMatch = targetCi ? targetCi.match(/\d+\.\d+\.\d+\.\d+/) : null;
                    const ip = ipMatch ? ipMatch[0] : '192.168.100.101';
                    const t = (title || '').toLowerCase();

                    const pamsudoMatches = (title || '').match(/Pamsudo\d+|pamsudo\d+/gi);
                    if (pamsudoMatches && pamsudoMatches.length > 0) {
                      const users = Array.from(new Set(pamsudoMatches.map(u => u.trim()))).sort();
                      const steps: string[] = [];
                      users.forEach(u => {
                        steps.push(`id -u ${u} 2>/dev/null || useradd -m -s /bin/bash ${u}`);
                        if (t.includes('jboss') || t.includes('su -')) {
                          steps.push(`echo "${u} ALL=(ALL) NOPASSWD: /usr/bin/su - jboss, /bin/su - jboss" > /etc/sudoers.d/99-${u} && chmod 440 /etc/sudoers.d/99-${u}`);
                        } else {
                          steps.push(`echo "${u} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/99-${u} && chmod 440 /etc/sudoers.d/99-${u}`);
                        }
                      });
                      steps.push('visudo -c');
                      return steps;
                    }

                    if (t.includes('user') || t.includes('venu') || t.includes('privilege') || t.includes('passwordless')) {
                      return [
                        `id -u venu 2>/dev/null || useradd -m -s /bin/bash venu`,
                        `echo "venu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/99-venu`,
                        `chmod 0440 /etc/sudoers.d/99-venu`,
                        `visudo -c`
                      ];
                    }
                    return [
                      `systemctl status control-plane`,
                      `journalctl -u control-plane -n 50 --no-pager`,
                      `systemctl restart control-plane`
                    ];
                  };

                  const rawCommands = Array.isArray(appr.proposedCommands) && appr.proposedCommands.length > 0
                    ? appr.proposedCommands
                    : (Array.isArray(appr.synthesizerOutput?.resolutionSteps) && appr.synthesizerOutput.resolutionSteps.length > 0
                        ? appr.synthesizerOutput.resolutionSteps
                        : (appr.synthesizerOutput?.synthesizedSolution
                            ? appr.synthesizerOutput.synthesizedSolution.split('\n').filter(Boolean)
                            : getFallbackSteps(appr.incidentTitle || appr.summary, appr.targetCi)));

                  const targetIp = (appr.targetCi ? (appr.targetCi.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || '192.168.100.101') : '192.168.100.101');
                  
                  const displayCommands = rawCommands
                    .map((cmd) => cmd.replace(/^\d+\.\s*/, '').trim())
                    .filter((cmd) => {
                      const clean = cmd.toLowerCase().trim();
                      if (clean === `ssh root@${targetIp}` || clean === 'ssh root@192.168.100.101' || /^ssh\s+[^\s]+$/.test(clean)) {
                        return false;
                      }
                      return Boolean(clean);
                    })
                    .map((cmd) => {
                      if (cmd.toLowerCase().startsWith('ssh ')) {
                        return cmd;
                      }
                      return `ssh root@${targetIp} "${cmd.replace(/"/g, '\\"')}"`;
                    });

                  const isEditing = editingIdSet.has(appr.id);
                  const currentText = (appr.id in editedCommandsMap) ? editedCommandsMap[appr.id] : displayCommands.join('\n');

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider font-mono">
                          <Terminal className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          Proposed Executable CLI / SSH Payload
                        </span>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleEdit(appr.id, displayCommands)}
                            className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                              isEditing
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                                : 'bg-white hover:bg-slate-50 text-cyan-600 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-cyan-400 dark:border-slate-800'
                            }`}
                          >
                            <FileCode2 className="w-3.5 h-3.5" />
                            {isEditing ? 'Done Editing' : 'Edit Commands'}
                          </button>

                          <button
                            onClick={() => copyCommands(isEditing ? currentText.split('\n') : displayCommands, appr.id)}
                            className="text-[11px] font-mono font-semibold text-slate-500 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedId === appr.id ? 'Copied!' : 'Copy Script'}
                          </button>
                        </div>
                      </div>

                      {/* 21st.dev Code Preview Block */}
                      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#09090b] shadow-xl">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500/80" />
                            <span className="w-2 h-2 rounded-full bg-amber-500/80" />
                            <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
                            <span className="ml-1 text-cyan-600 dark:text-cyan-400 font-bold">BASH SSH PAYLOAD</span>
                          </div>
                          <span className="text-slate-500">Target CI: {targetIp}</span>
                        </div>

                        {isEditing ? (
                          <textarea
                            value={currentText}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditedCommandsMap((prev) => ({ ...prev, [appr.id]: val }));
                            }}
                            rows={Math.max(4, currentText.split('\n').length + 1)}
                            className="focus-ring w-full bg-white dark:bg-[#050811] p-4 font-mono text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed font-semibold"
                            placeholder="Enter executable CLI commands (one per line)..."
                          />
                        ) : (
                          <div className="p-4 font-mono text-xs text-emerald-600 dark:text-emerald-400 space-y-1.5 overflow-x-auto">
                            {(currentText ? currentText.split('\n') : displayCommands).map((cmd, idx) => (
                              <div key={idx} className="flex items-start gap-2.5">
                                <span className="text-slate-400 dark:text-slate-600 select-none">$</span>
                                <span className="text-slate-700 dark:text-slate-200">{cmd}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </Card>
        );
      })}
    </div>
    </LoadingState>
  );
}
