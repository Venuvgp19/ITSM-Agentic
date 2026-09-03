import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  History,
  RefreshCw,
  Sparkles,
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
  Sliders,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Search,
  MessageSquareText,
  Command,
  Flame,
  ArrowUpRight,
  ChevronLeft,
  Server,
  Database,
  ExternalLink,
  Bot,
  User,
  LogOut,
  KeyRound,
  ArrowRight,
  Scale,
  Power,
  DollarSign
} from 'lucide-react';
import { AIControlTowerOverview } from './components/AIControlTowerOverview';
import { AIAssetInventoryView } from './components/AIAssetInventoryView';
import { ValueAndROIView } from './components/ValueAndROIView';
import { RiskAndComplianceView } from './components/RiskAndComplianceView';
import { PendingApprovalsView, AgentApproval } from './components/PendingApprovalsView';
import { HistoricalActivityView, AgentHistoryEntry } from './components/HistoricalActivityView';
import { GovernanceAnalyticsView } from './components/GovernanceAnalyticsView';
import { ModelConfigView } from './components/ModelConfigView';
import { CostDashboardView } from './components/CostDashboardView';
import { VectorSpace3D } from './components/VectorSpace3D';
import { IncidentAnalysisView } from './components/IncidentAnalysisView';
import { ProblemAnalysisView } from './components/ProblemAnalysisView';
import { AgentExecutionTimelineView } from './components/AgentExecutionTimelineView';
import { AIRoutingOverview } from './components/AIRoutingOverview';
import { SREControlTowerChat } from './components/SREControlTowerChat';
import { Button, Badge } from './components/ui';
import { formatTime } from './utils/datetime';

type TabId =
  | 'overview'
  | 'router'
  | 'inventory'
  | 'approvals'
  | 'timeline'
  | 'analysis'
  | 'problems'
  | 'value'
  | 'cost'
  | 'risk'
  | 'history'
  | 'vector'
  | 'analytics'
  | 'config';

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeType?: 'alert' | 'info' | 'neutral' | 'success';
}

interface NavGroup {
  groupTitle: string;
  items: NavItem[];
}

export function App() {
  // Authentication State for Control Tower
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authUserId, setAuthUserId] = useState<string>('Venu');
  const [authPassword, setAuthPassword] = useState<string>('admin007');
  const [authError, setAuthError] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [history, setHistory] = useState<AgentHistoryEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isKillSwitchTriggered, setIsKillSwitchTriggered] = useState<boolean>(false);

  const API_BASE = 'http://localhost:5173/api/v1/agent';

  // Check persisted auth session on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('control_tower_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.userId === 'Venu' || parsed.userId === 'venu' || parsed.userId === 'admin')) {
          setIsAuthenticated(true);
        }
      }
    } catch {
      // Fallback
    }
  }, []);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    setTimeout(() => {
      const trimmedUser = authUserId.trim().toLowerCase();
      const trimmedPwd = authPassword.trim();

      if (
        (trimmedUser === 'venu' && trimmedPwd === 'admin007') ||
        (trimmedUser === 'admin' && trimmedPwd === 'admin007') ||
        (trimmedUser === 'sre' && trimmedPwd === 'admin007')
      ) {
        setIsAuthenticated(true);
        localStorage.setItem(
          'control_tower_auth',
          JSON.stringify({ userId: authUserId.trim(), role: 'Global SRE Lead', timestamp: new Date().toISOString() })
        );
      } else {
        setAuthError('Invalid credentials. Use User ID: Venu & Password: admin007');
      }
      setAuthLoading(false);
    }, 400);
  };

  const handleLogout = () => {
    localStorage.removeItem('control_tower_auth');
    setIsAuthenticated(false);
  };

  const fetchData = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [appRes, histRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/approvals`).catch(() => null),
        fetch(`${API_BASE}/history`).catch(() => null),
        fetch(`${API_BASE}/stats`).catch(() => null),
      ]);

      if (appRes && appRes.ok) setApprovals(await appRes.json());
      if (histRes && histRes.ok) setHistory(await histRes.json());
      if (statsRes && statsRes.ok) setStats(await statsRes.json());

      setLastRefreshed(formatTime(new Date()));
    } catch (err) {
      console.error('Error fetching SRE dashboard telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Sync Master Kill Switch state
  useEffect(() => {
    if (!isAuthenticated) return;
    const syncKillSwitch = async () => {
      try {
        const res = await fetch(`${API_BASE}/containment`);
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.masterKillSwitch === 'boolean') {
            setIsKillSwitchTriggered((prev) => (prev === data.masterKillSwitch ? prev : data.masterKillSwitch));
          }
        }
      } catch (err) {
        console.error('Failed to sync master kill switch state:', err);
      }
    };
    syncKillSwitch();
    const ksInterval = setInterval(syncKillSwitch, 5000);
    return () => clearInterval(ksInterval);
  }, [isAuthenticated]);

  const handleApprove = async (id: string, proposedCommands?: string[]) => {
    try {
      const res = await fetch(`${API_BASE}/approvals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          approverName: 'Venu (Human in the Loop)',
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
        body: JSON.stringify({ reason, rejectorName: 'Venu (Human in the Loop)' }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error('Error rejecting request:', e);
    }
  };

  const handleResetLocks = async () => {
    try {
      await fetch(`${API_BASE}/reset-locks`, { method: 'POST' });
      await fetchData();
    } catch (e) {
      console.error('Error resetting locks:', e);
    }
  };

  // Grouped Navigation Hierarchy (ServiceNow AI Control Tower Specification)
  const navGroups: NavGroup[] = [
    {
      groupTitle: 'MISSION CONTROL',
      items: [
        {
          id: 'overview',
          label: 'Overview & Insights',
          icon: LayoutGrid,
        },
        {
          id: 'router',
          label: 'AI Router & Triage',
          icon: Radio,
          badge: 'Active',
          badgeType: 'success',
        },
        {
          id: 'inventory',
          label: 'AI Asset Inventory (CMDB)',
          icon: Layers,
          badge: '16 Assets',
          badgeType: 'info',
        },
        {
          id: 'approvals',
          label: 'HITL Human Gate',
          icon: ShieldCheck,
          badge: approvals.length > 0 ? approvals.length : undefined,
          badgeType: 'alert',
        },
        {
          id: 'timeline',
          label: 'Execution Observability',
          icon: Activity,
        },
      ],
    },
    {
      groupTitle: 'ANALYTICS & TOPOLOGY',
      items: [
        {
          id: 'analysis',
          label: 'Incident AI Report',
          icon: FileText,
        },
        {
          id: 'problems',
          label: 'Problem AI Insights',
          icon: AlertTriangle,
        },
        {
          id: 'vector',
          label: '3D Vector Universe',
          icon: Brain,
          badge: '49 SOPs',
          badgeType: 'info',
        },
        {
          id: 'history',
          label: 'Execution Audit Log',
          icon: History,
        },
      ],
    },
    {
      groupTitle: 'GOVERNANCE & VALUE',
      items: [
        {
          id: 'value',
          label: 'Value & Business ROI',
          icon: TrendingUp,
        },
        {
          id: 'cost',
          label: 'AI Ops Cost Dashboard',
          icon: DollarSign,
        },
        {
          id: 'risk',
          label: 'Risk & Compliance',
          icon: Scale,
          badge: '96.4%',
          badgeType: 'success',
        },
        {
          id: 'analytics',
          label: 'Fleet Telemetry & SLA',
          icon: Sliders,
        },
        {
          id: 'config',
          label: 'NVIDIA AI Engine',
          icon: Cpu,
        },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);
  const currentNav = allNavItems.find((n) => n.id === activeTab);

  // ── 0. Control Tower Cyber Authentication Gate ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-100 relative overflow-hidden select-text">
        {/* Ambient Lights */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md space-y-6 z-10">
          {/* Logo & Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[11px] font-mono font-bold tracking-wide shadow-inner">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>SERVICENOW AI CONTROL TOWER</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2 font-sans">
              <span>servicenow<span className="text-[#30bb7b] font-black text-3xl">.</span></span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Enterprise Mission Control for Autonomous Agents, Models & Active Governance
            </p>
          </div>

          {/* Login Gate Card */}
          <div className="pro-card rounded-2xl p-7 space-y-5 border border-slate-800 shadow-2xl bg-slate-900/90 backdrop-blur-xl">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" /> Security Authorization Gate
              </h2>
              <p className="text-xs text-slate-400 mt-1">Authenticate as authorized SRE fleet operator to manage agent actions.</p>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                {authError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Operator User ID</label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={authUserId}
                    onChange={(e) => setAuthUserId(e.target.value)}
                    placeholder="e.g. Venu"
                    className="focus-ring w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white transition font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Operator Password</label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="focus-ring w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white transition font-mono"
                  />
                </div>
              </div>

              {/* Quick credential hint */}
              <div className="bg-slate-950 border border-slate-800/80 p-3 rounded-xl text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <div>
                  <span className="text-slate-300 font-bold">User ID:</span> <span className="text-cyan-400 font-bold">Venu</span>
                </div>
                <div>
                  <span className="text-slate-300 font-bold">Password:</span> <span className="text-emerald-400 font-bold">admin007</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
              >
                {authLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <>
                    <span>Unlock AI Control Tower</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-800 text-center">
              <a
                href="http://localhost:3000/incidents"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 font-medium transition"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Return to ServiceNow ITSM Portal (Port 3000)</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated ServiceNow AI Control Tower Dashboard ──
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden select-text">
      {/* 1. Collapsible Pro Sidebar */}
      <aside
        className={`${
          isSidebarCollapsed ? 'w-16' : 'w-64'
        } shrink-0 border-r border-slate-800/80 bg-slate-950/95 backdrop-blur-2xl flex flex-col justify-between transition-all duration-300 z-30`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Brand Header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
            {!isSidebarCollapsed ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20 font-black">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-black tracking-wider text-white uppercase flex items-center gap-1">
                    <span>servicenow</span>
                    <span className="text-[#30bb7b] font-black text-sm">.</span>
                  </div>
                  <div className="text-[10px] font-mono text-cyan-400 font-bold">AI CONTROL TOWER</div>
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 mx-auto">
                <Radio className="w-4 h-4" />
              </div>
            )}

            <Button
              variant="ghost"
              iconOnly
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
          </div>

          {/* Navigation Items Grouped */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin">
            {navGroups.map((group) => (
              <div key={group.groupTitle} className="space-y-1">
                {!isSidebarCollapsed && (
                  <div className="px-3 text-[10px] font-bold text-slate-500 tracking-wider font-mono">
                    {group.groupTitle}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`focus-ring w-full flex items-center ${
                        isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                      } py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500/15 to-emerald-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                      }`}
                      title={isSidebarCollapsed ? item.label : undefined}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-cyan-400' : 'text-slate-400'
                          }`}
                        />
                        {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {!isSidebarCollapsed && item.badge !== undefined && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono ${
                            item.badgeType === 'alert'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                              : item.badgeType === 'success'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom Operator & Health Widget */}
        {!isSidebarCollapsed ? (
          <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 space-y-2">
            <div className="pro-card rounded-xl p-3 space-y-2 border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">OPERATOR</span>
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  AUTHENTICATED
                </span>
              </div>
              <div className="text-[11px] font-bold text-white truncate flex items-center justify-between">
                <span>Venu</span>
                <span className="text-[9px] font-mono text-cyan-400">Global SRE Lead</span>
              </div>
              <Button
                variant="secondary"
                onClick={handleLogout}
                aria-label="Lock Console"
                className="w-full mt-1 !h-7 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-700/50 text-[10px]"
              >
                <LogOut className="w-3 h-3" />
                <span>Lock Console</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 border-t border-slate-800/80 flex flex-col items-center gap-2">
            <span
              className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none"
              role="img"
              aria-label="Operator Authenticated: Venu"
              title="Operator Authenticated: Venu"
            />
            <Button
              variant="ghost"
              iconOnly
              onClick={handleLogout}
              title="Lock Console"
              aria-label="Lock Console"
              className="text-slate-400 hover:text-rose-300"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </aside>

      {/* 2. Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Global Command Bar */}
        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-2xl px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span className="text-slate-500">ServiceNow AI Control Tower</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-white font-bold">{currentNav?.label || 'Mission Control'}</span>
            </div>
          </div>

          {/* Quick Telemetry & Action Pills */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Kill Switch Global Header Pill */}
            <Button
              variant={isKillSwitchTriggered ? 'danger' : 'secondary'}
              onClick={() => setActiveTab('risk')}
              className={`font-mono ${isKillSwitchTriggered ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 animate-pulse motion-reduce:animate-none' : ''}`}
            >
              <Power className={`w-3.5 h-3.5 ${isKillSwitchTriggered ? 'text-white' : 'text-emerald-400'}`} />
              <span>
                Kill Switch: <Badge tone={isKillSwitchTriggered ? 'critical' : 'success'} className="ml-1 align-middle">
                  {isKillSwitchTriggered ? 'TRIGGERED' : 'ARMED'}
                </Badge>
              </span>
            </Button>

            {/* Operator Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Operator:</span>
              <strong className="text-white">Venu</strong>
            </div>

            {/* Mutex Locks Release */}
            <Button
              variant="secondary"
              onClick={handleResetLocks}
              title="Click to release all host mutex locks"
              className="hover:text-amber-300"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Locks: <strong className="text-amber-300 font-mono">{stats?.activeLocksCount || 0}</strong></span>
            </Button>

            {/* Sync Refresh */}
            <Button variant="secondary" onClick={fetchData} disabled={loading} aria-label="Sync telemetry">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin motion-reduce:animate-none text-cyan-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </div>
        </header>

        {/* 3. Main Dynamic Content Canvas */}
        {/* Header stays full-bleed for the global status pills; content column is capped for readability. */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {activeTab === 'overview' && (
            <AIControlTowerOverview
              approvals={approvals}
              history={history}
              stats={stats}
              loading={loading}
              onNavigateTab={(tab) => setActiveTab(tab as TabId)}
            />
          )}

          {activeTab === 'router' && <AIRoutingOverview />}

          {activeTab === 'inventory' && <AIAssetInventoryView />}

          {activeTab === 'approvals' && (
            <PendingApprovalsView
              approvals={approvals}
              loading={loading}
              onApprove={handleApprove}
              onReject={handleReject}
              onRefresh={fetchData}
            />
          )}

          {activeTab === 'timeline' && <AgentExecutionTimelineView />}

          {/* Preserved Incident Analysis View */}
          {activeTab === 'analysis' && <IncidentAnalysisView />}

          {/* Preserved Problem Analysis View */}
          {activeTab === 'problems' && <ProblemAnalysisView />}

          {activeTab === 'value' && <ValueAndROIView />}

          {activeTab === 'cost' && <CostDashboardView />}

          {activeTab === 'risk' && <RiskAndComplianceView onKillSwitchChange={setIsKillSwitchTriggered} />}

          {activeTab === 'history' && (
            <HistoricalActivityView history={history} />
          )}

          {activeTab === 'vector' && <VectorSpace3D />}

          {activeTab === 'analytics' && (
            <GovernanceAnalyticsView stats={stats} />
          )}

          {activeTab === 'config' && <ModelConfigView />}
        </main>
      </div>

      {/* SRE Control Tower Conversational Assistant */}
      <SREControlTowerChat />
    </div>
  );
}
