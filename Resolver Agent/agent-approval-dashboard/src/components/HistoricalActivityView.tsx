import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  Search,
  Filter,
  UserCheck,
  Zap,
  Server,
  FileText,
  ChevronDown,
  ChevronUp,
  Cpu,
  Radio,
  Workflow,
  BrainCircuit,
  Lightbulb
} from 'lucide-react';

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

export interface AgentHistoryEntry {
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
  kbGenerated?: string;
  routerOutput?: RouterAgentOutput;
  resolverOutput?: ResolverAgentOutput;
  synthesizerOutput?: SynthesizerAgentOutput;
}

interface HistoricalActivityViewProps {
  history: AgentHistoryEntry[];
}

export function HistoricalActivityView({ history }: HistoricalActivityViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'AUTO_EXECUTED' | 'REJECTED'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredHistory = history.filter((item) => {
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      item.incidentId.toLowerCase().includes(searchLower) ||
      item.incidentTitle.toLowerCase().includes(searchLower) ||
      item.agentName.toLowerCase().includes(searchLower) ||
      item.targetCi.toLowerCase().includes(searchLower) ||
      item.commandExecuted.toLowerCase().includes(searchLower);

    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          icon: CheckCircle2,
          label: 'Human Approved',
        };
      case 'AUTO_EXECUTED':
        return {
          bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
          icon: Zap,
          label: 'Auto-Executed Policy',
        };
      case 'REJECTED':
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          icon: XCircle,
          label: 'Human Rejected',
        };
      default:
        return {
          bg: 'bg-slate-800 text-slate-300 border-slate-700',
          icon: Clock,
          label: status,
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search incident, host, agent, command..."
            className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-xs text-slate-500 font-semibold mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>

          {(['ALL', 'APPROVED', 'AUTO_EXECUTED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {st === 'ALL'
                ? 'All Actions'
                : st === 'APPROVED'
                ? 'Human Approved'
                : st === 'AUTO_EXECUTED'
                ? 'Auto-Executed'
                : 'Rejected'}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Stream */}
      {filteredHistory.length === 0 ? (
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-sm">
          No historical agent activities match your search or filter criteria.
        </div>
      ) : (
        <div className="space-y-3.5 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-800/80">
          {filteredHistory.map((item) => {
            const badge = getStatusBadge(item.status);
            const StatusIcon = badge.icon;
            const isExpanded = expandedId === item.id;

            return (
              <div key={item.id} className="relative pl-14 group">
                <div className={`absolute left-3 top-4 w-7 h-7 rounded-full flex items-center justify-center border shadow-md z-10 ${badge.bg}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                </div>

                <div className="bg-[#111827] border border-slate-800/80 hover:border-slate-700 transition-all rounded-2xl overflow-hidden shadow-lg">
                  <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/40">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {item.id}
                        </span>
                        <span className="font-mono text-xs font-bold text-cyan-400">{item.incidentId}</span>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${badge.bg}`}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {item.riskLevel} RISK
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-slate-100">{item.incidentTitle}</h4>

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5 text-slate-200">
                          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                          {item.agentName}
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <Server className="w-3.5 h-3.5 text-slate-500" />
                          {item.targetCi}
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          {item.humanApprover}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between lg:justify-end gap-5 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400 font-mono">
                          {new Date(item.executedAt).toLocaleString()}
                        </div>
                        <div className="text-xs font-bold text-slate-400">
                          Duration: <span className="text-emerald-400">{item.durationMs}ms</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
                      >
                        {isExpanded ? 'Hide Trace' : 'View Trace'}
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded 3-Agent Trace Drawer */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 p-5 bg-[#0b0f19]/90 space-y-5 font-sans">
                      <div className="text-xs font-extrabold uppercase text-cyan-400 tracking-wider flex items-center gap-2">
                        <Workflow className="w-4 h-4 text-cyan-400" />
                        Complete 3-Agent Execution Pipeline Breakdown
                      </div>

                      {/* 3 Agent Output Cards */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Router Agent */}
                        <div className="bg-[#111827] border border-slate-800/80 rounded-2xl p-4 space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                              <Radio className="w-3.5 h-3.5 text-amber-400" />
                              🚦 ROUTER AGENT
                            </span>
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded">
                              {item.routerOutput?.assignedPriority || 'P2 High'}
                            </span>
                          </div>
                          <div className="text-xs space-y-1">
                            <div><span className="text-slate-500">Category:</span> <span className="text-slate-200 font-medium">{item.routerOutput?.category || 'Infrastructure > Network'}</span></div>
                            <div><span className="text-slate-500">Route:</span> <span className="text-cyan-300 font-mono text-[11px]">{item.routerOutput?.dispatchRoute || 'Network Ops Queue'}</span></div>
                            <div className="text-[11px] text-slate-300 italic bg-slate-900/60 p-2 rounded border border-slate-800 mt-1.5">
                              "{item.routerOutput?.userAcknowledgment || 'Ticket logged and dispatched.'}"
                            </div>
                          </div>
                        </div>

                        {/* Resolver Agent */}
                        <div className="bg-[#111827] border border-slate-800/80 rounded-2xl p-4 space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="font-bold text-xs text-cyan-400 flex items-center gap-1.5">
                              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                              🛠️ RESOLVER AGENT
                            </span>
                            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded">
                              {item.resolverOutput?.resolutionStatus || 'RESOLVED'}
                            </span>
                          </div>
                          <div className="text-xs space-y-1">
                            <div><span className="text-slate-500">Diagnosis:</span> <span className="text-slate-200 leading-relaxed block">{item.resolverOutput?.diagnosis || item.resolutionOutcome}</span></div>
                            <div><span className="text-slate-500">Runbook:</span> <span className="text-cyan-400 font-medium">{item.resolverOutput?.matchedRunbook || item.kbGenerated}</span></div>
                            <div className="text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800 mt-1.5">
                              "{item.resolverOutput?.userResolutionNotice || 'Remediation completed and verified.'}"
                            </div>
                          </div>
                        </div>

                        {/* Knowledge Synthesizer */}
                        <div className="bg-[#111827] border border-slate-800/80 rounded-2xl p-4 space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                              <BrainCircuit className="w-3.5 h-3.5 text-emerald-400" />
                              🧠 KNOWLEDGE SYNTHESIZER
                            </span>
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded">
                              {item.synthesizerOutput?.draftKbId || item.kbGenerated || 'KB-88012'}
                            </span>
                          </div>
                          <div className="text-xs space-y-1">
                            <div><span className="text-slate-500">KB Title:</span> <span className="text-emerald-300 font-bold block">{item.synthesizerOutput?.kbTitle || 'SOP: Network Cache Reset'}</span></div>
                            <div><span className="text-slate-500">Fix:</span> <span className="text-slate-300 block">{item.synthesizerOutput?.synthesizedSolution || 'Flushed route cache and recycled daemon.'}</span></div>
                            <div className="text-[11px] text-emerald-400 bg-emerald-950/20 p-2 rounded border border-emerald-900/40 mt-1.5">
                              💡 <span className="font-bold">Trend:</span> {item.synthesizerOutput?.trendInsight || 'Route cache saturation. Propose BGP prefix filter fix.'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Executed CLI / SSH Payload */}
                      <div>
                        <span className="text-xs font-extrabold text-slate-200 flex items-center gap-2 mb-1.5 uppercase tracking-wider">
                          <Terminal className="w-4 h-4 text-cyan-400" />
                          Executed CLI / SSH Payload:
                        </span>
                        <div className="bg-[#080c14] border border-slate-800 rounded-xl p-3 font-mono text-xs text-cyan-300">
                          $ {item.commandExecuted}
                        </div>
                      </div>

                      {/* Execution Output Stream */}
                      <div>
                        <span className="text-xs font-extrabold text-slate-200 flex items-center gap-2 mb-1.5 uppercase tracking-wider">
                          <FileText className="w-4 h-4 text-emerald-400" />
                          System Execution Output (STDOUT/STDERR Stream):
                        </span>
                        <pre className="bg-[#080c14] border border-slate-800 rounded-xl p-3.5 font-mono text-xs text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto leading-relaxed shadow-inner">
                          {item.executionOutput}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
