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
  XCircle
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
      // Force unlock agent queues
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
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase bg-cyan-950 text-cyan-400 border border-cyan-800/40 animate-pulse">
            <Activity className="w-3 h-3 text-cyan-400 animate-spin" /> RUNNING
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase bg-emerald-950 text-emerald-400 border border-emerald-800/40">
            <CheckCircle2 className="w-3 h-3" /> RESOLVED
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase bg-rose-950/80 text-rose-400 border border-rose-800/40">
            <AlertCircle className="w-3 h-3" /> STOPPED / FAILED
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase bg-amber-950 text-amber-400 border border-amber-800/40">
            <Clock className="w-3 h-3" /> PENDING HI-LOOP
          </span>
        );
      case 'ESCALATED':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase bg-purple-950 text-purple-400 border border-purple-800/40">
            <Layers className="w-3 h-3" /> ESCALATED
          </span>
        );
    }
  };

  const getStepStatusIcon = (status: TimelineStep['status']) => {
    switch (status) {
      case 'RUNNING':
        return (
          <div className="w-8 h-8 rounded-full bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)] animate-pulse">
            <Activity className="w-4 h-4 animate-spin" />
          </div>
        );
      case 'SUCCESS':
        return (
          <div className="w-8 h-8 rounded-full bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        );
      case 'FAILED':
        return (
          <div className="w-8 h-8 rounded-full bg-rose-950 border-2 border-rose-500 flex items-center justify-center text-rose-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
            <AlertCircle className="w-4 h-4" />
          </div>
        );
      case 'PENDING':
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-[#1e293b] border border-slate-700 flex items-center justify-center text-slate-500">
            <Clock className="w-4 h-4" />
          </div>
        );
    }
  };

  const selectedRun = executions.find(ex => ex.id === selectedId);

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#111827]/70 border border-slate-800 p-6 rounded-3xl backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-cyan-950/40">
            <Terminal className="w-7 h-7 text-cyan-200 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
              ⚡ AGENT EXECUTION TIMELINE & CONTROL
              <span className="text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-700/40 px-2 py-0.5 rounded uppercase tracking-wider">
                Real-Time Telemetry
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitor active resolving agent subprocess cycles, SSH terminals, and stop/cancel running action cycles on demand.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-xl cursor-pointer hover:border-slate-700 transition">
            <input
              type="checkbox"
              checked={autoPoll}
              onChange={(e) => setAutoPoll(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500/50 w-3.5 h-3.5"
            />
            AUTO-REFRESH
          </label>

          <button
            onClick={fetchTimeline}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20 active:scale-95 transition border border-cyan-800/40 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar Executions Queue */}
        <div className="bg-[#111827]/40 border border-slate-800/60 rounded-3xl p-5 space-y-4 lg:col-span-1 flex flex-col max-h-[650px]">
          <h3 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-2 pb-1 border-b border-slate-800/60">
            <Play className="w-4 h-4 text-cyan-400" /> Active & Recent Cycles
          </h3>

          {loading && executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
              <span className="text-xs font-bold">Querying master timeline...</span>
            </div>
          ) : executions.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-xs font-bold italic">
              No executions reported yet. Start the ITSM agent daemon to trace runs.
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {executions.map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => setSelectedId(ex.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 flex flex-col gap-2.5 cursor-pointer ${
                    selectedId === ex.id
                      ? 'bg-slate-900 border-cyan-500/50 shadow-md shadow-cyan-950/20'
                      : 'bg-slate-950/50 border-slate-800/60 hover:bg-slate-900/40 hover:border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 w-full">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{ex.incidentNumber}</span>
                    {getStatusBadge(ex.status)}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{ex.incidentTitle}</h4>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 font-medium">
                      <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>CI: <strong className="text-slate-300 font-bold">{ex.targetCi}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-slate-500 pt-2 border-t border-slate-900">
                    <span className="flex items-center gap-1 font-bold">
                      <Clock className="w-3 h-3" />
                      {new Date(ex.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {(ex.status === 'RUNNING' || ex.status === 'PENDING_APPROVAL') ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelExecution(ex.id, ex.incidentNumber);
                        }}
                        disabled={cancellingId === ex.id}
                        className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 hover:bg-rose-900 border border-rose-800/60 font-black text-[9px] flex items-center gap-1 transition"
                      >
                        <AlertTriangle className="w-2.5 h-2.5 animate-pulse" />
                        STOP ACTION
                      </button>
                    ) : (
                      <span className="text-cyan-500 font-black flex items-center gap-0.5 hover:translate-x-0.5 transition-transform">
                        VIEW PROGRESS <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Timeline View */}
        <div className="bg-[#111827]/40 border border-slate-800/60 rounded-3xl p-5 lg:col-span-2 flex flex-col min-h-[500px]">
          {selectedRun ? (
            <div className="space-y-6 flex-1 flex flex-col">
              {/* Target Runner Stats Header with Stop Option */}
              <div className="bg-[#0b0f19]/80 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-cyan-400 uppercase tracking-wider">{selectedRun.incidentNumber}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-xs font-bold text-slate-300">{selectedRun.incidentTitle}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-4">
                    <span>Target CI: <strong className="text-slate-200">{selectedRun.targetCi}</strong></span>
                    <span>Start: <strong className="text-slate-200">{new Date(selectedRun.startTime).toLocaleTimeString()}</strong></span>
                    {selectedRun.endTime && (
                      <span>End: <strong className="text-slate-200">{new Date(selectedRun.endTime).toLocaleTimeString()}</strong></span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 shrink-0">
                  {getStatusBadge(selectedRun.status)}
                  
                  {(selectedRun.status === 'RUNNING' || selectedRun.status === 'PENDING_APPROVAL') && (
                    <button
                      onClick={() => handleCancelExecution(selectedRun.id, selectedRun.incidentNumber)}
                      disabled={cancellingId === selectedRun.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 shadow-md shadow-rose-950/50 active:scale-95 transition disabled:opacity-50"
                      title="Stop and abort this active running action cycle immediately"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                      {cancellingId === selectedRun.id ? 'ABORTING...' : 'STOP RUNNING ACTION'}
                    </button>
                  )}
                </div>
              </div>

              {/* Steps Vertical Timeline */}
              {selectedRun.steps.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 italic py-20 text-xs">
                  <Cpu className="w-8 h-8 text-cyan-600 mb-2 animate-bounce" />
                  Initializing execution environment. Tracing checkpoints...
                </div>
              ) : (
                <div className="relative border-l border-slate-800 ml-4 pl-8 space-y-6 py-2 flex-1">
                  {selectedRun.steps.map((step) => {
                    const isOpen = expandedSteps[step.id] ?? true;
                    return (
                      <div key={step.id} className="relative group">
                        {/* Timeline Icon Marker */}
                        <div className="absolute -left-[48px] top-0.5">
                          {getStepStatusIcon(step.status)}
                        </div>

                        {/* Step Details Box */}
                        <div className="bg-[#0b0f19]/30 border border-slate-800/80 rounded-2xl p-4 hover:border-slate-800 transition duration-150">
                          <button
                            onClick={() => toggleStep(step.id)}
                            className="w-full flex justify-between items-center text-left"
                          >
                            <div>
                              <h4 className="text-xs font-black text-slate-200 uppercase tracking-wide flex items-center gap-2">
                                {step.name}
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                                  step.status === 'SUCCESS' ? 'bg-emerald-950/80 text-emerald-400' :
                                  step.status === 'RUNNING' ? 'bg-cyan-950/80 text-cyan-400 animate-pulse' :
                                  step.status === 'FAILED' ? 'bg-rose-950/80 text-rose-400' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {step.status}
                                </span>
                              </h4>
                              <span className="text-[9px] text-slate-500 font-semibold block mt-0.5">
                                Checkpoint hit at {step.timestamp}
                              </span>
                            </div>
                            {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                          </button>

                          {isOpen && step.details && (
                            <div className="mt-3 text-[11px] font-mono bg-black/40 border border-slate-900 rounded-xl p-3 text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                              {step.details}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-32 text-xs">
              <Database className="w-12 h-12 text-slate-700 mb-3" />
              Select an execution run from the left panel to inspect progress logs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
