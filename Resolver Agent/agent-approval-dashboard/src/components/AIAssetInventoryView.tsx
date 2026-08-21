import React, { useState, useMemo } from 'react';
import {
  Bot,
  Cpu,
  Layers,
  Search,
  Filter,
  ShieldCheck,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ExternalLink,
  ChevronRight,
  Database,
  Terminal,
  FileCode2,
  Sliders,
  Sparkles,
  RefreshCw,
  Power,
  X,
  Workflow,
  Zap,
  Activity
} from 'lucide-react';

export interface AIAsset {
  id: string;
  ciId: string;
  name: string;
  category: 'react_agent' | 'agent' | 'model' | 'mcp_tool' | 'vector_dataset' | 'prompt_guardrail';
  provider: string;
  version: string;
  status: 'ACTIVE' | 'TESTING' | 'CONTAINED';
  riskTier: 'Tier 1 - High' | 'Tier 2 - Moderate' | 'Tier 3 - Low';
  owner: string;
  targetHosts: string[];
  latency: string;
  description: string;
  capabilities: string[];
  reactLoopSpecs?: {
    pattern: string;
    maxTurns: number;
    timeoutSec: number;
    errorRecovery: string;
  };
}

const mockAIAssets: AIAsset[] = [
  {
    id: 'ai-react-01',
    ciId: 'CI_AI_REACT_01',
    name: 'Autonomous SRE ReAct Execution Loop Agent',
    category: 'react_agent',
    provider: 'Local Enterprise Python Daemon (ReAct Engine)',
    version: 'v3.2.0 (Multi-Turn ReAct)',
    status: 'ACTIVE',
    riskTier: 'Tier 1 - High',
    owner: 'Unix SRE Lead (Richard Stallman)',
    targetHosts: ['WorkerNode1HL', 'control plane', 'Worker1OL', 'Worker2OL'],
    latency: '38s avg MTTR (3.2 turns avg)',
    description: 'Autonomous ReAct reasoning loop that executes iterative Thought-Action-Observation cycles over authenticated SSH sessions. Performs diagnostic triage, executes runbook commands, handles self-correcting error recovery, and verifies OS health before closing incidents.',
    capabilities: [
      'Multi-Turn Thought-Action-Observation Loop',
      'Interactive SSH PTY Execution & Stream Capture',
      'Self-Correcting Error Recovery on Exit Code > 0',
      'Strict Turn Limit Guard (Max 8 Turns)',
      'Human-in-the-Loop Interception for Destructive Ops',
      'Deterministic Fail-Safe Fallback'
    ],
    reactLoopSpecs: {
      pattern: 'Thought ➔ Action ➔ SSH Execute ➔ Observation ➔ Verification',
      maxTurns: 8,
      timeoutSec: 120,
      errorRecovery: 'Autonomous Self-Correction with Journalctl Ingestion'
    }
  },
  {
    id: 'ai-react-02',
    ciId: 'CI_AI_REACT_02',
    name: 'ReAct SSH Multi-Turn Diagnostic Agent',
    category: 'react_agent',
    provider: 'Resolver Agent Sub-Loop',
    version: 'v2.1.0',
    status: 'ACTIVE',
    riskTier: 'Tier 1 - High',
    owner: 'Unix SRE Team',
    targetHosts: ['WorkerNode1HL', 'control plane', 'Worker1OL', 'Worker2OL'],
    latency: '1.4s / diagnostic turn',
    description: 'Specialized ReAct sub-agent that executes non-mutating shell diagnostics (top, ps aux, systemctl status, journalctl -n 50, dmesg, netstat, df -h) to diagnose root causes before formulating a remediation plan.',
    capabilities: [
      'Live Kernel & Process Telemetry Probing',
      'Journalctl Crash Dump Log Analyzer',
      'Kubernetes Cluster & NodePort Health Prober',
      'Port Socket & Network Connectivity Triage'
    ],
    reactLoopSpecs: {
      pattern: 'Diagnostic Thought ➔ Shell Probe ➔ Log Parsing ➔ Root Cause State',
      maxTurns: 4,
      timeoutSec: 45,
      errorRecovery: 'Secondary Host Fallback & Network Route Probing'
    }
  },
  {
    id: 'ai-react-03',
    ciId: 'CI_AI_REACT_03',
    name: 'ReAct Post-Remediation OS Verification Agent',
    category: 'react_agent',
    provider: 'Resolver Agent Verification Module',
    version: 'v2.4.0',
    status: 'ACTIVE',
    riskTier: 'Tier 1 - High',
    owner: 'SRE Lead (Venu)',
    targetHosts: ['WorkerNode1HL', 'control plane', 'Worker1OL', 'Worker2OL'],
    latency: '850ms / verification loop',
    description: 'Post-fix verification ReAct agent that conducts active, live OS telemetry tests (POSIX user lookup, systemctl is-active, curl HTTP response checks, pod running status) to verify that the incident is completely resolved.',
    capabilities: [
      'POSIX id / getent User Verification',
      'Systemd Service Active State Assertion',
      'HTTP 200 OK NodePort Endpoint Validation',
      'False-Negative Flag Parser Defense'
    ],
    reactLoopSpecs: {
      pattern: 'Verify Thought ➔ Live OS Probe ➔ Output Assertion ➔ Resolution Verdict',
      maxTurns: 3,
      timeoutSec: 30,
      errorRecovery: 'Automatic Escalation to Human Queue on Assertion Failure'
    }
  },
  {
    id: 'ai-react-04',
    ciId: 'CI_AI_REACT_04',
    name: 'ReAct Human-in-the-Loop (HITL) Gatekeeper Agent',
    category: 'react_agent',
    provider: 'Agent Control Tower Security Gate',
    version: 'v3.0.0',
    status: 'ACTIVE',
    riskTier: 'Tier 1 - High',
    owner: 'Cyber Security Operations',
    targetHosts: ['All Enterprise Fleet Nodes'],
    latency: '<50ms risk evaluation',
    description: 'Intercepts potentially destructive ReAct actions (reboots, root user drops, firewall modifications, disk partitioning). Evaluates risk scoring (1-100), generates command diffs, and pauses the ReAct turn until an operator approves.',
    capabilities: [
      'Deterministic Command Risk Classifier',
      'Visual Command Diff Generation',
      'Operator Approval Webhook Interceptor',
      'Emergency Containment Kill Switch Enforcer'
    ],
    reactLoopSpecs: {
      pattern: 'Risk Evaluation ➔ Threat Scoring ➔ Gate Hold / Approval ➔ Safe Release',
      maxTurns: 1,
      timeoutSec: 3600,
      errorRecovery: 'Automatic Timeout Rejection & Safe Rollback'
    }
  },
  {
    id: 'ai-02',
    ciId: 'CI_AI_AGENT_02',
    name: 'Sequential NVIDIA LLM Ticket Router',
    category: 'agent',
    provider: 'NestJS Background Service',
    version: 'v3.1.0',
    status: 'ACTIVE',
    riskTier: 'Tier 2 - Moderate',
    owner: 'ITIL Ops Lead (Sarah Connor)',
    targetHosts: ['ITSM Backend (Port 4000)'],
    latency: '1.2s / ticket',
    description: 'Continuously monitors unassigned incidents and routes them with high confidence to designated Assignment Groups and individual team members.',
    capabilities: ['Semantic Ticket Classification', 'Department Auto-Assignment', 'Engineer Allocation'],
  },
  {
    id: 'ai-03',
    ciId: 'CI_AI_AGENT_03',
    name: 'Autonomous SOP Runbook Synthesizer',
    category: 'agent',
    provider: 'Resolver Agent Module',
    version: 'v1.8.0',
    status: 'ACTIVE',
    riskTier: 'Tier 2 - Moderate',
    owner: 'Knowledge Management SRE',
    targetHosts: ['ChromaDB Cluster'],
    latency: '4.5s / runbook',
    description: 'Extracts resolution patterns from resolved incidents, generates Reusable Investigative Standard Operating Procedures, and indexes them into vector space.',
    capabilities: ['RAG Runbook Authoring', 'Vector Embedding Indexing', 'Incident Pattern Synthesis'],
  },
  {
    id: 'ai-04',
    ciId: 'CI_AI_MODEL_01',
    name: 'NVIDIA Llama-3.3 70B Instruct',
    category: 'model',
    provider: 'NVIDIA NIM (integrate.api.nvidia.com)',
    version: '70B-Instruct-v1',
    status: 'ACTIVE',
    riskTier: 'Tier 1 - High',
    owner: 'Enterprise Architecture',
    targetHosts: ['Cloud Inference Engine'],
    latency: '420ms TTFT',
    description: 'Primary reasoning engine used for multi-step ReAct planning, shell command generation, root cause analysis, and risk scoring.',
    capabilities: ['128k Context Window', 'Tool Calling', 'Structured JSON Output', 'Code Generation'],
  },
  {
    id: 'ai-05',
    ciId: 'CI_AI_MODEL_02',
    name: 'NVIDIA Nemotron-3.5 30B Lightning',
    category: 'model',
    provider: 'NVIDIA NIM',
    version: '30B-a3b',
    status: 'ACTIVE',
    riskTier: 'Tier 2 - Moderate',
    owner: 'Enterprise Architecture',
    targetHosts: ['Cloud Inference Engine'],
    latency: '190ms TTFT',
    description: 'High-throughput secondary model for high-frequency ticket categorization, incident summarization, and fallback reasoning.',
    capabilities: ['High Token Velocity', 'Low-Latency Routing', 'Semantic Parsing'],
  },
  {
    id: 'ai-06',
    ciId: 'CI_AI_MCP_01',
    name: 'ServiceNow ITSM MCP Protocol Server',
    category: 'mcp_tool',
    provider: 'Anthropic Model Context Protocol',
    version: 'v1.0.0 (Port 3001)',
    status: 'ACTIVE',
    riskTier: 'Tier 1 - High',
    owner: 'Global Admin (Venu)',
    targetHosts: ['localhost:3001', 'Enterprise Gateway'],
    latency: '<15ms',
    description: 'Exposes standardized MCP tool endpoints for reading incidents, drafting work notes, executing approvals, and triggering workflow actions.',
    capabilities: ['get_incident', 'update_incident_state', 'add_work_note', 'query_cmdb_ci'],
  },
  {
    id: 'ai-07',
    ciId: 'CI_AI_TOOL_01',
    name: 'Host Mutex SSH Session Holder',
    category: 'mcp_tool',
    provider: 'Paramiko SSH Layer',
    version: 'v2.11.0',
    status: 'ACTIVE',
    riskTier: 'Tier 1 - High',
    owner: 'Unix Team',
    targetHosts: ['WorkerNode1HL', 'control plane', 'Worker1OL', 'Worker2OL'],
    latency: '2ms / command',
    description: 'Maintains authenticated, persistent SSH transport sessions with strict per-host concurrency locks and command exit code validation.',
    capabilities: ['PTY Terminal Allocation', 'Host Mutex Locking', 'Strict Host Key Whitelisting'],
  },
  {
    id: 'ai-08',
    ciId: 'CI_AI_DATASET_01',
    name: 'ChromaDB SOP 3D Vector Space',
    category: 'vector_dataset',
    provider: 'ChromaDB Embedding Store',
    version: '49 Active Embeddings',
    status: 'ACTIVE',
    riskTier: 'Tier 3 - Low',
    owner: 'Knowledge Management SRE',
    targetHosts: ['Vector Storage DB'],
    latency: '18ms query',
    description: 'Multidimensional vector repository storing 49 Reusable Investigative Standard Operating Procedures partitioned by department.',
    capabilities: ['Cosine Similarity Search', 'Department Partitioning', 'Metadata Filtering', 'Event-Driven Auto-Reindexing'],
  },
  {
    id: 'ai-09',
    ciId: 'CI_AI_GUARD_01',
    name: 'Post-Remediation Verification Guardrail',
    category: 'prompt_guardrail',
    provider: 'Control Tower Active Security',
    version: 'v2.2.0',
    status: 'ACTIVE',
    riskTier: 'Tier 1 - High',
    owner: 'SecOps (Bruce Schneier)',
    targetHosts: ['All Managed Fleet Nodes'],
    latency: 'Immediate',
    description: 'Enforces live OS verification (uid checks, systemctl status, pod phases, port testing) before allowing any incident to mark as resolved.',
    capabilities: ['False Negative Suppression', 'Flag Parser Validator', 'Sudoers Inspection'],
  },
];

export function AIAssetInventoryView() {
  const [assets, setAssets] = useState<AIAsset[]>(mockAIAssets);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [selectedAsset, setSelectedAsset] = useState<AIAsset | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // 1. Fetch live containment status from backend
  const fetchLiveContainment = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/v1/agent/containment');
      if (res.ok) {
        const data = await res.json();
        const containedSet = new Set(data.containedCis || []);
        setAssets((prev) =>
          prev.map((a) => ({
            ...a,
            status: containedSet.has(a.ciId) ? 'CONTAINED' : 'ACTIVE',
          }))
        );
      }
    } catch (err) {
      console.warn('Could not sync live containment state from backend:', err);
    }
  };

  React.useEffect(() => {
    fetchLiveContainment();
    const interval = setInterval(fetchLiveContainment, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      const matchesCat = categoryFilter === 'ALL' || a.category === categoryFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        a.name.toLowerCase().includes(q) ||
        a.ciId.toLowerCase().includes(q) ||
        a.provider.toLowerCase().includes(q) ||
        a.owner.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [assets, categoryFilter, search]);

  const toggleContainment = async (id: string) => {
    const target = assets.find((a) => a.id === id);
    if (!target) return;

    const nextStatus = target.status === 'CONTAINED' ? 'ACTIVE' : 'CONTAINED';
    
    // Optimistic UI update
    setAssets((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: nextStatus } : a))
    );
    if (selectedAsset && selectedAsset.id === id) {
      setSelectedAsset((prev) => (prev ? { ...prev, status: nextStatus } : null));
    }

    // Persist to backend
    try {
      setIsSyncing(true);
      await fetch('http://localhost:4000/api/v1/agent/containment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciId: target.ciId,
          status: nextStatus,
          reason: `Operator ${nextStatus === 'CONTAINED' ? 'triggered Kill Switch isolation' : 'restored CI to production'} via AI Asset Inventory.`,
          triggeredBy: 'Venu (Global Administrator)'
        }),
      });
    } catch (err) {
      console.error('Failed to update containment on backend:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'react_agent':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-400" />
            <span>ReAct Loop Agent</span>
          </span>
        );
      case 'agent':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">Agent</span>;
      case 'model':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">Foundation Model</span>;
      case 'mcp_tool':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Tool / MCP</span>;
      case 'vector_dataset':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">Vector Dataset</span>;
      case 'prompt_guardrail':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">Guardrail</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <span>AI ASSET INVENTORY (CMDB FOR AI)</span>
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              {filteredAssets.length} Assets Registered
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Single pane of glass tracking all enterprise AI ReAct loop agents, foundation models, MCP tools, vector datasets, and guardrails as Configuration Items.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAssets(mockAIAssets)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 border border-slate-800 cursor-pointer shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Discover Assets</span>
          </button>
        </div>
      </div>

      {/* 2. Filters & Search */}
      <div className="pro-card rounded-2xl p-4 border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mr-1 font-mono">
            <Filter className="w-3.5 h-3.5 text-cyan-400" /> Asset Type:
          </span>
          {[
            { id: 'ALL', label: 'All AI Assets' },
            { id: 'react_agent', label: '🔄 ReAct Loop Agents' },
            { id: 'agent', label: '🤖 Autonomous Agents' },
            { id: 'model', label: '🧠 Foundation Models' },
            { id: 'mcp_tool', label: '🛠️ Tools & MCP' },
            { id: 'vector_dataset', label: '📚 Vector Datasets' },
            { id: 'prompt_guardrail', label: '🛡️ Guardrails' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                categoryFilter === cat.id
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20'
                  : 'bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ReAct loops, models, CIs..."
            className="bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none w-64 transition"
          />
        </div>
      </div>

      {/* 3. High-Contrast Inventory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAssets.map((asset) => {
          const isContained = asset.status === 'CONTAINED';
          const isReactLoop = asset.category === 'react_agent';

          return (
            <div
              key={asset.id}
              onClick={() => setSelectedAsset(asset)}
              className={`pro-card rounded-2xl p-5 border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
                isContained
                  ? 'border-rose-500/50 bg-rose-950/20'
                  : isReactLoop
                  ? 'border-amber-500/30 hover:border-amber-400 bg-slate-900/90 hover:bg-slate-900'
                  : 'border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900/90'
              }`}
            >
              <div>
                {/* Card Top: CI ID & Status */}
                <div className="flex items-center justify-between mb-2.5">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    isReactLoop
                      ? 'text-amber-300 bg-amber-950/40 border-amber-500/40'
                      : 'text-cyan-400 bg-cyan-950/40 border-cyan-500/30'
                  }`}>
                    {asset.ciId}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {getCategoryBadge(asset.category)}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                        isContained
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {asset.status}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-sm font-extrabold text-white group-hover:text-cyan-300 transition line-clamp-1 flex items-center gap-1.5">
                  {isReactLoop && <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  <span>{asset.name}</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  {asset.description}
                </p>

                {/* Telemetry Pills */}
                <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-slate-500 block">Risk Tier</span>
                    <strong className={asset.riskTier.includes('High') ? 'text-amber-300' : 'text-slate-300'}>
                      {asset.riskTier}
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-slate-500 block">Latency / Rate</span>
                    <strong className="text-emerald-400">{asset.latency}</strong>
                  </div>
                </div>

                {/* If ReAct Loop, show turn specs */}
                {asset.reactLoopSpecs && (
                  <div className="mt-2.5 p-2 rounded-lg bg-amber-950/20 border border-amber-500/30 text-[10px] font-mono text-amber-300 flex items-center justify-between">
                    <span className="text-slate-400">Max Horizon:</span>
                    <strong className="text-amber-300">{asset.reactLoopSpecs.maxTurns} Turns Max</strong>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 text-[10px] truncate max-w-[150px]">
                  Owner: <strong className="text-slate-300">{asset.owner.split(' ')[0]}</strong>
                </span>
                <span className="text-cyan-400 font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition text-[11px]">
                  <span>Inspect CI</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Asset Detail Drawer */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full p-6 overflow-y-auto space-y-6 flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    selectedAsset.category === 'react_agent'
                      ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                      : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                  }`}>
                    {selectedAsset.category === 'react_agent' ? <Workflow className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-cyan-400 font-bold">{selectedAsset.ciId}</span>
                    <h2 className="text-base font-black text-white">{selectedAsset.name}</h2>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status & Containment Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                selectedAsset.status === 'CONTAINED'
                  ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                  : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              }`}>
                <div className="flex items-center gap-2">
                  {selectedAsset.status === 'CONTAINED' ? (
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  )}
                  <div>
                    <div className="text-xs font-bold">
                      {selectedAsset.status === 'CONTAINED' ? 'ASSET CONTAINED / ISOLATED' : 'ACTIVE IN PRODUCTION'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {selectedAsset.status === 'CONTAINED'
                        ? 'Kill Switch active — All autonomous executions blocked.'
                        : 'Operating under least-privilege active governance.'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => toggleContainment(selectedAsset.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    selectedAsset.status === 'CONTAINED'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{selectedAsset.status === 'CONTAINED' ? 'Restore Asset' : 'Trigger Kill Switch'}</span>
                </button>
              </div>

              {/* ReAct Specific Lifecycle Box */}
              {selectedAsset.reactLoopSpecs && (
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-bold font-mono">
                    <Workflow className="w-4 h-4 text-amber-400" />
                    <span>ReAct Multi-Turn Loop Specifications</span>
                  </div>
                  <div className="space-y-2 text-[11px] font-mono">
                    <div className="bg-slate-950/80 p-2.5 rounded-lg border border-amber-500/20">
                      <span className="text-slate-400 block mb-1">Reasoning Execution Pattern:</span>
                      <strong className="text-amber-200">{selectedAsset.reactLoopSpecs.pattern}</strong>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block">Max Turns Horizon:</span>
                        <strong className="text-white">{selectedAsset.reactLoopSpecs.maxTurns} Iterations</strong>
                      </div>
                      <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block">Turn Timeout:</span>
                        <strong className="text-white">{selectedAsset.reactLoopSpecs.timeoutSec}s per command</strong>
                      </div>
                    </div>
                    <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block">Self-Healing Logic:</span>
                      <strong className="text-emerald-300">{selectedAsset.reactLoopSpecs.errorRecovery}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata Key-Values */}
              <div className="pro-card rounded-xl p-4 border border-slate-800 space-y-3 text-xs">
                <h4 className="text-[11px] font-mono font-bold text-slate-400 uppercase border-b border-slate-800 pb-2">
                  CI Configuration Specifications
                </h4>
                <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Category</span>
                    <strong className="text-white">{selectedAsset.category.toUpperCase()}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Version</span>
                    <strong className="text-cyan-300">{selectedAsset.version}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Risk Tier</span>
                    <strong className="text-amber-300">{selectedAsset.riskTier}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Provider</span>
                    <strong className="text-white">{selectedAsset.provider}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Owner / Lead</span>
                    <strong className="text-slate-200">{selectedAsset.owner}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Latency SLA</span>
                    <strong className="text-emerald-400">{selectedAsset.latency}</strong>
                  </div>
                </div>
              </div>

              {/* Target Fleet Hosts */}
              <div className="pro-card rounded-xl p-4 border border-slate-800 space-y-2 text-xs">
                <h4 className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                  Connected Target Host Nodes
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedAsset.targetHosts.map((h) => (
                    <span key={h} className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-300">
                      {h}
                    </span>
                  ))}
                </div>
              </div>

              {/* Capabilities */}
              <div className="pro-card rounded-xl p-4 border border-slate-800 space-y-2 text-xs">
                <h4 className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                  Audited Functional Capabilities
                </h4>
                <div className="space-y-1 text-slate-300 text-[11px]">
                  {selectedAsset.capabilities.map((c) => (
                    <div key={c} className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedAsset(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
