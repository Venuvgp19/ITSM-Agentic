import React from 'react';
import {
  TrendingUp,
  DollarSign,
  Clock,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  BarChart3,
  Flame,
  ArrowUpRight,
  Sparkles,
  PieChart,
  Layers
} from 'lucide-react';

export function ValueAndROIView() {
  const valueMetrics = [
    {
      title: 'Total Autonomous MTTR',
      value: '38s',
      baseline: '4.2 hours manual baseline',
      change: '-99.7% Reduction',
      isPositive: true,
      icon: Zap,
      color: 'emerald',
    },
    {
      title: 'Engineering Hours Saved',
      value: '142.6 hrs',
      baseline: 'Tier 1/2 manual triage equivalent',
      change: '+34.2 hrs this week',
      isPositive: true,
      icon: Clock,
      color: 'cyan',
    },
    {
      title: 'Estimated Financial Savings',
      value: '$28,450',
      baseline: 'Based on $200/hr SRE engineer time',
      change: '14.2x ROI Multiplier',
      isPositive: true,
      icon: DollarSign,
      color: 'purple',
    },
    {
      title: 'Cost per Auto-Resolution',
      value: '$0.0042',
      baseline: 'NVIDIA NIM token inference cost',
      change: '99.9% cheaper than human',
      isPositive: true,
      icon: Cpu,
      color: 'amber',
    },
  ];

  const domainBreakdown = [
    { domain: 'Kubernetes & Control Plane', resolved: 412, hoursSaved: 54.8, avgMttr: '32s', compliance: '100%' },
    { domain: 'Unix OS & Kernel / Sudoers', resolved: 328, hoursSaved: 41.2, avgMttr: '24s', compliance: '100%' },
    { domain: 'Network Ops & CNI Flannel', resolved: 145, hoursSaved: 22.4, avgMttr: '48s', compliance: '98.6%' },
    { domain: 'PostgreSQL & DB Transactions', resolved: 86, hoursSaved: 14.1, avgMttr: '56s', compliance: '100%' },
    { domain: 'SecOps & Account Permissions', resolved: 50, hoursSaved: 10.1, avgMttr: '18s', compliance: '100%' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>VALUE REALIZATION & BUSINESS ROI</span>
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Active Value Measurement
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time business impact metrics, MTTR reduction trajectory, hours saved, and inference economics.
          </p>
        </div>
      </div>

      {/* 2. Hero Value Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {valueMetrics.map((m) => {
          const Icon = m.icon;

          return (
            <div key={m.title} className="pro-card rounded-2xl p-5 border border-slate-800 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                  {m.title}
                </span>
                <div className={`p-2 rounded-xl ${
                  m.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  m.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                  m.color === 'purple' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                  'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div>
                <div className="text-3xl font-black font-mono text-white">{m.value}</div>
                <div className="text-xs text-emerald-400 font-bold mt-1 flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{m.change}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
                {m.baseline}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Domain Impact Matrix & Token Economics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Domain Breakdown Table */}
        <div className="lg:col-span-2 pro-card rounded-2xl p-5 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                Value Realization by Incident Domain
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">1,021 Auto-Resolved Total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-mono">
                  <th className="pb-2.5">Domain</th>
                  <th className="pb-2.5 text-right">Resolved Tickets</th>
                  <th className="pb-2.5 text-right">Hours Saved</th>
                  <th className="pb-2.5 text-right">Avg MTTR</th>
                  <th className="pb-2.5 text-right">SLA Success</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {domainBreakdown.map((d) => (
                  <tr key={d.domain} className="hover:bg-slate-900/60 transition">
                    <td className="py-3 font-sans font-bold text-white flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span>{d.domain}</span>
                    </td>
                    <td className="py-3 text-right text-slate-300 font-bold">{d.resolved}</td>
                    <td className="py-3 text-right text-emerald-400 font-bold">{d.hoursSaved} hrs</td>
                    <td className="py-3 text-right text-cyan-300">{d.avgMttr}</td>
                    <td className="py-3 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {d.compliance}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Inference Economics & SLA Score */}
        <div className="pro-card rounded-2xl p-5 border border-slate-800 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  Token Economics
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">NVIDIA NIM</span>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Total Tokens Incurred</span>
                <strong className="text-white">48,320 tokens</strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Avg Tokens / Incident</span>
                <strong className="text-cyan-300">1,170 tokens</strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">Monthly LLM Cloud Cost</span>
                <strong className="text-emerald-400">$4.12 USD</strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/30 to-cyan-950/30 border border-emerald-500/30 space-y-1 text-xs">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero SLA Breaches Recorded</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Autonomous SRE resolves critical P1/P2 incidents in under 60 seconds, eliminating SLA breach risks.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
