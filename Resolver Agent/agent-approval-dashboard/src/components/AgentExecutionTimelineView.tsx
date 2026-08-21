import React, { useState, useEffect } from 'react';
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
  StopCircle
} from 'lucide-react';

interface TimelineStep {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  timestamp: string;
  details?: string;
}

interface AgentExecution {
  id: string;
  incidentNumber: string;
  incidentTitle: string;
  targetCi: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ESCALATED' | 'PENDING_APPROVAL';
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

  const fetchTimeline = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/v1/agent/timeline');
      if (res.ok) {
        const data = await res.json();
        setExecutions(data);
        if (data.length > 0 && !selectedId) {
          setSelectedId(data[0].id);
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
      await fetch('http://localhost:4000/api/v1/agent/cancel-execution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: id,
          reason: 'Human Operator manually stopped active action cycle via Control Tower Dashboard.'
        })
      });
      await fetch('http://localhost:4000/api/v1/agent/reset-locks', { method: 'POST' });
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
  }, [autoPoll, selectedId]);

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const getStatusBadge = (status: AgentExecution['status']) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 animate-pulse shadow-sm shadow-cyan-950/40">
            <Activity className="w-3 h-3 text-cyan-400 animate-spin" /> RUNNING
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-950/40">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> RESOLVED
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-950/80 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-950/40">
            <AlertCircle className="w-3 h-3 text-rose-400" /> STOPPED
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-950/40">
            <Clock className="w-3 h-3 text-amber-400" /> HITL GATE
          </span>
        );
      case 'ESCALATED':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-950/80 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-950/40">
            <Layers className="w-3 h-3 text-purple-400" /> ESCALATED
          </span>
        );
    }
  };

  const getStepStatusIcon = (status: TimelineStep['status']) => {
    switch (status) {
      case 'RUNNING':
        return (
          <div className="w-7 h-7 rounded-xl bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)] animate-pulse">
            <Activity className="w-3.5 h-3.5 animate-spin" />
          </div>
        );
      case 'SUCCESS':
        return (
          <div className="w-7 h-7 rounded-xl bg-emerald-950 border border-emerald-500 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        );
      case 'FAILED':
        return (
          <div className="w-7 h-7 rounded-xl bg-rose-950 border border-rose-500 flex items-center justify-center text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
        );
      case 'PENDING':
      default:
        return (
          <div className="w-7 h-7 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-500">
            <Clock className="w-3.5 h-3.5" />
          </div>
        );
    }
  };

  const selectedRun = executions.find(ex => ex.id === selectedId);

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="lobe-glass rounded-2xl p-5 md:p-6 border border-slate-800/80 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-cyan-500/20">
            <Terminal className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              Live Agent Execution Timeline & Control
              <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                Real-Time Trace
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Monitor active resolving agent subprocess cycles, SSH terminal steps, and stop/cancel actions on demand.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl cursor-pointer hover:border-slate-700 transition">
            <input
              type="checkbox"
              checked={autoPoll}
              onChange={(e) => setAutoPoll(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500/50 w-3.5 h-3.5"
            />
            <span>Auto-Poll (3s)</span>
          </label>

          <button
            onClick={fetchTimeline}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            Sync
          </button>
        </div>
      </div>

      {/* Main Grid: Queue on Left, Trace View on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Executions Queue */}
        <div className="lobe-glass rounded-2xl p-4 border border-slate-800/80 shadow-xl space-y-3 lg:col-span-1 flex flex-col max-h-[640px]">
          <h3 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-2 pb-2 border-b border-slate-800/80">
            <Play className="w-3.5 h-3.5 text-cyan-400" /> Active & Recent Cycles ({executions.length})
          </h3>

          {loading && executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
              <span className="text-xs font-bold">Querying master timeline...</span>
            </div>
          ) : executions.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-xs font-medium italic">
              No executions reported yet. Start the ITSM agent daemon to trace runs.
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              {executions.map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => setSelectedId(ex.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-2 cursor-pointer ${
                    selectedId === ex.id
                      ? 'bg-slate-900 border-cyan-500/50 shadow-md shadow-cyan-950/20'
                      : 'bg-slate-950/50 border-slate-800/70 hover:bg-slate-900/60 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2 w-full">
                    <span className="font-mono text-xs font-bold text-cyan-300">{ex.incidentNumber}</span>
                    {getStatusBadge(ex.status)}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-100 line-clamp-1">{ex.incidentTitle}</h4>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 font-mono">
                      <Server className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate">{ex.targetCi}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Execution Detailed Step Stream */}
        <div className="lobe-glass rounded-2xl p-5 md:p-6 border border-slate-800/80 shadow-xl lg:col-span-2 space-y-5">
          {selectedRun ? (
            <>
              {/* Top Meta Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-cyan-300 bg-cyan-950/80 px-2.5 py-0.5 rounded border border-cyan-800/50">
                      {selectedRun.incidentNumber}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">CI: {selectedRun.targetCi}</span>
                    {getStatusBadge(selectedRun.status)}
                  </div>
                  <h3 className="text-sm md:text-base font-bold text-white mt-1.5">{selectedRun.incidentTitle}</h3>
                </div>

                {selectedRun.status === 'RUNNING' && (
                  <button
                    onClick={() => handleCancelExecution(selectedRun.id, selectedRun.incidentNumber)}
                    disabled={cancellingId === selectedRun.id}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-black rounded-xl transition-all shadow-md shadow-rose-950/30 cursor-pointer disabled:opacity-50"
                  >
                    <StopCircle className="w-4 h-4" />
                    <span>Stop Action Cycle</span>
                  </button>
                )}
              </div>

              {/* Step Sequence Timeline */}
              <div className="space-y-4 pt-2">
                {selectedRun.steps && selectedRun.steps.length > 0 ? (
                  selectedRun.steps.map((step, idx) => (
                    <div key={step.id} className="relative flex gap-3.5 items-start">
                      {/* Vertical connector line */}
                      {idx < selectedRun.steps.length - 1 && (
                        <div className="absolute left-[13px] top-8 bottom-0 w-0.5 bg-slate-800" />
                      )}

                      <div className="shrink-0 relative z-10">
                        {getStepStatusIcon(step.status)}
                      </div>

                      <div className="flex-1 lobe-glass rounded-xl p-3.5 border border-slate-800/80 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold text-xs text-slate-200">{step.name}</div>
                          <span className="text-[10px] font-mono text-slate-500">{step.timestamp}</span>
                        </div>

                        {step.details && (
                          <div className="bg-[#05070c] border border-slate-800/90 rounded-lg p-2.5 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
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
