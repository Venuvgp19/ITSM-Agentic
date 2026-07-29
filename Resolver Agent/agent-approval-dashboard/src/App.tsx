import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Clock,
  History,
  RefreshCw,
  Sparkles,
  Sliders,
  Radio,
  Activity,
  Layers,
  Cpu,
  Lock,
  Zap,
  Terminal
} from 'lucide-react';
import { PendingApprovalsView, AgentApproval } from './components/PendingApprovalsView';
import { HistoricalActivityView, AgentHistoryEntry } from './components/HistoricalActivityView';
import { GovernanceAnalyticsView } from './components/GovernanceAnalyticsView';

export function App() {
  const [activeTab, setActiveTab] = useState<'approvals' | 'history' | 'analytics'>('approvals');
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [history, setHistory] = useState<AgentHistoryEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const API_BASE = 'http://localhost:4000/api/v1/agent';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [apprRes, histRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/approvals?status=pending`).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_BASE}/history`).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_BASE}/stats`).then((r) => (r.ok ? r.json() : null)),
      ]);

      setApprovals(apprRes);
      setHistory(histRes);
      setStats(statsRes);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to fetch governance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/approvals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approverName: 'Sarah Jenkins (Human in the Loop)' }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error('Error approving request:', e);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    try {
      const res = await fetch(`${API_BASE}/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, rejectorName: 'Sarah Jenkins (Human in the Loop)' }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error('Error rejecting request:', e);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Standalone Cyber Command Header */}
      <header className="h-20 bg-[#111827]/90 border-b border-slate-800/80 sticky top-0 z-50 backdrop-blur-xl px-8 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 flex items-center justify-center text-white font-extrabold shadow-lg shadow-cyan-950/40">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-black text-slate-100 text-lg tracking-wide uppercase">AGENT CONTROL TOWER</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                STANDALONE HITL GOVERNANCE ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Human-in-the-Loop Autonomous Incident Resolution & Audit Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {lastRefreshed && (
            <div className="text-right hidden sm:block">
              <div className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Live Agent Feed</div>
              <div className="text-xs text-slate-300 font-mono">Synced {lastRefreshed}</div>
            </div>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
            Refresh Feed
          </button>
        </div>
      </header>

      {/* Main App Workspace Body */}
      <main className="flex-1 p-8 max-w-[1650px] w-full mx-auto space-y-8">
        {/* Navigation Tabs Bar */}
        <div className="flex border-b border-slate-800 gap-3">
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-2.5 px-6 py-3.5 text-xs font-extrabold border-b-2 transition-all uppercase tracking-wider ${
              activeTab === 'approvals'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 rounded-t-xl shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <ShieldCheck className="w-4.5 h-4.5" />
            Pending Approvals Queue
            {approvals.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-amber-500 text-slate-950 font-black">
                {approvals.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2.5 px-6 py-3.5 text-xs font-extrabold border-b-2 transition-all uppercase tracking-wider ${
              activeTab === 'history'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 rounded-t-xl shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <History className="w-4.5 h-4.5" />
            Historical Activity Audit Stream
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
              {history.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2.5 px-6 py-3.5 text-xs font-extrabold border-b-2 transition-all uppercase tracking-wider ${
              activeTab === 'analytics'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 rounded-t-xl shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Activity className="w-4.5 h-4.5" />
            Governance Analytics & Guardrail Matrix
          </button>
        </div>

        {/* Tab 1: Pending Approvals */}
        {activeTab === 'approvals' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-100 flex items-center gap-2 tracking-tight">
                  <Clock className="w-5 h-5 text-amber-400" />
                  Pending Operator Approval Requests ({approvals.length})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Autonomous agents pause execution on high-risk commands until signed off by a human operator.
                </p>
              </div>
            </div>

            <PendingApprovalsView
              approvals={approvals}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </div>
        )}

        {/* Tab 2: Historical Activity Audit Stream */}
        {activeTab === 'history' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-100 flex items-center gap-2 tracking-tight">
                  <History className="w-5 h-5 text-cyan-400" />
                  Agent Execution Audit Log Stream ({history.length})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete historical record of commands executed, STDOUT/STDERR logs, human signatures, and generated SOP articles.
                </p>
              </div>
            </div>

            <HistoricalActivityView history={history} />
          </div>
        )}

        {/* Tab 3: Governance Analytics & Policy Matrix */}
        {activeTab === 'analytics' && <GovernanceAnalyticsView stats={stats} />}
      </main>

      {/* Footer Bar */}
      <footer className="bg-[#111827] border-t border-slate-800 p-5 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between max-w-[1650px] w-full mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="font-semibold text-slate-400">Autonomous Agent HITL Control Tower — Standalone Edition v2.0</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-2 sm:mt-0 font-mono">
          Model: Gemini 3.1 Pro Preview • Ports: Frontend (5173/3000) | Backend (4000)
        </div>
      </footer>
    </div>
  );
}
