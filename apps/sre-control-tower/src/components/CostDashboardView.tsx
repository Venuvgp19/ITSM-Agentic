import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, TrendingUp, Cpu, Hash, RefreshCw } from 'lucide-react';
import { Card, Button, LoadingState, EmptyState, SectionHeading } from './ui';
import { formatDate } from '../utils/datetime';

interface DaySpend {
  day: string;
  costUsd: number;
  totalTokens: number;
  calls: number;
}
interface ModelSpend {
  model: string;
  costUsd: number;
  totalTokens: number;
  calls: number;
}
interface IncidentSpend {
  incidentNumber: string;
  costUsd: number;
  totalTokens: number;
  calls: number;
}
interface CostSummary {
  allTimeUsd: number;
  todayUsd: number;
  weekUsd: number;
  allTimeTokens: number;
  allTimeCalls: number;
  byDay: DaySpend[];
  byModel: ModelSpend[];
  topIncidents: IncidentSpend[];
}

const MODEL_COLORS = ['#22d3ee', '#a78bfa', '#f59e0b', '#34d399', '#fb7185', '#818cf8'];

function fmtUsd(v: number) {
  return `$${v.toFixed(v < 1 ? 4 : 2)}`;
}

export function CostDashboardView() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      const apiOrigin = window.location.port === '5173' ? '' : 'http://localhost:5173';
      const res = await fetch(`${apiOrigin}/api/v1/agent/token-usage/summary`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      console.error('Failed to fetch cost dashboard summary:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 15000);
    return () => clearInterval(interval);
  }, []);

  const maxDaySpend = useMemo(
    () => Math.max(0.0001, ...(summary?.byDay || []).map((d) => d.costUsd)),
    [summary]
  );
  const maxModelSpend = useMemo(
    () => Math.max(0.0001, ...(summary?.byModel || []).map((m) => m.costUsd)),
    [summary]
  );
  const maxIncidentSpend = useMemo(
    () => Math.max(0.0001, ...(summary?.topIncidents || []).map((i) => i.costUsd)),
    [summary]
  );

  return (
    <div className="space-y-6 font-sans">
      <Card className="border border-slate-200 dark:border-slate-800/80 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-cyan-500 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                AI Ops Cost Dashboard
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Real LLM spend across every daemon call, persisted to the database so it survives restarts — not an
                in-memory session estimate.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={fetchSummary} disabled={loading} className="rounded-xl">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin motion-reduce:animate-none text-cyan-600 dark:text-cyan-400' : ''}`} />
            Sync
          </Button>
        </div>
      </Card>

      <LoadingState
        loading={loading && !summary}
        empty={!!summary && summary.allTimeCalls === 0}
        emptyLabel="No LLM spend recorded yet — costs will appear here as the daemon processes incidents."
        skeleton={
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <RefreshCw className="w-7 h-7 animate-spin motion-reduce:animate-none text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs font-bold">Loading cost data...</span>
          </div>
        }
      >
        {summary && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Today</span>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{fmtUsd(summary.todayUsd)}</div>
                <span className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">Last 24 hours</span>
              </Card>
              <Card>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">This Week</span>
                <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400">{fmtUsd(summary.weekUsd)}</div>
                <span className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">Last 7 days</span>
              </Card>
              <Card>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">All-Time</span>
                <div className="text-2xl font-black text-purple-600 dark:text-purple-400">{fmtUsd(summary.allTimeUsd)}</div>
                <span className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">@ $8.00 / 1M tokens</span>
              </Card>
              <Card>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Calls</span>
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{summary.allTimeCalls.toLocaleString()}</div>
                <span className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">{summary.allTimeTokens.toLocaleString()} tokens</span>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Spend by day - vertical bar chart */}
              <Card className="lg:col-span-2">
                <SectionHeading
                  title="Daily Spend (Last 30 Days)"
                  subtitle="Persisted per LLM call — survives daemon restarts, unlike the old in-memory session estimate."
                />
                {summary.byDay.length === 0 ? (
                  <EmptyState title="No spend recorded in the last 30 days." />
                ) : (
                  <div className="mt-4 flex items-end gap-1 h-40 overflow-x-auto pb-1">
                    {summary.byDay.map((d) => (
                      <div key={d.day} className="group relative flex-1 min-w-[10px] flex flex-col items-center justify-end h-full">
                        <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition text-[10px] font-mono bg-white border border-slate-300 dark:bg-slate-900 dark:border-slate-700 rounded px-1.5 py-0.5 whitespace-nowrap z-10 text-slate-700 dark:text-slate-200">
                          {formatDate(d.day, { month: 'short', day: 'numeric' })}: {fmtUsd(d.costUsd)}
                        </div>
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-cyan-400 group-hover:from-emerald-500 group-hover:to-cyan-300 transition-colors"
                          style={{ height: `${Math.max(2, (d.costUsd / maxDaySpend) * 100)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Spend by model */}
              <Card>
                <SectionHeading title="Spend by Model" subtitle="Which models are actually costing money." />
                <div className="mt-4 space-y-3">
                  {summary.byModel.length === 0 && <EmptyState title="No model spend yet." />}
                  {summary.byModel.map((m, i) => (
                    <div key={m.model}>
                      <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1 gap-2">
                        <span className="truncate font-mono" title={m.model}>{m.model}</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200 shrink-0">{fmtUsd(m.costUsd)}</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.max(3, (m.costUsd / maxModelSpend) * 100)}%`,
                            backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Top incidents by cost */}
            <Card>
              <SectionHeading
                title="Most Expensive Incidents"
                subtitle="Top 10 by total LLM spend — flags tickets that burned an unusual number of ReAct turns or SOP re-synthesis attempts."
              />
              {summary.topIncidents.length === 0 ? (
                <EmptyState title="No per-incident spend recorded yet." />
              ) : (
                <div className="mt-4 space-y-2.5">
                  {summary.topIncidents.map((inc) => (
                    <div key={inc.incidentNumber} className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300 w-28 shrink-0">{inc.incidentNumber}</span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-900 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-rose-400"
                          style={{ width: `${Math.max(3, (inc.costUsd / maxIncidentSpend) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-16 text-right shrink-0">{fmtUsd(inc.costUsd)}</span>
                      <span className="text-[10px] text-slate-600 dark:text-slate-500 font-mono w-16 text-right shrink-0">{inc.calls} calls</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </LoadingState>
    </div>
  );
}
