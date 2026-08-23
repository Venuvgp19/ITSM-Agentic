import React from 'react';
import { ShieldCheck, Clock, Activity, CheckCircle2, Zap, Cpu, Lock, Sliders, AlertOctagon } from 'lucide-react';

interface AnalyticsProps {
  stats: {
    pendingApprovals: number;
    totalExecutedActions: number;
    approvedActions: number;
    rejectedActions: number;
    humanApprovalRatePercent: number;
    safetyComplianceScore: number;
    avgResolutionTimeSavedHours: string;
    riskBreakdown: {
      CRITICAL: number;
      HIGH: number;
      MEDIUM: number;
      LOW: number;
    };
  } | null;
}

export function GovernanceAnalyticsView({ stats }: AnalyticsProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-slate-800/40 rounded-2xl border border-slate-800"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1 */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#111827] via-[#111827] to-amber-950/20 border border-amber-500/30 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 tracking-wider uppercase">Pending Approvals</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-4xl font-black text-amber-300 tracking-tight">{stats.pendingApprovals}</span>
            <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
              Action Required
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">High-risk actions paused for operator signature</p>
        </div>

        {/* Card 2 */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#111827] via-[#111827] to-emerald-950/20 border border-emerald-500/30 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">Human Approval Rate</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-4xl font-black text-emerald-400 tracking-tight">{stats.humanApprovalRatePercent}%</span>
            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              {stats.approvedActions} Approved / {stats.rejectedActions} Rejected
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">Human operator authorization acceptance</p>
        </div>

        {/* Card 3 */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#111827] via-[#111827] to-cyan-950/20 border border-cyan-500/30 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase">Safety Score</span>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-4xl font-black text-cyan-300 tracking-tight">{stats.safetyComplianceScore}%</span>
            <span className="text-[11px] font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
              Zero Unchecked Violations
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">Verified dry-run and command syntax checks</p>
        </div>

        {/* Card 4 */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#111827] via-[#111827] to-indigo-950/20 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 tracking-wider uppercase">MTTR Hours Saved</span>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-md">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-4xl font-black text-indigo-300 tracking-tight">{stats.avgResolutionTimeSavedHours}h</span>
            <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              {stats.totalExecutedActions} Operations Executed
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">Hours saved vs manual engineer triage</p>
        </div>
      </div>

      {/* Governance & Policy Matrix */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
        <div className="border-b border-slate-800 pb-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            Human-in-the-Loop Governance Policy Configuration
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Configure automatic approval thresholds, forbidden command patterns, and role-based operator authorizations for autonomous AI agents.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Low Risk: Auto-Approved
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Actions categorized as LOW risk (e.g. log status checks, incident triage, non-mutating SSH queries) execute autonomously without pausing for human review.
            </p>
            <div className="text-[11px] font-mono text-emerald-300 bg-emerald-950/60 p-3 rounded-xl border border-emerald-800/40">
              Policy Rule: Confidence ≥ 90.0% & Risk = LOW
            </div>
          </div>

          <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <AlertOctagon className="w-4 h-4" />
              High & Critical Risk: HITL Mandated
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Actions with mutating system commands (`kill -9`, `systemctl restart`, `iptables`, `psql drop/flush`) pause execution and route to this Approval Dashboard.
            </p>
            <div className="text-[11px] font-mono text-amber-300 bg-amber-950/60 p-3 rounded-xl border border-amber-800/40">
              Policy Rule: Risk IN [HIGH, CRITICAL] → Require Operator Signature
            </div>
          </div>

          <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
              <Zap className="w-4 h-4" />
              Audit Trail & Knowledge Synthesis
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every approved execution logs full SSH stdout/stderr streams to the historical audit database and automatically generates an ITSM Knowledge Base SOP article.
            </p>
            <div className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 p-3 rounded-xl border border-cyan-800/40">
              Audit Rule: Immutable JSONL & JSON Log Storage
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
