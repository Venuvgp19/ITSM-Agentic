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
  Terminal,
  Brain,
  AlertTriangle,
  FileText,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  LayoutGrid
} from 'lucide-react';
import { PendingApprovalsView, AgentApproval } from './components/PendingApprovalsView';
import { HistoricalActivityView, AgentHistoryEntry } from './components/HistoricalActivityView';
import { GovernanceAnalyticsView } from './components/GovernanceAnalyticsView';
import { ModelConfigView } from './components/ModelConfigView';
import { VectorSpace3D } from './components/VectorSpace3D';
import { IncidentAnalysisView } from './components/IncidentAnalysisView';
import { ProblemAnalysisView } from './components/ProblemAnalysisView';
import { AgentExecutionTimelineView } from './components/AgentExecutionTimelineView';
import { ControlTowerCopilot } from './components/ControlTowerCopilot';

type TabId = 'approvals' | 'history' | 'analytics' | 'config' | 'vector' | 'analysis' | 'problems' | 'timeline';

interface TabCategory {
  title: string;
  tabs: {
    id: TabId;
    label: string;
    icon: React.ElementType;
    badge?: number | string;
    badgeColor?: string;
  }[];
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('approvals');
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

  const handleApprove = async (id: string, proposedCommands?: string[]) => {
    try {
      const res = await fetch(`${API_BASE}/approvals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          approverName: 'Sarah Jenkins (Human in the Loop)',
          proposedCommands: proposedCommands
        }),
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

  // Structured Categories for the 8 Views
  const categories: TabCategory[] = [
    {
      title: 'OPERATIONS & GOVERNANCE',
      tabs: [
        {
          id: 'approvals',
          label: 'Pending Approvals',
          icon: ShieldCheck,
          badge: approvals.length,
          badgeColor: approvals.length > 0 ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
        },
        {
          id: 'timeline',
          label: 'Live Timeline',
          icon: Terminal,
        },
        {
          id: 'history',
          label: 'Audit Log Stream',
          icon: History,
          badge: history.length,
          badgeColor: 'bg-slate-800 text-slate-300 font-mono'
        }
      ]
    },
    {
      title: 'ANALYSIS AGENTS',
      tabs: [
        {
          id: 'analysis',
          label: 'Incident Analysis',
          icon: Brain,
        },
        {
          id: 'problems',
          label: 'Proactive Problem',
          icon: TrendingUp,
        }
      ]
    },
    {
      title: 'INTELLIGENCE & VECTOR',
      tabs: [
        {
          id: 'analytics',
          label: 'Governance Metrics',
          icon: Activity,
        },
        {
          id: 'vector',
          label: '3D Vector Map',
          icon: Layers,
        }
      ]
    },
    {
      title: 'ENGINE CONFIG',
      tabs: [
        {
          id: 'config',
          label: 'LLM & Model Settings',
          icon: Sliders,
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Header Command Bar */}
      <header className="h-16 bg-[#0e1322]/90 border-b border-slate-800/80 sticky top-0 z-50 backdrop-blur-xl px-6 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 flex items-center justify-center text-white font-extrabold shadow-lg shadow-cyan-950/50">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-slate-100 text-base tracking-wide uppercase">AGENT CONTROL TOWER</h1>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                ENTERPRISE HITL ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Autonomous Multi-Agent Governance & Continuous ITSM Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <div className="text-right hidden sm:block">
              <div className="text-[9px] text-slate-500 uppercase font-mono tracking-wider">Telemetry Stream</div>
              <div className="text-[11px] text-slate-300 font-mono">Synced {lastRefreshed}</div>
            </div>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
            Refresh
          </button>

          <button
            onClick={async () => {
              setLoading(true);
              try {
                await fetch('http://localhost:4000/api/v1/agent/reset-locks', { method: 'POST' });
              } catch (e) {
                console.error('Reset locks error:', e);
              }
              await fetchData();
            }}
            disabled={loading}
            className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/70 text-rose-300 border border-rose-800/60 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
            title="Force unlock stuck agent queues & refresh governance state"
          >
            <Zap className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            Force Unlock Queue
          </button>
        </div>
      </header>

      {/* Top Executive Telemetry Quick-Bar */}
      <div className="bg-[#0b0f19] border-b border-slate-800/80 px-6 py-2.5 flex items-center justify-between overflow-x-auto gap-4 text-xs font-medium">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span className="text-slate-400 text-[11px]">HITL Gate Status:</span>
            <span className="font-bold text-amber-300 font-mono">{approvals.length} Pending Approval{approvals.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="h-3 w-px bg-slate-800"></div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-slate-400 text-[11px]">Agent Execution Engine:</span>
            <span className="font-bold text-emerald-300 font-mono">Sequential AI Router Active</span>
          </div>

          <div className="h-3 w-px bg-slate-800"></div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span className="text-slate-400 text-[11px]">Vector DB Coverage:</span>
            <span className="font-bold text-cyan-300 font-mono">40 Master SOPs (NV-Embed-v1)</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="px-2 py-0.5 bg-slate-900 rounded border border-slate-800 font-mono text-cyan-400">
            NVIDIA Nemotron 3 Ultra 550B
          </span>
          <span className="px-2 py-0.5 bg-slate-900 rounded border border-slate-800 font-mono text-emerald-400">
            PostgreSQL Live Sync
          </span>
        </div>
      </div>

      {/* Main Workspace Area */}
      <main className="flex-1 p-6 max-w-[1700px] w-full mx-auto space-y-6">
        {/* Categorized Command Suite Navigation */}
        <div className="bg-[#0e1322]/80 border border-slate-800/80 rounded-2xl p-2 shadow-xl backdrop-blur-md">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {categories.map((cat, idx) => (
              <div key={idx} className="bg-[#090d16] border border-slate-800/60 rounded-xl p-2 space-y-1.5">
                <div className="px-2 py-1 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <LayoutGrid className="w-3 h-3 text-cyan-500/70" />
                    {cat.title}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {cat.tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                          isActive
                            ? 'bg-gradient-to-r from-cyan-500/20 via-cyan-500/10 to-teal-500/10 text-cyan-300 border border-cyan-500/40 shadow-md shadow-cyan-950/30'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                          <span className="truncate">{tab.label}</span>
                        </div>
                        {tab.badge !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${tab.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* View 1: Pending Approvals */}
        {activeTab === 'approvals' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#0e1322] border border-slate-800 p-4 rounded-xl">
              <div>
                <h2 className="text-base font-black text-slate-100 flex items-center gap-2 tracking-tight">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
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

        {/* View 2: Live Timeline */}
        {activeTab === 'timeline' && <AgentExecutionTimelineView />}

        {/* View 3: Historical Audit Log Stream */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#0e1322] border border-slate-800 p-4 rounded-xl">
              <div>
                <h2 className="text-base font-black text-slate-100 flex items-center gap-2 tracking-tight">
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

        {/* View 4: Incident Analysis Agent */}
        {activeTab === 'analysis' && <IncidentAnalysisView />}

        {/* View 5: Proactive Problem Analysis */}
        {activeTab === 'problems' && <ProblemAnalysisView />}

        {/* View 6: Governance Analytics */}
        {activeTab === 'analytics' && <GovernanceAnalyticsView stats={stats} />}

        {/* View 7: 3D Vector DB Map */}
        {activeTab === 'vector' && <VectorSpace3D />}

        {/* View 8: Model Configuration */}
        {activeTab === 'config' && <ModelConfigView />}
      </main>

      {/* Floating AI Copilot & ChatOps Drawer */}
      <ControlTowerCopilot
        pendingApprovals={approvals}
        onRefreshNeeded={fetchData}
        onApproveApproval={handleApprove}
        onRejectApproval={handleReject}
        activeTab={activeTab}
      />

      {/* Footer Bar */}
      <footer className="bg-[#0e1322] border-t border-slate-800 px-6 py-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between max-w-[1700px] w-full mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="font-semibold text-slate-400">Autonomous Agent HITL Control Tower — Enterprise Workspace v2.5</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-2 sm:mt-0 font-mono">
          Model: NVIDIA Nemotron 3 Ultra 550B • Ports: Dashboard (5173) | Frontend (3000) | Backend (4000)
        </div>
      </footer>
    </div>
  );
}

