import React, { useState, useEffect, useMemo } from 'react';
import {
  Terminal,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cpu,
  Database,
  Server,
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
  ArrowRight,
  AlertTriangle,
  XCircle,
  Zap,
  StopCircle,
  Search,
  Filter
} from 'lucide-react';
import { Card, Badge, Button, LoadingState, EmptyState, type BadgeTone } from './ui';

interface TimelineStep {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'REJECTED';
  timestamp: string;
  details?: string;
}

interface AgentExecution {
  id: string;
  incidentNumber: string;
  incidentTitle: string;
  targetCi: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ESCALATED' | 'PENDING_APPROVAL' | 'REJECTED';
  startTime: string;
  endTime?: string;
  steps: TimelineStep[];
}

export function AgentExecutionTimelineView() {
  const [executions, setExecutions] = useState<AgentExecution[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [autoPoll, setAutoPoll] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchTimeline = async () => {
    try {
      const apiOrigin = window.location.port === '5173' ? '' : 'http://localhost:5173';
      const res = await fetch(`${apiOrigin}/api/v1/agent/timeline`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setExecutions(data);
          if (data.length > 0) {
            setSelectedId(prev => {
              if (!prev || !data.some(item => item.id === prev)) {
                return data[0].id;
              }
              return prev;
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch agent execution timeline:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelExecution = async (id: string, incidentNumber: string) => {
    if (!window.confirm(`Are you sure you want to stop and cancel the running action cycle for ticket [${incidentNumber}]?`)) {
      return;
    }
    setCancellingId(id);
    try {
      const apiOrigin = window.location.port === '5173' ? '' : 'http://localhost:5173';
      await fetch(`${apiOrigin}/api/v1/agent/cancel-execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: id,
          reason: 'Human Operator manually stopped active action cycle via Control Tower Dashboard.'
        })
      });
      await fetch(`${apiOrigin}/api/v1/agent/reset-locks`, { method: 'POST' });
      await fetchTimeline();
    } catch (e) {
      console.error('Failed to cancel execution:', e);
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, []);

  useEffect(() => {
    if (!autoPoll) return;
    const interval = setInterval(fetchTimeline, 3000);
    return () => clearInterval(interval);
  }, [autoPoll]);

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const statusMeta: Record<AgentExecution['status'], { tone: BadgeTone; label: string; icon: React.ElementType; spin?: boolean }> = {
    RUNNING: { tone: 'pending', label: 'RUNNING', icon: Activity, spin: true },
    SUCCESS: { tone: 'success', label: 'RESOLVED', icon: CheckCircle2 },
    REJECTED: { tone: 'critical', label: 'REJECTED', icon: XCircle },
    FAILED: { tone: 'error', label: 'STOPPED', icon: AlertCircle },
    PENDING_APPROVAL: { tone: 'medium', label: 'HITL GATE', icon: Clock },
    ESCALATED: { tone: 'high', label: 'ESCALATED', icon: Layers },
  };

  const getStatusBadge = (status: AgentExecution['status']) => {
    const meta = statusMeta[status] || statusMeta.ESCALATED;
    const Icon = meta.icon;
    return (
      <Badge tone={meta.tone} className="text-[10px] font-black">
        <Icon className={`w-3 h-3 ${meta.spin ? 'animate-spin motion-reduce:animate-none' : ''}`} /> {meta.label}
      </Badge>
    );
  };

  const getStepStatusIcon = (status: TimelineStep['status']) => {
    switch (status) {
      case 'RUNNING':
        return (
          <div className="w-7 h-7 rounded-xl bg-cyan-50 dark:bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)] animate-pulse">
            <Activity className="w-3.5 h-3.5 animate-spin" />
          </div>
        );
      case 'SUCCESS':
        return (
          <div className="w-7 h-7 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        );
      case 'FAILED':
      case 'REJECTED':
        return (
          <div className="w-7 h-7 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-500 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
            <XCircle className="w-3.5 h-3.5" />
          </div>
        );
      case 'PENDING':
      default:
        return (
          <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-500">
            <Clock className="w-3.5 h-3.5" />
          </div>
        );
    }
  };

  const filteredExecutions = useMemo(() => {
    return executions.filter(ex => {
      const matchesSearch =
        searchQuery === '' ||
        ex.incidentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.incidentTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.targetCi.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'RUNNING' && ex.status === 'RUNNING') ||
        (statusFilter === 'RESOLVED' && ex.status === 'SUCCESS') ||
        (statusFilter === 'REJECTED' && (ex.status === 'REJECTED' || ex.status === 'FAILED')) ||
        (statusFilter === 'ESCALATED' && ex.status === 'ESCALATED') ||
        (statusFilter === 'HITL' && ex.status === 'PENDING_APPROVAL');

      return matchesSearch && matchesStatus;
    });
  }, [executions, searchQuery, statusFilter]);

  const selectedRun = executions.find(ex => ex.id === selectedId) || filteredExecutions[0];

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="pro-card rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800/80 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-cyan-500/20">
            <Terminal className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              Live Agent Execution Observability
              <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 px-2 py-0.5 rounded-full">
                Real-Time Trace
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Monitor active resolving agent subprocess cycles, SSH terminal steps, and stop/cancel actions on demand.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition">
            <input
              type="checkbox"
              checked={autoPoll}
              onChange={(e) => setAutoPoll(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-cyan-500 focus:ring-cyan-500/50 w-3.5 h-3.5"
            />
            <span>Auto-Poll (3s)</span>
          </label>

          <Button variant="secondary" onClick={fetchTimeline} disabled={loading} className="rounded-xl">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin motion-reduce:animate-none text-cyan-600 dark:text-cyan-400' : ''}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Main Grid: Queue on Left, Trace View on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Executions Queue */}
        <div className="pro-card rounded-2xl p-4 border border-slate-200 dark:border-slate-800/80 shadow-xl space-y-3 lg:col-span-1 flex flex-col max-h-[700px]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800/80">
            <h3 className="text-xs font-extrabold uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-2">
              <Play className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" /> Cycles ({filteredExecutions.length})
            </h3>
            <span className="text-[10px] text-slate-600 dark:text-slate-500 font-mono">Live Stream</span>
          </div>

          {/* Search & Filter Controls */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500 dark:text-slate-400" />
              <input
                type="text"
                placeholder="Search ticket # or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="focus-ring w-full pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:border-cyan-500"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              {['ALL', 'RUNNING', 'RESOLVED', 'REJECTED', 'ESCALATED', 'HITL'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  aria-pressed={statusFilter === tab}
                  className={`focus-ring px-2 py-0.5 text-[10px] font-bold rounded-md transition cursor-pointer ${
                    statusFilter === tab
                      ? tab === 'REJECTED'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <LoadingState
            loading={loading && executions.length === 0}
            empty={filteredExecutions.length === 0}
            emptyLabel="No executions matched filter criteria."
            skeleton={
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                <RefreshCw className="w-7 h-7 animate-spin motion-reduce:animate-none text-cyan-600 dark:text-cyan-400" />
                <span className="text-xs font-bold">Querying master timeline...</span>
              </div>
            }
          >
            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              {filteredExecutions.map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => setSelectedId(ex.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-2 cursor-pointer ${
                    (selectedRun && selectedRun.id === ex.id)
                      ? 'bg-cyan-50 dark:bg-slate-900 border-cyan-500/50 shadow-md shadow-cyan-100 dark:shadow-cyan-950/20'
                      : 'bg-white dark:bg-slate-950/50 border-slate-200 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2 w-full">
                    <span className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300">{ex.incidentNumber}</span>
                    {getStatusBadge(ex.status)}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">{ex.incidentTitle}</h4>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      <Server className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      <span className="truncate">{ex.targetCi}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </LoadingState>
        </div>

        {/* Selected Execution Detailed Step Stream */}
        <div className="pro-card rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800/80 shadow-xl lg:col-span-2 space-y-5">
          {selectedRun ? (
            <>
              {/* Top Meta Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/80 px-2.5 py-0.5 rounded border border-cyan-200 dark:border-cyan-800/50">
                      {selectedRun.incidentNumber}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">CI: {selectedRun.targetCi}</span>
                    {getStatusBadge(selectedRun.status)}
                  </div>
                  <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white mt-1.5">{selectedRun.incidentTitle}</h3>
                </div>

                {selectedRun.status === 'RUNNING' && (
                  <Button
                    variant="danger"
                    onClick={() => handleCancelExecution(selectedRun.id, selectedRun.incidentNumber)}
                    disabled={cancellingId === selectedRun.id}
                    className="rounded-xl font-black"
                  >
                    <StopCircle className="w-4 h-4" />
                    <span>Stop Action Cycle</span>
                  </Button>
                )}
              </div>

              {/* Step Sequence Timeline */}
              <div className="space-y-4 pt-2">
                {selectedRun.steps && selectedRun.steps.length > 0 ? (
                  selectedRun.steps.map((step, idx) => (
                    <div key={step.id || idx} className="relative flex gap-3.5 items-start">
                      {/* Vertical connector line */}
                      {idx < selectedRun.steps.length - 1 && (
                        <div className="absolute left-[13px] top-8 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-800" />
                      )}

                      <div className="shrink-0 relative z-10">
                        {getStepStatusIcon(step.status)}
                      </div>

                      <div className={`flex-1 pro-card rounded-xl p-3.5 border space-y-2 ${
                        step.status === 'FAILED' || step.status === 'REJECTED' || (step.details && step.details.toLowerCase().includes('reject'))
                          ? 'border-rose-300 bg-rose-50 dark:border-rose-500/50 dark:bg-rose-950/20'
                          : 'border-slate-200 dark:border-slate-800/80'
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className={`font-bold text-xs ${
                            step.status === 'FAILED' || step.status === 'REJECTED' || (step.details && step.details.toLowerCase().includes('reject'))
                              ? 'text-rose-700 dark:text-rose-300'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}>{step.name}</div>
                          <span className="text-[10px] font-mono text-slate-600 dark:text-slate-500">{step.timestamp}</span>
                        </div>

                        {step.details && (
                          <div className={`border rounded-lg p-2.5 font-mono text-xs overflow-x-auto leading-relaxed ${
                            step.status === 'FAILED' || step.status === 'REJECTED' || (step.details && step.details.toLowerCase().includes('reject'))
                              ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm shadow-rose-100 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200 dark:shadow-rose-950/40'
                              : 'bg-slate-50 border-slate-200 text-emerald-700 dark:bg-[#05070c] dark:border-slate-800/90 dark:text-emerald-300'
                          }`}>
                            <code>{step.details}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-500 text-xs font-medium">
                    No individual step telemetry recorded for this execution.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-slate-500 text-xs font-medium">
              Select an active or historical execution cycle from the left queue to view step-by-step telemetry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
