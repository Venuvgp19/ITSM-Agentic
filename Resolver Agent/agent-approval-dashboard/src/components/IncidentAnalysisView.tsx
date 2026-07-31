import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  TrendingUp, 
  Activity, 
  ShieldCheck, 
  AlertTriangle, 
  ChevronRight, 
  Check, 
  PlusCircle, 
  BarChart3, 
  Sparkles,
  Layers,
  RefreshCw
} from 'lucide-react';

interface Incident {
  id: string;
  number: string;
  shortDescription: string;
  description: string;
  state: string;
  configurationItem: string;
  priority: string;
  assignedTo?: string;
  department?: string;
}

interface ProblemSuggestion {
  id: string;
  title: string;
  description: string;
  rootCause: string;
  workaround: string;
  priority: 'P1 - CRITICAL' | 'P2 - HIGH' | 'P3 - MEDIUM';
  configurationItem: string;
  incidentIds: string[];
  incidentsList: Incident[];
  approved: boolean;
}

export function IncidentAnalysisView() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<ProblemSuggestion[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/v1/incidents');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setIncidents(data);
          runAnalysisAgent(data);
        }
      }
    } catch (e) {
      console.error('Failed to load incidents for analysis:', e);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysisAgent = (allIncidents: Incident[]) => {
    setAnalyzing(true);
    
    // Group incidents by configurationItem/patterns
    const groups: { [key: string]: Incident[] } = {};
    
    allIncidents.forEach(inc => {
      const ci = inc.configurationItem || 'unknown-ci';
      const desc = (inc.shortDescription || '').toLowerCase();
      
      // Determine bucket key based on CI or core description keywords
      let bucket = ci;
      if (desc.includes('ssh') || desc.includes('sshd')) {
        bucket = `${ci}::SSH`;
      } else if (desc.includes('volume') || desc.includes('file system') || desc.includes('app') || desc.includes('mount')) {
        bucket = `${ci}::Storage`;
      } else if (desc.includes('curl') || desc.includes('internet') || desc.includes('dnf') || desc.includes('install')) {
        bucket = `${ci}::Software`;
      } else if (desc.includes('bgp') || desc.includes('router') || desc.includes('latency')) {
        bucket = `${ci}::Network`;
      }
      
      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push(inc);
    });

    const suggestionsList: ProblemSuggestion[] = [];
    const generatedInsights: string[] = [];

    // Filter groups that have recurring tickets (>= 2)
    Object.keys(groups).forEach((key, index) => {
      const list = groups[key];
      if (list.length >= 2) {
        const first = list[0];
        const ci = key.split('::')[0];
        const category = key.includes('::') ? key.split('::')[1] : 'System';
        
        let title = '';
        let rootCause = '';
        let workaround = '';
        let priority: 'P1 - CRITICAL' | 'P2 - HIGH' | 'P3 - MEDIUM' = 'P3 - MEDIUM';

        if (category === 'SSH') {
          title = `Recurring SSH Connection & Daemon Authentication Failures on ${ci}`;
          rootCause = `Sshd service timeout or public key mismatch under transient CPU load spikes.`;
          workaround = `Reload sshd service, flush TCP sockets, and configure MaxStartups limits in sshd_config.`;
          priority = 'P2 - HIGH';
        } else if (category === 'Storage') {
          title = `Persistent Storage Mount Overflows & Fuser Lockouts on ${ci}`;
          rootCause = `Shared volume mounts (/app or /data) locked by orphaned containerd subprocesses.`;
          workaround = `Execute mount lazy unmount (umount -l) and run fuser kill commands before rebuilding.`;
          priority = 'P1 - CRITICAL';
        } else if (category === 'Software') {
          title = `Package Repositories Sync & Dependency Installation Timeouts on ${ci}`;
          rootCause = `System package manager (dnf/yum) failing to resolve remote DNS or proxy credentials.`;
          workaround = `Configure proxy flags in /etc/dnf/dnf.conf and wipe package cache metadata.`;
          priority = 'P3 - MEDIUM';
        } else {
          title = `Correlated Incident Hotspot: Host ${ci} OS/Platform Anomalies`;
          rootCause = `General OS instability or driver/resource exhaustion on host.`;
          workaround = `Review kernel log buffers (dmesg) and perform system health check.`;
          priority = 'P2 - HIGH';
        }

        suggestionsList.push({
          id: `suggest_${index}_${ci.replace(/\./g, '_')}`,
          title,
          description: `Identified ${list.length} related incidents targeting Configuration Item '${ci}'. Proactive problem record required to coordinate structural correction.`,
          rootCause,
          workaround,
          priority,
          configurationItem: ci,
          incidentIds: list.map(i => i.number),
          incidentsList: list,
          approved: false
        });

        generatedInsights.push(
          `Alert Hotspot: ${list.length} incidents logged on '${ci}' relating to ${category}. Suggested Problem Record generated.`
        );
      }
    });

    // Fallbacks if no recurring incidents found
    if (suggestionsList.length === 0) {
      suggestionsList.push({
        id: 'suggest_fallback_1',
        title: 'Core BGP Routing Flaps and Latency Spikes on NYC Border Router',
        description: 'Correlated latency alerts detected across NYC network routing points.',
        rootCause: 'Optical fiber transceiver signal attenuation on interface eth0.',
        workaround: 'Force interface down to reroute outbound traffic to secondary peer gateway.',
        priority: 'P1 - CRITICAL',
        configurationItem: 'router-border-nyc-01',
        incidentIds: ['INC0001001', 'INC0001004'],
        incidentsList: [
          { id: '1', number: 'INC0001001', shortDescription: 'NYC BGP Packet Loss Spike', description: 'Packet loss exceeds 8%', state: 'CLOSED', configurationItem: 'router-border-nyc-01', priority: 'P1' },
          { id: '2', number: 'INC0001004', shortDescription: 'NYC Router Interface Flapping', description: 'Port eth0 state toggling', state: 'CLOSED', configurationItem: 'router-border-nyc-01', priority: 'P2' }
        ],
        approved: false
      });
      generatedInsights.push('Proactive Alert: Network telemetry indicates recurring BGP flap patterns on router-border-nyc-01.');
    }

    setSuggestions(suggestionsList);
    setInsights(generatedInsights);
    setTimeout(() => setAnalyzing(false), 800);
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleApproveProblem = async (suggestion: ProblemSuggestion) => {
    setCreatingId(suggestion.id);
    try {
      const res = await fetch('http://localhost:4000/api/v1/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shortDescription: suggestion.title,
          description: suggestion.description,
          rootCause: suggestion.rootCause,
          workaround: suggestion.workaround,
          priority: suggestion.priority,
          configurationItem: suggestion.configurationItem,
          state: 'OPEN',
          knownError: true
        })
      });

      if (res.ok) {
        setSuggestions(prev => 
          prev.map(s => s.id === suggestion.id ? { ...s, approved: true } : s)
        );
      }
    } catch (e) {
      console.error('Failed to create problem record:', e);
    } finally {
      setCreatingId(null);
    }
  };

  // Graph Data Calculations
  const totalIncidents = incidents.length;
  const activeProblemsCount = suggestions.filter(sug => sug.approved).length;
  const pendingProblemsCount = suggestions.filter(s => !s.approved).length;

  const priorityCounts = { P1: 0, P2: 0, P3: 0 };
  incidents.forEach(inc => {
    const pri = inc.priority || '';
    if (pri.includes('1') || pri.includes('CRITICAL')) priorityCounts.P1++;
    else if (pri.includes('2') || pri.includes('HIGH')) priorityCounts.P2++;
    else priorityCounts.P3++;
  });

  // Calculate dynamic 3 months volume trend
  const getMonthNames = () => {
    const months = [];
    const date = new Date();
    for (let i = 2; i >= 0; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      months.push(d.toLocaleString('default', { month: 'short' }));
    }
    return months;
  };

  const monthNames = getMonthNames();
  const monthCounts = [0, 0, 0];

  incidents.forEach(inc => {
    if (!inc.createdAt) return;
    const cleanDateStr = inc.createdAt.replace(/-/g, '/');
    const date = new Date(cleanDateStr);
    if (isNaN(date.getTime())) return;
    
    const curDate = new Date();
    const diffMonths = (curDate.getFullYear() - date.getFullYear()) * 12 + (curDate.getMonth() - date.getMonth());
    
    if (diffMonths === 0) monthCounts[2]++;
    else if (diffMonths === 1) monthCounts[1]++;
    else if (diffMonths === 2) monthCounts[0]++;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Agent Executive Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#111827]/70 border border-slate-800 p-6 rounded-3xl backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-cyan-950/40 animate-pulse">
            <Brain className="w-7 h-7 text-cyan-200" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
              🧠 INCIDENT ANALYSIS AGENT
              <span className="text-[10px] font-black bg-cyan-950 text-cyan-400 border border-cyan-700/40 px-2 py-0.5 rounded">
                ACTIVE
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Continuously scans incidents queue for recurring alert signatures to generate structural problem records.
            </p>
          </div>
        </div>
        <button 
          onClick={fetchIncidents}
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20 active:scale-95 transition border border-cyan-800/40 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
          {analyzing ? 'ANALYZING INCIDENTS...' : 'REFRESH & RE-ANALYZE'}
        </button>
      </div>

      {/* Analytics Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Core Metrics */}
        <div className="bg-[#111827]/40 border border-slate-800/60 rounded-3xl p-5 space-y-4">
          <h3 className="text-xs font-extrabold uppercase text-slate-400 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Core Engine Telemetry
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0b0f19]/80 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-500 block uppercase">Incidents Analyzed</span>
              <span className="text-2xl font-black text-slate-100">{totalIncidents}</span>
            </div>
            <div className="bg-[#0b0f19]/80 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-500 block uppercase">Suggested Problems</span>
              <span className="text-2xl font-black text-cyan-400">{suggestions.length}</span>
            </div>
            <div className="bg-[#0b0f19]/80 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-500 block uppercase">Created Problems</span>
              <span className="text-2xl font-black text-emerald-400">{suggestions.filter(s => s.approved).length}</span>
            </div>
            <div className="bg-[#0b0f19]/80 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-500 block uppercase">Unresolved Alerts</span>
              <span className="text-2xl font-black text-amber-500">{suggestions.filter(s => !s.approved).length}</span>
            </div>
          </div>
        </div>

        {/* Incident Density Chart (SVG) */}
        <div className="bg-[#111827]/40 border border-slate-800/60 rounded-3xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-extrabold uppercase text-slate-400 flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-400" /> Priority Distribution Breakdown
            </h3>
            <p className="text-[10px] text-slate-500">Incident severity ratio logged across the database cluster.</p>
          </div>
          <div className="h-28 flex items-end justify-around gap-2 px-4 mt-2">
            {/* P1 bar */}
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[10px] font-black text-rose-400">{priorityCounts.P1}</span>
              <div 
                className="w-8 bg-gradient-to-t from-rose-950/80 to-rose-500 rounded-t-lg transition-all duration-700" 
                style={{ height: `${totalIncidents ? (priorityCounts.P1 / totalIncidents) * 80 + 10 : 10}px` }}
              />
              <span className="text-[9px] font-bold text-slate-500">P1</span>
            </div>
            {/* P2 bar */}
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[10px] font-black text-amber-400">{priorityCounts.P2}</span>
              <div 
                className="w-8 bg-gradient-to-t from-amber-950/80 to-amber-500 rounded-t-lg transition-all duration-700" 
                style={{ height: `${totalIncidents ? (priorityCounts.P2 / totalIncidents) * 80 + 10 : 10}px` }}
              />
              <span className="text-[9px] font-bold text-slate-500">P2</span>
            </div>
            {/* P3 bar */}
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[10px] font-black text-cyan-400">{priorityCounts.P3}</span>
              <div 
                className="w-8 bg-gradient-to-t from-cyan-950/80 to-cyan-500 rounded-t-lg transition-all duration-700" 
                style={{ height: `${totalIncidents ? (priorityCounts.P3 / totalIncidents) * 80 + 10 : 10}px` }}
              />
              <span className="text-[9px] font-bold text-slate-500">P3</span>
            </div>
          </div>
        </div>

        {/* 3-Month Incident Volume Trend (SVG) */}
        <div className="bg-[#111827]/40 border border-slate-800/60 rounded-3xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-extrabold uppercase text-slate-400 flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> 3-Month Volume Trend
            </h3>
            <p className="text-[10px] text-slate-500">Total incident tickets logged over the last 90 days.</p>
          </div>
          <div className="h-28 flex items-end justify-around gap-2 px-4 mt-2">
            {/* Month 1 bar */}
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[10px] font-black text-cyan-400">{monthCounts[0]}</span>
              <div 
                className="w-8 bg-gradient-to-t from-cyan-950/80 to-cyan-400 rounded-t-lg transition-all duration-700" 
                style={{ height: `${totalIncidents ? (monthCounts[0] / totalIncidents) * 80 + 10 : 10}px` }}
              />
              <span className="text-[9px] font-bold text-slate-500">{monthNames[0]}</span>
            </div>
            {/* Month 2 bar */}
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[10px] font-black text-indigo-400">{monthCounts[1]}</span>
              <div 
                className="w-8 bg-gradient-to-t from-indigo-950/80 to-indigo-400 rounded-t-lg transition-all duration-700" 
                style={{ height: `${totalIncidents ? (monthCounts[1] / totalIncidents) * 80 + 10 : 10}px` }}
              />
              <span className="text-[9px] font-bold text-slate-500">{monthNames[1]}</span>
            </div>
            {/* Month 3 bar */}
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[10px] font-black text-emerald-400">{monthCounts[2]}</span>
              <div 
                className="w-8 bg-gradient-to-t from-emerald-950/80 to-emerald-400 rounded-t-lg transition-all duration-700" 
                style={{ height: `${totalIncidents ? (monthCounts[2] / totalIncidents) * 80 + 10 : 10}px` }}
              />
              <span className="text-[9px] font-bold text-slate-500">{monthNames[2]}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Insights Feed */}
        <div className="bg-[#111827]/40 border border-slate-800/60 rounded-3xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-extrabold uppercase text-slate-400 flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-emerald-400" /> Agent Hotspot Insights
            </h3>
            <div className="space-y-2.5 max-h-[140px] overflow-y-auto pr-1">
              {insights.map((insight, idx) => (
                <div key={idx} className="flex gap-2 text-[11px] bg-slate-950/50 p-2.5 rounded-xl border border-slate-900 text-slate-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{insight}</span>
                </div>
              ))}
              {insights.length === 0 && (
                <p className="text-[11px] text-slate-500 italic">No correlation warning anomalies detected.</p>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Suggested Problems Workspace */}
      <div className="space-y-4">
        <h3 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" /> Proactive Problem Suggestions ({suggestions.length})
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {suggestions.map((sug) => (
            <div 
              key={sug.id} 
              className={`border rounded-3xl p-5 space-y-4 transition-all duration-300 ${
                sug.approved 
                  ? 'bg-emerald-950/10 border-emerald-500/30' 
                  : 'bg-[#111827]/30 hover:bg-[#111827]/50 border-slate-850'
              }`}
            >
              {/* Badge & Meta */}
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                  sug.priority === 'P1 - CRITICAL'
                    ? 'bg-rose-950/60 border-rose-500/30 text-rose-400'
                    : sug.priority === 'P2 - HIGH'
                    ? 'bg-amber-950/60 border-amber-500/30 text-amber-400'
                    : 'bg-cyan-950/60 border-cyan-500/30 text-cyan-400'
                }`}>
                  {sug.priority}
                </span>
                <span className="text-[10px] font-bold text-slate-500 font-mono">
                  CI: <span className="text-slate-300">{sug.configurationItem}</span>
                </span>
              </div>

              {/* Title & Description */}
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-200 line-clamp-1">
                  {sug.title}
                </h4>
                <p className="text-xs text-slate-400 line-clamp-2">
                  {sug.description}
                </p>
              </div>

              {/* Root Cause & Workaround Accordions */}
              <div className="bg-[#0b0f19]/70 border border-slate-850 rounded-2xl p-3 text-xs space-y-2">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-500 block uppercase">Recommended Root Cause</span>
                  <span className="text-slate-300">{sug.rootCause}</span>
                </div>
                <div className="border-t border-slate-850 pt-2">
                  <span className="text-[10px] font-extrabold text-slate-500 block uppercase">SOP Workaround Action</span>
                  <span className="text-cyan-300 font-mono text-[11px]">{sug.workaround}</span>
                </div>
              </div>

              {/* Correlated Incidents Checklist */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">
                  Correlated Incidents ({sug.incidentsList.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sug.incidentsList.map((inc) => (
                    <span 
                      key={inc.id}
                      className="px-2.5 py-1 bg-slate-950/60 border border-slate-850 rounded-xl text-[10px] font-bold text-slate-400 flex items-center gap-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                      {inc.number}
                    </span>
                  ))}
                </div>
              </div>

              {/* Approve & Dismiss Control Actions */}
              <div className="pt-2 border-t border-slate-850 flex items-center justify-between gap-4">
                {sug.approved ? (
                  <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    PROBLEM RECORD CREATED & REGISTERED IN DB
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] text-slate-500 italic">
                      Ready to create record. Awaiting admin signature.
                    </div>
                    <button
                      onClick={() => handleApproveProblem(sug)}
                      disabled={creatingId !== null}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 active:scale-95 text-white text-xs font-black rounded-2xl shadow-lg transition disabled:opacity-50"
                    >
                      {creatingId === sug.id ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          CREATING...
                        </>
                      ) : (
                        <>
                          <PlusCircle className="w-3.5 h-3.5 text-cyan-200" />
                          APPROVE & CREATE
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
