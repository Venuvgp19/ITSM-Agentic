import React, { useState, useEffect, useRef } from 'react';
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
  DollarSign,
  Sun,
  Moon
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
  const [authPassword, setAuthPassword] = useState<string>('');
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

  // Theme -- defaults to dark (the original, unchanged look) for anyone who
  // hasn't chosen otherwise, so existing users see no difference on upgrade.
  // Applied as a `dark` class on <html> (Tailwind's `darkMode: 'class'`);
  // every component pairs its existing dark-mode classes with a `dark:`
  // prefix and a new light-mode default, per index.css's token split.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('control_tower_theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Fallback
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('control_tower_theme', theme);
    } catch {
      // Fallback
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

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
        setAuthError('Invalid credentials. Please contact your administrator for access.');
      }
      setAuthLoading(false);
    }, 400);
  };

  const handleLogout = () => {
    localStorage.removeItem('control_tower_auth');
    setIsAuthenticated(false);
  };

  // Only the very first fetch should show a loading skeleton (loading is
  // passed straight into PendingApprovalsView/AIControlTowerOverview's
  // LoadingState). Every subsequent call is a silent background poll (every
  // 10s) -- toggling `loading` true/false on each of those swapped the whole
  // approvals list to a skeleton and back every cycle, which is what made the
  // HITL approvals tab look like it was "refreshing" every few seconds while
  // someone was mid-review of a pending SOP.
  const hasLoadedOnceRef = useRef(false);

  const fetchData = async () => {
    if (!isAuthenticated) return;
    if (!hasLoadedOnceRef.current) setLoading(true);
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
      hasLoadedOnceRef.current = true;
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
        },
        {
          id: 'inventory',
          label: 'AI Asset Inventory (CMDB)',
          icon: Layers,
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-900 dark:text-slate-100 relative overflow-hidden select-text transition-colors duration-200">
        {/* Ambient Lights */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 dark:bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <Button
          variant="ghost"
          iconOnly
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="absolute top-4 right-4 z-20 text-slate-500 dark:text-slate-400"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        <div className="w-full max-w-md space-y-6 z-10">
          {/* Logo & Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-400 text-[11px] font-mono font-bold tracking-wide shadow-inner">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>SERVICENOW AI CONTROL TOWER</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center justify-center gap-2 font-sans">
              <span>servicenow<span className="text-[#30bb7b] font-black text-3xl">.</span></span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Enterprise Mission Control for Autonomous Agents, Models & Active Governance
            </p>
          </div>

          {/* Login Gate Card */}
          <div className="pro-card rounded-2xl p-7 space-y-5 border border-slate-200 dark:border-slate-800 shadow-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Security Authorization Gate
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Authenticate as authorized SRE fleet operator to manage agent actions.</p>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                {authError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Operator User ID</label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={authUserId}
                    onChange={(e) => setAuthUserId(e.target.value)}
                    placeholder="e.g. Venu"
                    className="focus-ring w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-cyan-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 dark:text-white transition font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Operator Password</label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="focus-ring w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-cyan-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 dark:text-white transition font-mono"
                  />
                </div>
              </div>

              {/* Quick credential hint -- User ID only. The password is never
                  rendered on screen (see the commit that removed it): this
                  page is recorded for demo videos, and a hint here is
                  functionally identical to printing the real password. */}
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 p-3 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 flex items-center font-mono">
                <div>
                  <span className="text-slate-700 dark:text-slate-300 font-bold">User ID:</span> <span className="text-cyan-700 dark:text-cyan-400 font-bold">Venu</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-emerald-600 dark:from-cyan-500 dark:via-indigo-500 dark:to-emerald-500 hover:brightness-110 text-white dark:text-slate-950 font-bold text-xs tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
              >
                {authLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white dark:text-slate-950" />
                ) : (
                  <>
                    <span>Unlock AI Control Tower</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-center">
              <a
                href="http://localhost:3000/incidents"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-300 font-medium transition"
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
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased overflow-hidden select-text transition-colors duration-200">
      {/* 1. Collapsible Pro Sidebar */}
      <aside
        className={`${
          isSidebarCollapsed ? 'w-16' : 'w-64'
        } shrink-0 border-r border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl flex flex-col justify-between transition-all duration-300 z-30`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Brand Header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80">
            {!isSidebarCollapsed ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20 font-black">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-black tracking-wider text-slate-900 dark:text-white uppercase flex items-center gap-1">
                    <span>servicenow</span>
                    <span className="text-[#30bb7b] font-black text-sm">.</span>
                  </div>
                  <div className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400 font-bold">AI CONTROL TOWER</div>
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
                  <div className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider font-mono">
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
                          ? 'bg-gradient-to-r from-cyan-500/15 to-emerald-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60'
                      }`}
                      title={isSidebarCollapsed ? item.label : undefined}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'
                          }`}
                        />
                        {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {!isSidebarCollapsed && item.badge !== undefined && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono ${
                            item.badgeType === 'alert'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 animate-pulse'
                              : item.badgeType === 'success'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                              : 'bg-cyan-100 text-cyan-800 border border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40'
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

        {/* Bottom Theme Toggle, Operator & Health Widget */}
        {!isSidebarCollapsed ? (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-slate-950/90 space-y-2">
            <Button
              variant="secondary"
              onClick={toggleTheme}
              className="w-full !h-7 text-[10px]"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
              <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
            </Button>
            <div className="pro-card rounded-xl p-3 space-y-2 border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase">OPERATOR</span>
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                  AUTHENTICATED
                </span>
              </div>
              <div className="text-[11px] font-bold text-slate-900 dark:text-white truncate flex items-center justify-between">
                <span>Venu</span>
                <span className="text-[9px] font-mono text-cyan-700 dark:text-cyan-400">Global SRE Lead</span>
              </div>
              <Button
                variant="secondary"
                onClick={handleLogout}
                aria-label="Lock Console"
                className="w-full mt-1 !h-7 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 dark:hover:border-rose-700/50 text-[10px]"
              >
                <LogOut className="w-3 h-3" />
                <span>Lock Console</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              iconOnly
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="text-slate-500 dark:text-slate-400"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
            <span
              className="w-3 h-3 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse motion-reduce:animate-none"
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
              className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </aside>

      {/* 2. Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Global Command Bar */}
        <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm dark:shadow-xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span className="text-slate-400 dark:text-slate-500">ServiceNow AI Control Tower</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
              <span className="text-slate-900 dark:text-white font-bold">{currentNav?.label || 'Mission Control'}</span>
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
              <Power className={`w-3.5 h-3.5 ${isKillSwitchTriggered ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>
                Kill Switch: <Badge tone={isKillSwitchTriggered ? 'critical' : 'success'} className="ml-1 align-middle">
                  {isKillSwitchTriggered ? 'TRIGGERED' : 'ARMED'}
                </Badge>
              </span>
            </Button>

            {/* Operator Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className="text-slate-400 dark:text-slate-400">Operator:</span>
              <strong className="text-slate-900 dark:text-white">Venu</strong>
            </div>

            {/* Mutex Locks Release */}
            <Button
              variant="secondary"
              onClick={handleResetLocks}
              title="Click to release all host mutex locks"
              className="hover:text-amber-700 dark:hover:text-amber-300"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Locks: <strong className="text-amber-700 dark:text-amber-300 font-mono">{stats?.activeLocksCount || 0}</strong></span>
            </Button>

            {/* Sync Refresh */}
            <Button variant="secondary" onClick={fetchData} disabled={loading} aria-label="Sync telemetry">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin motion-reduce:animate-none text-cyan-600 dark:text-cyan-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">Sync</span>
            </Button>

            {/* Theme Toggle Switch */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-xs font-mono font-medium shadow-xs cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {theme === 'dark' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-sans font-medium text-slate-300">Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px] font-sans font-medium text-slate-700">Light</span>
                </>
              )}
            </button>
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
