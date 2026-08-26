import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Radio } from 'lucide-react';
import { AIAsset } from './AIAssetInventoryView';

interface AIFleetTopology3DProps {
  assets: AIAsset[];
  onSelectAsset: (asset: AIAsset) => void;
}

// Curated "who talks to whom" edges, derived from verified call paths in this
// codebase (not live-traced) -- e.g. the ReAct remediation/diagnostic loops
// query the Chroma vector store via daemon/rag/hybrid_search.py for SOP
// retrieval, the SOP Synthesizer writes new embeddings back into it via
// daemon/rag/sop_auto_reindexer.py, and the Router's historical-precedent
// grounding is a direct SQL lookup against itsm_db/agentic_sre_db (NOT the
// vector store) -- so it's wired to those two databases below, not the KB.
interface Edge {
  from: string;
  to: string;
  label: string;
}

const AI_EDGES: Edge[] = [
  { from: 'CI_AI_REACT_01', to: 'CI_AI_MODEL_01', label: 'Primary reasoning for Thought → Action planning' },
  { from: 'CI_AI_REACT_01', to: 'CI_AI_TOOL_01', label: 'Executes shell commands over the SSH session' },
  { from: 'CI_AI_REACT_01', to: 'CI_AI_DATASET_01', label: 'SOP retrieval via hybrid_search.py RAG' },
  { from: 'CI_AI_REACT_01', to: 'CI_AI_GUARD_01', label: 'Post-remediation verification before closing the incident' },
  { from: 'CI_AI_REACT_02', to: 'CI_AI_MODEL_02', label: 'Diagnostic reasoning for root-cause triage' },
  { from: 'CI_AI_REACT_02', to: 'CI_AI_TOOL_01', label: 'Runs non-mutating diagnostic shell probes' },
  { from: 'CI_AI_REACT_02', to: 'CI_AI_DATASET_01', label: 'Precedent SOP grounding for diagnosis' },
  { from: 'CI_AI_REACT_03', to: 'CI_AI_TOOL_01', label: 'Live OS telemetry verification probes' },
  { from: 'CI_AI_REACT_03', to: 'CI_AI_GUARD_01', label: 'Enforces resolution-verification guardrail' },
  { from: 'CI_AI_REACT_04', to: 'CI_AI_REACT_01', label: 'Intercepts destructive actions for human approval' },
  { from: 'CI_AI_REACT_04', to: 'CI_AI_GUARD_01', label: 'Shares the same safety enforcement layer' },
  { from: 'CI_AI_AGENT_02', to: 'CI_AI_MODEL_02', label: 'Ticket classification & priority prediction' },
  { from: 'CI_AI_AGENT_02', to: 'CI_AI_MCP_01', label: 'Uses the shared ITSM tool interface' },
  { from: 'CI_AI_AGENT_03', to: 'CI_AI_DATASET_01', label: 'Writes newly synthesized SOP embeddings' },
  { from: 'CI_AI_AGENT_03', to: 'CI_AI_MODEL_01', label: 'Drafts SOP content from resolved incidents' },
];

// Infrastructure layer -- real dependencies that aren't AI CMDB assets
// themselves (hosts, databases, the backend API), added so the map reads as
// the whole system rather than just the 11 AI assets in isolation.
interface InfraNode {
  id: string;
  name: string;
  kind: 'host' | 'database' | 'backend';
  color: string;
}

const INFRA_NODES: InfraNode[] = [
  { id: 'HOST_WORKERNODE1HL', name: 'WorkerNode1HL (192.168.100.102)', kind: 'host', color: '#94a3b8' },
  { id: 'HOST_CONTROL_PLANE', name: 'control plane (192.168.100.101)', kind: 'host', color: '#94a3b8' },
  { id: 'HOST_WORKER1OL', name: 'Worker1OL (192.168.56.10)', kind: 'host', color: '#94a3b8' },
  { id: 'HOST_WORKER2OL', name: 'Worker2OL (192.168.56.11)', kind: 'host', color: '#94a3b8' },
  { id: 'DB_ITSM', name: 'itsm_db (PostgreSQL)', kind: 'database', color: '#818cf8' },
  { id: 'DB_AGENTIC', name: 'agentic_sre_db (PostgreSQL)', kind: 'database', color: '#818cf8' },
  { id: 'BACKEND_NESTJS', name: 'NestJS ITSM Backend (:4000)', kind: 'backend', color: '#2dd4bf' },
];

const INFRA_EDGES: Edge[] = [
  { from: 'CI_AI_TOOL_01', to: 'HOST_WORKERNODE1HL', label: 'Persistent authenticated SSH session' },
  { from: 'CI_AI_TOOL_01', to: 'HOST_CONTROL_PLANE', label: 'Persistent authenticated SSH session' },
  { from: 'CI_AI_TOOL_01', to: 'HOST_WORKER1OL', label: 'Persistent authenticated SSH session' },
  { from: 'CI_AI_TOOL_01', to: 'HOST_WORKER2OL', label: 'Persistent authenticated SSH session' },
  { from: 'CI_AI_MCP_01', to: 'BACKEND_NESTJS', label: 'Exposes get_incident / update_incident_state tool calls' },
  { from: 'CI_AI_AGENT_02', to: 'BACKEND_NESTJS', label: 'PATCHes department/priority/state on classified tickets' },
  { from: 'CI_AI_AGENT_02', to: 'DB_ITSM', label: 'Direct SQL: historical resolved-ticket precedent lookup' },
  { from: 'CI_AI_AGENT_02', to: 'DB_AGENTIC', label: 'Direct SQL: past SRE execution precedent lookup' },
  { from: 'CI_AI_REACT_01', to: 'BACKEND_NESTJS', label: 'Fetches/updates incident queue via ITSM API' },
  { from: 'CI_AI_REACT_02', to: 'BACKEND_NESTJS', label: 'Fetches incident + KB context via ITSM API' },
  { from: 'BACKEND_NESTJS', to: 'DB_ITSM', label: 'Prisma ORM persistence layer' },
];

const ALL_EDGES: Edge[] = [...AI_EDGES, ...INFRA_EDGES];

const CATEGORY_COLOR: Record<string, string> = {
  react_agent: '#f59e0b',
  agent: '#22d3ee',
  model: '#a78bfa',
  mcp_tool: '#34d399',
  vector_dataset: '#38bdf8',
  prompt_guardrail: '#fb7185',
};

const KIND_LABEL: Record<InfraNode['kind'], string> = {
  host: 'Target Host',
  database: 'Database',
  backend: 'Backend API',
};

interface TopoNode {
  id: string;
  name: string;
  kind: 'central' | 'ai_asset' | 'host' | 'database' | 'backend';
  color: string;
  status?: AIAsset['status'];
  asset?: AIAsset;
  x: number;
  y: number;
  z: number;
}

const HEAT_DECAY_MS = 5 * 60 * 1000; // 5 minutes -- matches "recent activity" window

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? ((px - ax) * abx + (py - ay) * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

export function AIFleetTopology3D({ assets, onSelectAsset }: AIFleetTopology3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [yaw, setYaw] = useState(0.5);
  const [pitch, setPitch] = useState(-0.15);
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoom, setZoom] = useState(1);
  const isDragging = useRef(false);
  const draggedThisPress = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const wasAutoRotating = useRef(autoRotate);
  const [history, setHistory] = useState<any[]>([]);

  // Live activity feed -- powers the "recent activity" glow/pulse weighting
  useEffect(() => {
    const fetchHistory = () => {
      fetch('http://localhost:5173/api/v1/agent/history')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => Array.isArray(data) && setHistory(data))
        .catch(() => {});
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 8000);
    return () => clearInterval(interval);
  }, []);

  // Central node = the vector knowledge base; AI assets orbit it on an inner
  // shell, real infrastructure (hosts/DBs/backend) sits on an outer shell --
  // both laid out with a Fibonacci-sphere distribution so nodes never overlap
  // regardless of how many assets exist.
  const nodes = useMemo<TopoNode[]>(() => {
    const central = assets.find((a) => a.category === 'vector_dataset');
    const orbitingAssets = assets.filter((a) => a.category !== 'vector_dataset');
    const result: TopoNode[] = [];

    if (central) {
      result.push({
        id: central.ciId,
        name: central.name,
        kind: 'central',
        color: CATEGORY_COLOR.vector_dataset,
        status: central.status,
        asset: central,
        x: 0,
        y: 0,
        z: 0,
      });
    }

    const placeShell = (
      items: Array<Omit<TopoNode, 'x' | 'y' | 'z'>>,
      radius: number,
      yScale: number
    ) => {
      const n = items.length;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      items.forEach((it, i) => {
        const yFrac = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
        const ringRadius = Math.sqrt(Math.max(0, 1 - yFrac * yFrac));
        const theta = goldenAngle * i;
        result.push({
          ...it,
          x: Math.cos(theta) * ringRadius * radius,
          y: yFrac * radius * yScale,
          z: Math.sin(theta) * ringRadius * radius,
        });
      });
    };

    placeShell(
      orbitingAssets.map((a) => ({
        id: a.ciId,
        name: a.name,
        kind: 'ai_asset' as const,
        color: CATEGORY_COLOR[a.category] || '#94a3b8',
        status: a.status,
        asset: a,
      })),
      170,
      0.85
    );

    placeShell(
      INFRA_NODES.map((n) => ({ id: n.id, name: n.name, kind: n.kind, color: n.color })),
      300,
      0.9
    );

    return result;
  }, [assets]);

  const nodeById = useMemo(() => {
    const map: Record<string, TopoNode> = {};
    nodes.forEach((n) => (map[n.id] = n));
    return map;
  }, [nodes]);

  // Recency-weighted "heat" per node, derived from the real Execution Audit
  // Log (targetCi field) rather than fabricated activity -- hosts and
  // react-agent assets are matched directly by targetCi/targetHosts overlap,
  // then heat propagates one hop along edges so connected nodes glow too.
  const heatById = useMemo(() => {
    const now = Date.now();
    const heat: Record<string, number> = {};
    const bump = (id: string, ts: number) => {
      const age = now - ts;
      if (age < 0 || age > HEAT_DECAY_MS) return;
      const h = 1 - age / HEAT_DECAY_MS;
      if (h > (heat[id] || 0)) heat[id] = h;
    };

    history.forEach((h: any) => {
      const ts = new Date(h.executedAt || h.timestamp || 0).getTime();
      const ci = String(h.targetCi || '').toLowerCase().trim();
      if (!ts || !ci) return;

      INFRA_NODES.filter((n) => n.kind === 'host').forEach((n) => {
        const short = n.id.replace('HOST_', '').toLowerCase();
        if (n.name.toLowerCase().includes(ci) || ci.includes(short)) bump(n.id, ts);
      });
      assets.forEach((a) => {
        if (a.targetHosts.some((th) => th.toLowerCase().includes(ci) || ci.includes(th.toLowerCase()))) {
          bump(a.ciId, ts);
        }
      });
    });

    // Propagate one hop so an active host lights up the agent talking to it
    ALL_EDGES.forEach(({ from, to }) => {
      const a = heat[from] || 0;
      const b = heat[to] || 0;
      const boosted = Math.max(a, b) * 0.6;
      if (boosted > (heat[from] || 0)) heat[from] = boosted;
      if (boosted > (heat[to] || 0)) heat[to] = boosted;
    });

    return heat;
  }, [history, assets]);

  // Starfield backdrop -- fixed screen-space points, generated once
  const stars = useMemo(() => {
    const pts: Array<{ x: number; y: number; r: number; phase: number }> = [];
    for (let i = 0; i < 160; i++) {
      pts.push({
        x: Math.random() * 900,
        y: Math.random() * 520,
        r: Math.random() * 1.2 + 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return pts;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let localYaw = yaw;
    let localPitch = pitch;
    const startTime = Date.now();

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const elapsed = (Date.now() - startTime) / 1000;

      // Starfield
      stars.forEach((s) => {
        const alpha = 0.25 + 0.55 * Math.abs(Math.sin(elapsed * 0.4 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(199, 234, 255, ${alpha.toFixed(2)})`;
        ctx.fill();
      });

      // Camera easing: fly-to on click, gentle auto-rotate otherwise
      if (focusId && nodeById[focusId]) {
        const target = nodeById[focusId];
        const desiredYaw = Math.atan2(target.x, target.z || 0.0001);
        const planarDist = Math.sqrt(target.x * target.x + target.z * target.z);
        const desiredPitch = Math.max(
          -Math.PI / 2.2,
          Math.min(Math.PI / 2.2, -Math.atan2(target.y, planarDist || 0.0001))
        );
        localYaw += (desiredYaw - localYaw) * 0.06;
        localPitch += (desiredPitch - localPitch) * 0.06;
        if (Math.abs(desiredYaw - localYaw) < 0.02 && Math.abs(desiredPitch - localPitch) < 0.02) {
          if (target.asset) onSelectAsset(target.asset);
          setFocusId(null);
          setAutoRotate(wasAutoRotating.current);
        }
      } else if (autoRotate && !isDragging.current) {
        localYaw += 0.0025;
      }

      const cosY = Math.cos(localYaw);
      const sinY = Math.sin(localYaw);
      const cosX = Math.cos(localPitch);
      const sinX = Math.sin(localPitch);
      const fov = 400;

      const project = (x: number, y: number, z: number) => {
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const scale = (fov / (fov + z2)) * zoom;
        return { sx: cx + x1 * scale, sy: cy + y2 * scale, zDepth: z2, scale };
      };

      const projected = nodes.map((n) => ({ n, ...project(n.x, n.y, n.z) }));
      const projById: Record<string, (typeof projected)[number]> = {};
      projected.forEach((p) => (projById[p.n.id] = p));

      // Edges with a traveling pulse; brighter/faster where recent activity was seen
      ALL_EDGES.forEach((edge, idx) => {
        const a = projById[edge.from];
        const b = projById[edge.to];
        if (!a || !b) return;

        const contained =
          (a.n.status === 'CONTAINED' && a.n.kind !== 'host' && a.n.kind !== 'database' && a.n.kind !== 'backend') ||
          (b.n.status === 'CONTAINED' && b.n.kind !== 'host' && b.n.kind !== 'database' && b.n.kind !== 'backend');
        const heat = Math.max(heatById[edge.from] || 0, heatById[edge.to] || 0);
        const isHoveredEdge = tooltip && tooltip.text === edge.label;

        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        if (contained) {
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
          ctx.setLineDash([4, 3]);
        } else {
          const alpha = 0.18 + heat * 0.45 + (isHoveredEdge ? 0.35 : 0);
          ctx.strokeStyle = `rgba(56, 189, 248, ${Math.min(0.95, alpha).toFixed(2)})`;
          ctx.setLineDash([]);
        }
        ctx.lineWidth = isHoveredEdge ? 2 : 1;
        ctx.stroke();
        ctx.setLineDash([]);

        if (!contained) {
          const speed = 0.15 + heat * 0.5;
          const t = ((elapsed * speed + idx * 0.31) % 1 + 1) % 1;
          const px = a.sx + (b.sx - a.sx) * t;
          const py = a.sy + (b.sy - a.sy) * t;
          const dotColor = heat > 0.15 ? '#fbbf24' : '#67e8f9';
          ctx.beginPath();
          ctx.arc(px, py, 2 + heat * 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = dotColor;
          ctx.shadowColor = dotColor;
          ctx.shadowBlur = 8 + heat * 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // Painter's algorithm for correct depth overlap
      projected.sort((a, b) => b.zDepth - a.zDepth);

      projected.forEach((p) => {
        const { n, sx, sy, scale } = p;
        const isHovered = hoveredId === n.id;
        const isContained = n.status === 'CONTAINED';
        const heat = heatById[n.id] || 0;
        const baseColor = isContained ? '#f43f5e' : n.color;

        let baseRadius = n.kind === 'central' ? 14 : n.kind === 'ai_asset' ? 7 : 5.5;
        if (n.kind === 'central') baseRadius += Math.sin(elapsed * 1.6) * 2;
        const radius = Math.max(2, baseRadius * scale);

        // Soft atmosphere halo -- cheap "immersive glow" without trail buffers
        if (heat > 0.05 || n.kind === 'central' || isHovered) {
          const haloR = radius * (3 + heat * 2);
          const grad = ctx.createRadialGradient(sx, sy, radius * 0.5, sx, sy, haloR);
          const haloAlpha = 0.28 * (n.kind === 'central' ? 1 : Math.max(heat, isHovered ? 0.5 : 0));
          grad.addColorStop(0, `${baseColor}${Math.round(haloAlpha * 255).toString(16).padStart(2, '0')}`);
          grad.addColorStop(1, `${baseColor}00`);
          ctx.beginPath();
          ctx.arc(sx, sy, haloR, 0, 2 * Math.PI);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, radius + (isHovered ? 2.5 : 0), 0, 2 * Math.PI);
        ctx.fillStyle = isHovered ? '#ffffff' : baseColor;
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = n.kind === 'central' ? 20 : isHovered ? 14 : 6 + heat * 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (n.kind === 'central') {
          ctx.beginPath();
          ctx.arc(sx, sy, radius + 6, 0, 2 * Math.PI);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        if (heat > 0.15 && n.kind !== 'central') {
          ctx.beginPath();
          ctx.arc(sx, sy, radius + 4, 0, 2 * Math.PI);
          ctx.strokeStyle = `rgba(251, 191, 36, ${Math.min(0.9, heat).toFixed(2)})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }

        if (isHovered || n.kind === 'central') {
          ctx.fillStyle = '#e2e8f0';
          ctx.font = n.kind === 'central' ? 'bold 11px sans-serif' : 'bold 10px sans-serif';
          ctx.fillText(n.name, sx + radius + 6, sy + 4);
        }
      });

      if (!isDragging.current && !focusId) setYaw(localYaw);
      if (!isDragging.current && !focusId) setPitch(localPitch);
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [nodes, nodeById, heatById, yaw, pitch, autoRotate, zoom, hoveredId, tooltip, focusId, onSelectAsset, stars]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { mx: (e.clientX - rect.left) * scaleX, my: (e.clientY - rect.top) * scaleY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    draggedThisPress.current = false;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging.current) {
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) draggedThisPress.current = true;
      setYaw((y) => y + deltaX * 0.007);
      setPitch((p) => Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, p + deltaY * 0.007)));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { mx, my } = getCanvasCoords(e);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(pitch);
    const sinX = Math.sin(pitch);
    const fov = 400;

    const projections = nodes.map((n) => {
      const x1 = n.x * cosY - n.z * sinY;
      const z1 = n.x * sinY + n.z * cosY;
      const y2 = n.y * cosX - z1 * sinX;
      const z2 = n.y * sinX + z1 * cosX;
      const scale = (fov / (fov + z2)) * zoom;
      return { n, sx: cx + x1 * scale, sy: cy + y2 * scale, scale };
    });

    let hitId: string | null = null;
    for (const p of projections) {
      const radius = Math.max(2, (p.n.kind === 'central' ? 14 : p.n.kind === 'ai_asset' ? 7 : 5.5) * p.scale);
      const dist = Math.sqrt((mx - p.sx) ** 2 + (my - p.sy) ** 2);
      if (dist < radius + 5) {
        hitId = p.n.id;
        break;
      }
    }

    canvas.style.cursor = hitId ? 'pointer' : 'grab';
    setHoveredId(hitId);

    if (hitId) {
      setTooltip(null);
      return;
    }

    // No node hit -- check edges for a relationship tooltip
    const projBySelfId: Record<string, (typeof projections)[number]> = {};
    projections.forEach((p) => (projBySelfId[p.n.id] = p));
    let hitEdge: Edge | null = null;
    for (const edge of ALL_EDGES) {
      const a = projBySelfId[edge.from];
      const b = projBySelfId[edge.to];
      if (!a || !b) continue;
      if (distToSegment(mx, my, a.sx, a.sy, b.sx, b.sy) < 5) {
        hitEdge = edge;
        break;
      }
    }

    if (hitEdge) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      setTooltip({
        x: (e.clientX - rect.left) / scaleX,
        y: (e.clientY - rect.top) / scaleX,
        text: hitEdge.label,
      });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleClick = () => {
    if (draggedThisPress.current) return;
    if (hoveredId) {
      wasAutoRotating.current = autoRotate;
      setAutoRotate(false);
      setFocusId(hoveredId);
    }
  };

  return (
    <div className="pro-card rounded-2xl p-5 border border-slate-800 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2 uppercase tracking-wide">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            AI Fleet Topology — 3D Map
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Agents, models, tools, target hosts, and databases orbiting the shared Vector Knowledge Base. Drag to
            orbit, click a node to fly to it, hover a line for what the connection means.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
              autoRotate
                ? 'bg-cyan-600/20 border-cyan-500/30 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto-Rotate: {autoRotate ? 'ON' : 'OFF'}
          </button>
          <div className="flex items-center rounded-lg border border-slate-800 overflow-hidden bg-slate-900">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold cursor-pointer"
            >
              -
            </button>
            <span className="px-2.5 text-slate-300 font-mono text-[10px]">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
              className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <canvas
          ref={canvasRef}
          width={900}
          height={520}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          className="w-full rounded-xl bg-slate-950 border border-slate-800 cursor-grab active:cursor-grabbing"
        />
        {tooltip && (
          <div
            className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-cyan-500/40 text-[10px] text-cyan-200 font-mono shadow-lg max-w-[220px] z-10"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            {tooltip.text}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono">
        {Object.entries(CATEGORY_COLOR).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-slate-400 capitalize">{cat.replace('_', ' ')}</span>
          </div>
        ))}
        {(['host', 'database', 'backend'] as const).map((kind) => (
          <div key={kind} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: INFRA_NODES.find((n) => n.kind === kind)?.color }} />
            <span className="text-slate-400">{KIND_LABEL[kind]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <span className="text-slate-400">Contained / Isolated</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-slate-400">Active in last 5 min (Execution Audit Log)</span>
        </div>
      </div>
    </div>
  );
}
