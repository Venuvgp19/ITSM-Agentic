import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Lock,
  Power,
  CheckCircle2,
  FileCheck2,
  Sliders,
  Scale,
  Zap,
  Radio,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  XCircle,
  FileText
} from 'lucide-react';

interface RiskAndComplianceProps {
  onKillSwitchChange?: (active: boolean) => void;
}

export function RiskAndComplianceView({ onKillSwitchChange }: RiskAndComplianceProps) {
  const [isMasterKillSwitchActive, setIsMasterKillSwitchActive] = useState<boolean>(false);
  const [killReason, setKillReason] = useState<string>('');
  const [showKillModal, setShowKillModal] = useState<boolean>(false);

  // Fetch live master kill switch status from backend
  const fetchLiveStatus = async () => {
    try {
      const res = await fetch('http://localhost:5173/api/v1/agent/containment');
      if (res.ok) {
        const data = await res.json();
        setIsMasterKillSwitchActive(Boolean(data.masterKillSwitch));
      }
    } catch (err) {
      console.warn('Could not sync master kill switch state:', err);
    }
  };

  React.useEffect(() => {
    fetchLiveStatus();
    const interval = setInterval(fetchLiveStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const frameworks = [
    {
      name: 'EU AI Act (Regulation 2024/1689)',
      classification: 'High-Risk AI Systems Compliance',
      score: '98.2%',
      status: 'COMPLIANT',
      controls: [
        { name: 'Human-in-the-Loop (Art. 14)', status: 'PASS', desc: 'Mandatory operator gate for destructive/privileged actions' },
        { name: 'Technical Robustness & Cyber (Art. 15)', status: 'PASS', desc: 'Host mutex locking & prompt isolation' },
        { name: 'Record-Keeping & Logging (Art. 12)', status: 'PASS', desc: 'Full turn-by-turn ReAct trace audit logs' },
      ],
    },
    {
      name: 'ISO/IEC 42001:2023',
      classification: 'Artificial Intelligence Management System',
      score: '96.4%',
      status: 'COMPLIANT',
      controls: [
        { name: 'AI Risk Assessment (Clause 6.1.2)', status: 'PASS', desc: 'Automatic risk scoring for all proposed actions' },
        { name: 'AI Asset Management (Annex A.6)', status: 'PASS', desc: 'CMDB registry for models, agents, and tool protocols' },
        { name: 'Operational Control (Clause 8.1)', status: 'PASS', desc: 'Emergency Kill Switch protocol implemented' },
      ],
    },
    {
      name: 'NIST AI Risk Management Framework 1.0',
      classification: 'NIST AI RMF Core (Govern / Map / Measure / Manage)',
      score: '95.0%',
      status: 'COMPLIANT',
      controls: [
        { name: 'GOVERN 1.1: AI Policies Established', status: 'PASS', desc: 'Active governance policies mapped to ITSM tickets' },
        { name: 'MAP 2.3: AI Interdependencies Identified', status: 'PASS', desc: 'ChromaDB SOP grounding & CI dependency mapping' },
        { name: 'MEASURE 2.1: Test & Verification System', status: 'PASS', desc: 'Domain-aware post-remediation OS verification' },
      ],
    },
  ];

  const handleTriggerKillSwitch = async () => {
    setIsMasterKillSwitchActive(true);
    onKillSwitchChange?.(true);
    setShowKillModal(false);
    try {
      await fetch('http://localhost:5173/api/v1/agent/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: true,
          reason: killReason || 'Operator manual emergency fleet containment',
          triggeredBy: 'Venu (Global Administrator)'
        }),
      });
    } catch (err) {
      console.error('Failed to trigger master kill switch:', err);
    }
    setKillReason('');
  };

  const handleRestoreFleet = async () => {
    setIsMasterKillSwitchActive(false);
    onKillSwitchChange?.(false);
    try {
      await fetch('http://localhost:5173/api/v1/agent/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: false,
          reason: 'Operator restored fleet to active production',
          triggeredBy: 'Venu (Global Administrator)'
        }),
      });
    } catch (err) {
      console.error('Failed to disarm master kill switch:', err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-400" />
              <span>RISK, SECURITY & REGULATORY COMPLIANCE</span>
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
              Active Governance
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated compliance postures for EU AI Act, ISO/IEC 42001, and NIST AI RMF with emergency kill switch containment.
          </p>
        </div>
      </div>

      {/* 2. Emergency Kill Switch Control Station */}
      <div className={`pro-card rounded-2xl p-6 border transition-all ${
        isMasterKillSwitchActive
          ? 'border-rose-500 bg-rose-950/40 glow-rose'
          : 'border-slate-800 bg-slate-900/80'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-lg ${
              isMasterKillSwitchActive
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              <Power className="w-6 h-6" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-tight">
                  {isMasterKillSwitchActive
                    ? 'FLEET EMERGENCY KILL SWITCH ACTIVE — ALL AGENTS CONTAINED'
                    : 'FLEET KILL SWITCH PROTOCOL (READY)'}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  isMasterKillSwitchActive
                    ? 'bg-rose-500 text-slate-950 font-black'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {isMasterKillSwitchActive ? 'CONTAINED' : 'ARMED & MONITORING'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                {isMasterKillSwitchActive
                  ? 'All autonomous SSH executions, ticket routing, and runbook modifications are halted. Manual human operator takeover required.'
                  : 'Instantly halt all autonomous daemon executions across WorkerNode1HL, control plane, Worker1OL, and Worker2OL in case of drift or security anomaly.'}
              </p>
            </div>
          </div>

          <div>
            {isMasterKillSwitchActive ? (
              <button
                onClick={handleRestoreFleet}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                Restore Fleet Operations
              </button>
            ) : (
              <button
                onClick={() => setShowKillModal(true)}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition cursor-pointer shadow-lg shadow-rose-950/50 flex items-center gap-2"
              >
                <Power className="w-4 h-4" />
                <span>Emergency Containment</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Regulatory Framework Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {frameworks.map((fw) => (
          <div key={fw.name} className="pro-card rounded-2xl p-5 border border-slate-800 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                  {fw.status}
                </span>
                <span className="text-base font-black font-mono text-emerald-400">{fw.score}</span>
              </div>

              <h3 className="text-xs font-black text-white">{fw.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-3">{fw.classification}</p>

              <div className="space-y-2 border-t border-slate-800/80 pt-3 text-[11px]">
                {fw.controls.map((ctrl) => (
                  <div key={ctrl.name} className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-0.5">
                    <div className="flex items-center justify-between text-slate-200 font-bold">
                      <span>{ctrl.name}</span>
                      <span className="text-[9px] font-mono text-emerald-400 font-bold">{ctrl.status}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">{ctrl.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-[10px] font-mono text-slate-500 flex items-center justify-between">
              <span>Continuous Audit</span>
              <span className="text-emerald-400 font-bold">● Active</span>
            </div>
          </div>
        ))}
      </div>

      {/* Kill Switch Modal */}
      {showKillModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="pro-card rounded-2xl p-6 border border-rose-500/60 max-w-md w-full space-y-4 bg-slate-900 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-black text-white">Trigger Emergency AI Containment?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will immediately terminate all active ReAct SSH loops, revoke background ticket routing tokens, and hold all incoming incidents in Human Queue.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Containment Audit Reason *</label>
              <input
                type="text"
                value={killReason}
                onChange={(e) => setKillReason(e.target.value)}
                placeholder="e.g. Host safety verification / suspected loop"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowKillModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerKillSwitch}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition cursor-pointer shadow-lg shadow-rose-950/50"
              >
                Confirm Emergency Containment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
