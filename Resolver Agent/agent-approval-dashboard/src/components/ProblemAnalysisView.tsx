// src/components/ProblemAnalysisView.tsx
import React from 'react';
import { useLiveITSMData } from '../hooks/useLiveITSMData';
import { mapRiskScore, deterministicRandom, deriveFiveWhys } from './IncidentAnalysisView'; // reuse helpers

export function ProblemAnalysisView() {
  const { incidents, problems, agentStats, loading, lastRefreshed } = useLiveITSMData();

  // Compute problem suggestions similar to existing logic
  const problemSuggestions = React.useMemo(() => {
    return problems.map(p => {
      const relatedIncidents = incidents.filter(i => i.configurationItemName === p.configurationItemName);
      return {
        id: p.number,
        title: p.shortDescription,
        description: p.description,
        rootCause: p.rootCause || 'Under investigation',
        workaround: p.workaround || 'Pending workaround',
        priority: (() => {
          const upper = p.priority?.toUpperCase() || '';
          if (upper.includes('P1') || upper.includes('CRITICAL')) return 'P1 - CRITICAL';
          if (upper.includes('P2') || upper.includes('HIGH')) return 'P2 - HIGH';
          if (upper.includes('P3') || upper.includes('MEDIUM') || upper.includes('MODERATE')) return 'P3 - MEDIUM';
          return 'P4 - LOW';
        })(),
        configurationItem: p.configurationItemName,
        incidentIds: relatedIncidents.map(i => i.number),
        incidentsList: relatedIncidents,
        approved: p.state === 'RESOLVED',
        costLeakage: (p.relatedIncidentsCount || 0) * 450,
        mtbfHours: Math.round((deterministicRandom(p.id) * 50 + 10) * 10) / 10,
        riskScore: mapRiskScore(p.priority),
        fiveWhys: deriveFiveWhys(p.rootCause),
      };
    });
  }, [problems, incidents]);

  // Top problems for selector
  const topProblems = React.useMemo(() =>
    [...problemSuggestions].sort((a, b) => b.incidentIds.length - a.incidentIds.length).slice(0, 8),
    [problemSuggestions]
  );

  const [selectedNode, setSelectedNode] = React.useState<string>('');

  React.useEffect(() => {
    if (topProblems.length > 0 && (!selectedNode || !topProblems.find(p => p.id === selectedNode))) {
      setSelectedNode(topProblems[0].id);
    }
  }, [topProblems, selectedNode]);

  const currentProblem = problemSuggestions.find(s => s.id === selectedNode) || topProblems[0] || null;

  if (loading) {
    return <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
      {[1,2,3,4].map(i=> <div key={i} className="h-32 bg-slate-800/40 rounded-2xl border border-slate-800"></div>)}
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards can reuse GovernanceAnalyticsView if needed */}
      {/* For brevity, we render a simple header */}
      <h2 className="text-xl font-bold text-slate-100">Problem Analysis</h2>
      <p className="text-sm text-slate-400">Last refreshed: {lastRefreshed}</p>
      {/* Render problem suggestions table */}
      <div className="grid grid-cols-1 gap-4">
        {problemSuggestions.map(p => (
          <div key={p.id} className="p-4 border border-slate-800 rounded-lg bg-[#111827]">
            <h3 className="text-lg font-semibold text-slate-200">{p.title} (#{p.id})</h3>
            <p className="text-sm text-slate-400">Risk: {p.riskScore} | Cost Leakage: ${p.costLeakage}</p>
            <p className="text-sm text-slate-400">MTBF: {p.mtbfHours}h | Incidents: {p.incidentIds.length}</p>
            <details className="mt-2 text-slate-300">
              <summary>Details</summary>
              <p>{p.description}</p>
              <p><strong>Root Cause:</strong> {p.rootCause}</p>
              <p><strong>Workaround:</strong> {p.workaround}</p>
              <p><strong>Five Whys:</strong></p>
              <ul className="list-disc list-inside">
                {p.fiveWhys.map((w, i) => (<li key={i}>{w}</li>))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
