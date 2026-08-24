import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Power,
  ShieldCheck,
  Zap,
  Terminal,
  Activity,
  Server,
  Database,
  Cpu,
  Layers,
  ChevronRight,
  Sparkles,
  Bot,
  User,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Send,
  Lock,
  Search,
  Maximize2,
  RefreshCw,
  Sliders,
  Flame,
  ArrowUpRight,
  ShieldAlert,
  Play,
  RotateCcw
} from 'lucide-react';
import { AgentApproval } from './PendingApprovalsView';
import { AgentHistoryEntry } from './HistoricalActivityView';

interface SpatialFlightDeckProps {
  approvals: AgentApproval[];
  history: AgentHistoryEntry[];
  stats: any;
  isKillSwitchTriggered: boolean;
  onToggleKillSwitch: () => void;
  onApprove: (id: string, proposedCommands?: string[]) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onOpenChat: () => void;
  onNavigateTab: (tabId: string) => void;
  API_BASE: string;
}

interface InfraNode {
  id: string;
  name: string;
  type: 'k8s' | 'postgres' | 'linux' | 'gateway';
  status: 'healthy' | 'warning' | 'critical' | 'remediating';
  ip: string;
  x: number;
  y: number;
  z: number;
  incidentId?: string;
  incidentTitle?: string;
  cpu: number;
  memory: number;
  activeAgent?: string;
  connections: string[];
}

export function SpatialFlightDeck({
  approvals,
  history,
  stats,
  isKillSwitchTriggered,
  onToggleKillSwitch,
  onApprove,
  onReject,
  onOpenChat,
  onNavigateTab,
  API_BASE,
}: SpatialFlightDeckProps) {
  // ── Infrastructure Nodes State ──
  const [nodes, setNodes] = useState<InfraNode[]>([
    {
      id: 'k8s-control-plane',
      name: 'k8s-controlplane-01',
      type: 'k8s',
      status: 'healthy',
      ip: '10.240.0.10',
      x: -160,
      y: 80,
      z: 0,
      cpu: 34,
      memory: 58,
      connections: ['k8s-worker-01', 'k8s-worker-02', 'pg-primary']
    },
    {
      id: 'k8s-worker-01',
      name: 'WorkerNode1HL',
      type: 'k8s',
      status: 'warning',
      ip: '10.240.0.11',
      x: 140,
      y: 110,
      z: 40,
      incidentId: 'INC8127335',
      incidentTitle: 'Restricted Sudoers Provisioning & Memory Spike',
      cpu: 89,
      memory: 92,
      activeAgent: 'Nemotron-3.5 Auto-Resolver',
      connections: ['k8s-control-plane', 'pg-primary', 'linux-bastion']
    },
    {
      id: 'k8s-worker-02',
      name: 'WorkerNode2HL',
      type: 'k8s',
      status: 'healthy',
      ip: '10.240.0.12',
      x: -60,
      y: -70,
      z: -30,
      cpu: 42,
      memory: 61,
      connections: ['k8s-control-plane', 'linux-app-01']
    },
    {
      id: 'pg-primary',
      name: 'PostgreSQL-Primary',
      type: 'postgres',
      status: 'remediating',
      ip: '10.240.1.20',
      x: 30,
      y: -20,
      z: 60,
      incidentId: 'INC8127330',
      incidentTitle: 'Etcd Cluster Disk Defrag & Vacuum Lock',
      cpu: 76,
      memory: 84,
      activeAgent: 'Llama-3.3 SRE Agent',
      connections: ['k8s-control-plane', 'k8s-worker-01', 'linux-db2']
    },
    {
      id: 'linux-bastion',
      name: 'Linux-Bastion-Host',
      type: 'linux',
      status: 'healthy',
      ip: '10.240.2.5',
      x: 180,
      y: -90,
      z: -20,
      cpu: 18,
      memory: 32,
      connections: ['k8s-worker-01', 'linux-app-01']
    },
    {
      id: 'linux-app-01',
      name: 'NexaCore-AppSvc',
      type: 'linux',
      status: 'healthy',
      ip: '10.240.2.14',
      x: -180,
      y: -110,
      z: 50,
      cpu: 28,
      memory: 46,
      connections: ['k8s-worker-02', 'linux-bastion']
    },
    {
      id: 'linux-db2',
      name: 'IBM-DB2-Host',
      type: 'linux',
      status: 'healthy',
      ip: '10.240.1.45',
      x: -20,
      y: 130,
      z: -50,
      cpu: 45,
      memory: 68,
      connections: ['pg-primary']
    }
  ]);

  const [selectedNode, setSelectedNode] = useState<InfraNode | null>(nodes[1]);
  const [omnibarPrompt, setOmnibarPrompt] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    '# Real-time streaming in-guest verification',
    '$ systemctl status nexacore.service --no-pager',
    '● nexacore.service - NexaCore Microservices Gateway',
    '   Loaded: loaded (/etc/systemd/system/nexacore.service; enabled)',
    '   Active: active (running) since Sun 2026-08-23 18:30:12 UTC; 14s ago',
    '   Main PID: 184920 (node)',
    '   Tasks: 22 (limit: 4915)',
    '   Memory: 142.4M',
    '   CGroup: /system.slice/nexacore.service',
    '',
    '$ ss -tulpn | grep 3000',
    'tcp   LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=184920,fd=19))',
    '',
    '[PROV-VERIFIED] In-guest cryptographic verification confirmed socket listening on :3000',
    '[AGENT-EXIT] Execution completed successfully with exit code 0.'
  ]);

  const [rotationAngle, setRotationAngle] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── 3D Canvas Projection & Animation Loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let angle = rotationAngle;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const render = () => {
      if (isAutoRotating) {
        angle += 0.003;
        setRotationAngle(angle);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const fov = 400;

      // Draw cyber grid background planes
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.06)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = -280; x <= 280; x += gridSize) {
        ctx.beginPath();
        const rad = angle * 0.4;
        const p1x = x * Math.cos(rad) - (-200) * Math.sin(rad);
        const p1z = x * Math.sin(rad) + (-200) * Math.cos(rad) + 400;
        const p2x = x * Math.cos(rad) - 200 * Math.sin(rad);
        const p2z = x * Math.sin(rad) + 200 * Math.cos(rad) + 400;

        const s1x = centerX + (p1x * fov) / p1z;
        const s1y = centerY + (160 * fov) / p1z;
        const s2x = centerX + (p2x * fov) / p2z;
        const s2y = centerY + (160 * fov) / p2z;

        ctx.moveTo(s1x, s1y);
        ctx.lineTo(s2x, s2y);
        ctx.stroke();
      }

      // Project 3D node positions
      const projectedNodes = nodes.map((node) => {
        const rad = angle;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const rx = node.x * cos - node.z * sin;
        const rz = node.x * sin + node.z * cos + 450;
        const ry = node.y;

        const scale = fov / rz;
        const screenX = centerX + rx * scale;
        const screenY = centerY + ry * scale;

        return {
          ...node,
          screenX,
          screenY,
          scale,
          depth: rz
        };
      });

      projectedNodes.sort((a, b) => b.depth - a.depth);

      // Draw Connections (Glowing Conduit lines)
      ctx.lineWidth = 1.5;
      projectedNodes.forEach((node) => {
        node.connections.forEach((targetId) => {
          const target = projectedNodes.find((n) => n.id === targetId);
          if (target) {
            const grad = ctx.createLinearGradient(
              node.screenX,
              node.screenY,
              target.screenX,
              target.screenY
            );
            if (node.status === 'warning' || target.status === 'warning') {
              grad.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
              grad.addColorStop(1, 'rgba(6, 182, 212, 0.2)');
            } else if (node.status === 'remediating' || target.status === 'remediating') {
              grad.addColorStop(0, 'rgba(16, 185, 129, 0.5)');
              grad.addColorStop(1, 'rgba(99, 102, 241, 0.3)');
            } else {
              grad.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
              grad.addColorStop(1, 'rgba(16, 185, 129, 0.15)');
            }

            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(node.screenX, node.screenY);
            ctx.lineTo(target.screenX, target.screenY);
            ctx.stroke();

            // Traveling data packet particle
            const packetT = (Date.now() % 2000) / 2000;
            const px = node.screenX + (target.screenX - node.screenX) * packetT;
            const py = node.screenY + (target.screenY - node.screenY) * packetT;
            ctx.fillStyle = '#06B6D4';
            ctx.beginPath();
            ctx.arc(px, py, 2.5 * node.scale, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      });

      // Draw Holographic Nodes
      projectedNodes.forEach((node) => {
        const isSelected = selectedNode?.id === node.id;
        const radius = (isSelected ? 26 : 20) * node.scale;

        // Incident Shockwave Rings
        if (node.status === 'warning' || node.status === 'remediating') {
          const pulse = (Date.now() % 1500) / 1500;
          const pulseRadius = radius + pulse * 32 * node.scale;
          ctx.strokeStyle =
            node.status === 'warning'
              ? `rgba(245, 158, 11, ${1 - pulse})`
              : `rgba(16, 185, 129, ${1 - pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, pulseRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Ambient Node Glow
        const glowGrad = ctx.createRadialGradient(
          node.screenX,
          node.screenY,
          2,
          node.screenX,
          node.screenY,
          radius * 2
        );

        if (node.status === 'warning') {
          glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.8)');
          glowGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
        } else if (node.status === 'remediating') {
          glowGrad.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
          glowGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
        } else {
          glowGrad.addColorStop(0, 'rgba(6, 182, 212, 0.8)');
          glowGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
        }

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Node Body Disc
        ctx.fillStyle = isSelected ? '#0F172A' : '#0B0F17';
        ctx.strokeStyle =
          node.status === 'warning'
            ? '#F59E0B'
            : node.status === 'remediating'
            ? '#10B981'
            : '#06B6D4';
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Node Label
        ctx.font = `${Math.max(10, Math.round(11 * node.scale))}px 'Plus Jakarta Sans', sans-serif`;
        ctx.fillStyle = isSelected ? '#38BDF8' : '#F8FAFC';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.screenX, node.screenY + radius + 15 * node.scale);

        // IP / Subtitle
        ctx.font = `${Math.max(8, Math.round(9 * node.scale))}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(node.ip, node.screenX, node.screenY + radius + 27 * node.scale);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [nodes, selectedNode, isAutoRotating, rotationAngle]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const fov = 400;

    for (const node of nodes) {
      const rad = rotationAngle;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const rx = node.x * cos - node.z * sin;
      const rz = node.x * sin + node.z * cos + 450;
      const ry = node.y;

      const scale = fov / rz;
      const screenX = centerX + rx * scale;
      const screenY = centerY + ry * scale;
      const radius = 30 * scale;

      const dist = Math.hypot(clickX - screenX, clickY - screenY);
      if (dist <= radius) {
        setSelectedNode(node);
        break;
      }
    }
  };

  const handleOmnibarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!omnibarPrompt.trim()) return;
    onOpenChat();
  };

  return (
    <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-[#030712] select-none">
      
      {/* ── TOP ORBITAL TELEMETRY BAR ── */}
      <header className="relative z-20 mx-6 mt-4 p-3.5 rounded-2xl bg-slate-900/80 backdrop-blur-2xl border border-slate-800/80 shadow-2xl flex items-center justify-between gap-4">
        
        {/* Brand & Mode Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-emerald-400 p-[1.5px] flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-black tracking-widest text-white uppercase font-mono">
                AUTONOMOUS SRE FLIGHT CONTROL
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                DIGITAL TWIN LIVE
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Interactive 3D Topology Mesh • Multi-Agent ReAct Telemetry
            </p>
          </div>
        </div>

        {/* Center Orbital Kill Switch & Tickers */}
        <div className="flex items-center gap-4">
          
          {/* Master Kill Switch Ring */}
          <button
            onClick={onToggleKillSwitch}
            className={`flex items-center gap-2.5 px-4 py-1.5 rounded-xl border transition-all duration-300 cursor-pointer shadow-lg ${
              isKillSwitchTriggered
                ? 'bg-rose-950/80 border-rose-500 text-rose-300 shadow-rose-600/30 animate-pulse'
                : 'bg-slate-950/90 border-emerald-500/40 text-emerald-300 hover:border-emerald-400 shadow-emerald-500/10'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                isKillSwitchTriggered ? 'border-rose-400 bg-rose-500' : 'border-emerald-400 bg-emerald-500'
              }`}
            >
              <Power className="w-2 h-2 text-slate-950" />
            </div>
            <div className="text-left">
              <div className="text-[9px] font-mono uppercase text-slate-400 font-bold">
                MASTER KILL SWITCH
              </div>
              <div className="text-[11px] font-bold font-mono">
                {isKillSwitchTriggered ? 'CONTAINMENT ACTIVE' : 'ARMED & ENFORCED'}
              </div>
            </div>
          </button>

          {/* Real-time MTTR Ticker */}
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-[9px] font-mono text-slate-400 uppercase font-bold">Real-Time MTTR</div>
              <div className="text-xs font-black text-cyan-400 font-mono">14.8s</div>
            </div>
          </div>

          {/* Auto-Resolution Rate Gauge */}
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[9px] font-mono text-slate-400 uppercase font-bold">Auto-Resolution</div>
              <div className="text-xs font-black text-emerald-400 font-mono">95.2%</div>
            </div>
          </div>
        </div>

        {/* Operator Badge & Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white font-mono">
              V
            </div>
            <div className="text-left">
              <div className="text-[10px] font-bold text-white leading-tight">Venu</div>
              <div className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Global SRE Lead
              </div>
            </div>
          </div>

          {/* 3D Rotation Toggle */}
          <button
            onClick={() => setIsAutoRotating(!isAutoRotating)}
            className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
              isAutoRotating
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title={isAutoRotating ? 'Pause 3D Rotation' : 'Resume 3D Auto-Rotation'}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── 3D CANVAS VIEWPORT (CENTER) ── */}
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />
      </div>

      {/* ── MAIN SPATIAL HUD OVERLAYS (LEFT & RIGHT DECKS) ── */}
      <div className="relative z-10 flex-1 px-6 py-4 flex items-stretch justify-between pointer-events-none gap-6">
        
        {/* LEFT SPATIAL PANEL: Multi-Agent Neural Reasoning Stream */}
        <div className="w-[360px] pointer-events-auto flex flex-col gap-3">
          
          <div className="p-4 rounded-2xl bg-slate-900/85 backdrop-blur-2xl border border-slate-800/80 shadow-2xl space-y-3.5">
            
            {/* Panel Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-xs font-black tracking-wider text-white font-mono uppercase">
                  Multi-Agent Reasoning Stream
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Live Trace
              </span>
            </div>

            {/* Neural Decision Tree */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-slate-400 font-bold uppercase">
                Active Agent Decision Tree
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    Priority & Domain Classifier
                  </span>
                  <span className="font-mono text-emerald-400 text-[11px]">98.4% conf</span>
                </div>
                <div className="text-[11px] text-slate-400 pl-3.5 border-l-2 border-slate-800">
                  Grounding against 1,187+ tickets in itsm_db: Classified as <strong>UNIX / Linux Ops</strong>.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span className="flex items-center gap-1.5 text-indigo-300">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    ChromaDB Vector RAG Match
                  </span>
                  <span className="font-mono text-indigo-400 text-[11px]">96.1% match</span>
                </div>
                <div className="text-[11px] text-slate-400 pl-3.5 border-l-2 border-slate-800">
                  SOP Runbook: <strong className="text-cyan-300">KB0000039</strong> (Systemd Daemon Reload & Port Recovery).
                </div>
              </div>
            </div>

            {/* ReAct Step Progression Tracker */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>ReAct Step Progression</span>
                <span className="text-cyan-400 font-bold">Step 3 of 8</span>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full w-[45%]" />
              </div>
              <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{'Diagnostic → Parameterize → SSH Execute'}</span>
              </div>
            </div>

            {/* Active SOP Runbook Chip */}
            <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold">
                  KB0000039
                </span>
                <span className="text-[11px] text-slate-300 font-medium truncate max-w-[170px]">
                  Linux App Restart & Verification
                </span>
              </div>
              <button
                onClick={() => onNavigateTab('vector')}
                className="text-[10px] text-cyan-400 hover:text-white flex items-center gap-0.5 cursor-pointer font-bold"
              >
                <span>3D Vector</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

          </div>

          {/* Node Inspector Card (When Selected) */}
          {selectedNode && (
            <div className="p-3.5 rounded-2xl bg-slate-900/85 backdrop-blur-2xl border border-slate-800/80 shadow-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-bold text-white font-mono">{selectedNode.name}</span>
                </div>
                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold ${
                    selectedNode.status === 'warning'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : selectedNode.status === 'remediating'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  }`}
                >
                  {selectedNode.status}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-slate-400">CPU Load:</span> <span className="text-white font-bold">{selectedNode.cpu}%</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-slate-400">RAM:</span> <span className="text-white font-bold">{selectedNode.memory}%</span>
                </div>
              </div>

              {selectedNode.incidentTitle && (
                <div className="text-[10px] text-amber-300 font-medium pt-1 border-t border-slate-800 truncate">
                  ⚡ {selectedNode.incidentTitle}
                </div>
              )}
            </div>
          )}

        </div>

        {/* RIGHT SPATIAL PANEL: In-Guest Live Execution & Terminal HUD */}
        <div className="w-[420px] pointer-events-auto flex flex-col gap-3">
          
          <div className="p-4 rounded-2xl bg-slate-900/85 backdrop-blur-2xl border border-slate-800/80 shadow-2xl flex-1 flex flex-col justify-between space-y-3">
            
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-black tracking-wider text-white font-mono uppercase">
                  In-Guest Execution & Terminal HUD
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] font-mono text-emerald-400 font-bold">SSH TTY STREAM</span>
              </div>
            </div>

            {/* Phosphor-Green Monospace Terminal Window */}
            <div className="flex-1 min-h-[220px] max-h-[280px] p-3 rounded-xl bg-slate-950 border border-slate-800/90 font-mono text-[11px] text-emerald-400 overflow-y-auto leading-relaxed scrollbar-thin">
              {terminalOutput.map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.startsWith('$')
                      ? 'text-cyan-300 font-bold'
                      : line.startsWith('[PROV')
                      ? 'text-emerald-300 font-bold bg-emerald-950/30 p-1 rounded my-1 border border-emerald-500/30'
                      : line.startsWith('[AGENT')
                      ? 'text-indigo-300 font-bold'
                      : line.startsWith('#')
                      ? 'text-slate-500'
                      : 'text-slate-300'
                  }
                >
                  {line}
                </div>
              ))}
            </div>

            {/* Cryptographic Proof Badge */}
            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-[11px] font-bold text-white font-mono">
                    Automated In-Guest Proof Verified
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono">
                    Socket :3000 Active • Exit Code 0
                  </div>
                </div>
              </div>
              <button
                onClick={() => onNavigateTab('history')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold transition cursor-pointer"
              >
                Audit Log
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* ── BOTTOM AUTONOMOUS OMNIBAR & ACTION DECK ── */}
      <footer className="relative z-20 mx-6 mb-4 p-3.5 rounded-2xl bg-slate-900/85 backdrop-blur-2xl border border-slate-800/80 shadow-2xl flex items-center justify-between gap-4">
        
        {/* AI Copilot Prompt Omnibar */}
        <form onSubmit={handleOmnibarSubmit} className="flex-1 flex items-center gap-2.5">
          <div className="relative flex-1 flex items-center">
            <Sparkles className="w-4 h-4 text-cyan-400 absolute left-3.5 pointer-events-none animate-pulse" />
            <input
              type="text"
              value={omnibarPrompt}
              onChange={(e) => setOmnibarPrompt(e.target.value)}
              placeholder="Ask SRE Copilot (e.g., 'Simulate failover on WorkerNode1HL' or 'Run diagnostics on Postgres')..."
              className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-500 rounded-xl pl-10 pr-24 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition font-sans"
            />
            <button
              type="submit"
              className="absolute right-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-[10px] font-bold text-white font-mono transition flex items-center gap-1 cursor-pointer shadow-md shadow-cyan-500/20"
            >
              <span>DISPATCH</span>
              <Send className="w-2.5 h-2.5" />
            </button>
          </div>
        </form>

        {/* Quick HITL Human-In-The-Loop Action Triggers */}
        <div className="flex items-center gap-2.5">
          
          {approvals.length > 0 ? (
            <button
              onClick={() => onNavigateTab('approvals')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold font-mono transition cursor-pointer animate-pulse"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>{approvals.length} PENDING APPROVALS</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigateTab('approvals')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold font-mono transition cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>HITL GATE: 0 BLOCKED</span>
            </button>
          )}

          {/* Quick Matrix Switcher Button */}
          <button
            onClick={() => onNavigateTab('overview')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer font-mono"
            title="Switch to Enterprise Matrix Grid View"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>MATRIX VIEW</span>
          </button>

          {/* Draggable Chat Assistant Trigger */}
          <button
            onClick={onOpenChat}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-xs font-black text-slate-950 transition cursor-pointer shadow-lg shadow-cyan-500/30"
          >
            <Bot className="w-4 h-4" />
            <span>SRE ASSISTANT</span>
          </button>

        </div>

      </footer>

    </div>
  );
}
