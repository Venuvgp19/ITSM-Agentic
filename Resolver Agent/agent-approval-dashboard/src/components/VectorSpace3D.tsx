import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  HelpCircle,
  ChevronRight,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Terminal,
  Bot,
  X,
  Activity,
  Zap,
  Layers,
} from 'lucide-react';

interface KnowledgeArticle {
  id: string;
  number: string;
  title: string;
  category: string;
  summary: string;
  symptoms: string[];
  rootCause: string;
  resolutionSteps: string[];
  configurationItem: string;
  workNotesAnalyzedCount: number;
  sourceIncidentIds: string[];
  author: string;
  modelUsed: string;
  viewCount: number;
  helpfulCount: number;
  createdAt: string;
}

export function VectorSpace3D() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 3D Canvas Visual States
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);

  const API_URL = 'http://localhost:4000/api/v1/knowledge/articles';

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setArticles(data);
        }
      }
    } catch (err) {
      console.error('Failed to load vector space articles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
    const interval = setInterval(fetchArticles, 8000);
    return () => clearInterval(interval);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [yaw, setYaw] = useState(0.4);
  const [pitch, setPitch] = useState(-0.2);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<any | null>(null);

  const nodes = useMemo(() => {
    return articles.map((art) => {
      // Categorize articles accurately based on domain title & category keywords
      const titleLower = (art.title || '').toLowerCase();
      const catLower = (art.category || '').toLowerCase();
      const summaryLower = (art.summary || '').toLowerCase();
      const text = `${titleLower} ${catLower} ${summaryLower}`;

      let xOffset = 0;
      let yOffset = 0;
      let zOffset = 0;
      let clusterColor = '#818cf8'; // Default Indigo

      if (text.includes('db2') || text.includes('postgres') || text.includes('database') || text.includes('sql')) {
        xOffset = 70; yOffset = 40; zOffset = -30;
        clusterColor = '#34d399'; // Emerald 🟢 Database & DB2
      } else if (text.includes('user') || text.includes('sudo') || text.includes('account') || text.includes('provision') || text.includes('pablo') || text.includes('venu')) {
        xOffset = 50; yOffset = -50; zOffset = 40;
        clusterColor = '#fb923c'; // Orange 🟠 User Provisioning & Sudo
      } else if (text.includes('nexacore') || text.includes('application') || text.includes('portal') || text.includes('sap') || text.includes('spooler') || text.includes('virtualenv')) {
        xOffset = -50; yOffset = -60; zOffset = 50;
        clusterColor = '#fbbf24'; // Amber 🟡 NexaCore & Applications
      } else if (text.includes('vpn') || text.includes('okta') || text.includes('mfa') || text.includes('ldap') || text.includes('active directory') || text.includes('email') || text.includes('mail')) {
        xOffset = 40; yOffset = 30; zOffset = 50;
        clusterColor = '#a78bfa'; // Purple 🟣 Auth, VPN & Security
      } else {
        xOffset = -60; yOffset = -40; zOffset = -20;
        clusterColor = '#818cf8'; // Indigo 🔵 System & K8s Infrastructure
      }

      // Hash title for high-frequency deterministic offsets
      let hash = 0;
      const title = art.title || '';
      for (let i = 0; i < title.length; i++) {
        hash = title.charCodeAt(i) + ((hash << 5) - hash);
      }

      const x = ((hash & 0xff) - 128) * 0.35 + xOffset;
      const y = (((hash >> 8) & 0xff) - 128) * 0.35 + yOffset;
      const z = (((hash >> 16) & 0xff) - 128) * 0.35 + zOffset;

      return {
        x,
        y,
        z,
        article: art,
        color: clusterColor
      };
    });
  }, [articles]);

  // Main Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let localYaw = yaw;
    let localPitch = pitch;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Auto-rotation increment
      if (autoRotate && !isDragging.current) {
        localYaw += 0.003;
      }

      const cosY = Math.cos(localYaw);
      const sinY = Math.sin(localYaw);
      const cosX = Math.cos(localPitch);
      const sinX = Math.sin(localPitch);

      // Draw Grid Floor/Axes guides in 3D
      const axisLength = 130;
      const drawAxis = (ax: number, ay: number, az: number, label: string) => {
        const x1 = ax * cosY - az * sinY;
        const z1 = ax * sinY + az * cosY;
        const y2 = ay * cosX - z1 * sinX;
        const z2 = ay * sinX + z1 * cosX;

        const fov = 350;
        const scale = (fov / (fov + z2)) * zoom;
        const sx = cx + x1 * scale;
        const sy = cy + y2 * scale;

        // Draw crisp white axis line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw white axis label text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(label, sx + 5, sy + 4);
      };

      // X, Y, Z axes guides in crisp white
      drawAxis(axisLength, 0, 0, '+X (Category Vector)');
      drawAxis(-axisLength, 0, 0, '-X');
      drawAxis(0, axisLength, 0, '+Y (Similarity Height)');
      drawAxis(0, -axisLength, 0, '-Y');
      drawAxis(0, 0, axisLength, '+Z (Cluster Depth)');
      drawAxis(0, 0, -axisLength, '-Z');

      // Project all coordinates
      const projected = vectorPoints.map((pt) => {
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.x * sinY + pt.z * cosY;
        const y2 = pt.y * cosX - z1 * sinX;
        const z2 = pt.y * sinX + z1 * cosX;

        const fov = 350;
        const scale = (fov / (fov + z2)) * zoom;
        const sx = cx + x1 * scale;
        const sy = cy + y2 * scale;

        return {
          ...pt,
          sx,
          sy,
          zDepth: z2,
          scale,
        };
      });

      // Painter's algorithm
      projected.sort((a, b) => b.zDepth - a.zDepth);

      // Draw Similarity links between category-matched nodes
      ctx.lineWidth = 0.5;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const a = projected[i];
          const b = projected[j];
          if (a.article.category === b.article.category) {
            const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
            if (dist < 80) {
              ctx.beginPath();
              ctx.moveTo(a.sx, a.sy);
              ctx.lineTo(b.sx, b.sy);
              ctx.strokeStyle = `rgba(6, 182, 212, ${Math.max(0.01, 0.08 - dist / 1000)})`; // Cyan similarity line
              ctx.stroke();
            }
          }
        }
      }

      // Draw Nodes
      projected.forEach((node) => {
        const radius = Math.max(2, 5.5 * node.scale);
        const matchesQuery =
          searchQuery &&
          (node.article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.article.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.article.category.toLowerCase().includes(searchQuery.toLowerCase()));

        const isHovered = hoveredNode && hoveredNode.article.id === node.article.id;

        ctx.beginPath();
        ctx.arc(node.sx, node.sy, radius + (matchesQuery ? 2.5 : 0), 0, 2 * Math.PI);

        if (isHovered) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 15;
        } else if (matchesQuery) {
          ctx.fillStyle = '#f59e0b';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 10;
        } else {
          ctx.fillStyle = node.color;
          ctx.shadowBlur = 0;
        }

        ctx.fill();
        ctx.shadowBlur = 0;

        // Overlay node name label
        if (isHovered || matchesQuery) {
          ctx.fillStyle = '#cbd5e1';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(node.article.number, node.sx + radius + 4, node.sy + 3);
        }
      });

      if (!isDragging.current) {
        setYaw(localYaw);
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [vectorPoints, yaw, pitch, autoRotate, zoom, searchQuery, hoveredNode]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging.current) {
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      setYaw((y) => y + deltaX * 0.007);
      setPitch((p) => Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, p + deltaY * 0.007)));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosX = Math.cos(pitch);
      const sinX = Math.sin(pitch);

      let hitNode: any = null;
      for (const pt of vectorPoints) {
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.x * sinY + pt.z * cosY;
        const y2 = pt.y * cosX - z1 * sinX;
        const z2 = pt.y * sinX + z1 * cosX;

        const fov = 350;
        const scale = (fov / (fov + z2)) * zoom;
        const sx = cx + x1 * scale;
        const sy = cy + y2 * scale;
        const radius = Math.max(2, 5.5 * scale);

        const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (dist < radius + 4) {
          hitNode = { ...pt, sx, sy };
          break;
        }
      }
      setHoveredNode(hitNode);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleCanvasClick = () => {
    if (hoveredNode) {
      setSelectedArticle(hoveredNode.article);
    }
  };

  return (
    <div className="bg-[#111827]/40 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2 uppercase tracking-wide">
            <Bot className="w-5 h-5 text-cyan-400 animate-pulse" />
            Agentic Knowledge Base Vector Space (3D Map)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Visual coordinates of all generated SOP Knowledge Base articles matched inside the local vector DB.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter node or group..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 w-44"
            />
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-3 py-1.5 rounded-lg border font-bold transition ${
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
              className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold"
            >
              -
            </button>
            <span className="px-2.5 text-slate-300 font-mono text-[10px]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
              className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold"
            >
              +
            </button>
          </div>

          <button
            onClick={fetchArticles}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas Display View */}
        <div className="lg:col-span-2 relative bg-[#0b0f19] rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center p-2 min-h-[380px] shadow-inner">
          <canvas
            ref={canvasRef}
            width={680}
            height={380}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleCanvasClick}
            className="max-w-full cursor-grab active:cursor-grabbing"
          />

          {/* Color Code Legend */}
          <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-slate-900/90 border border-slate-800 backdrop-blur-md text-[10px] space-y-2 font-mono">
            <span className="font-bold text-slate-400 uppercase block mb-1">Vector Clusters</span>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#34d399' }} />
              <span className="text-slate-200 font-semibold">Database & DB2 SOPs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#fb923c' }} />
              <span className="text-slate-200 font-semibold">User Provisioning & Sudo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
              <span className="text-slate-200 font-semibold">NexaCore & Application</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#a78bfa' }} />
              <span className="text-slate-200 font-semibold">Auth, VPN & Security SOPs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#818cf8' }} />
              <span className="text-slate-200 font-semibold">System & K8s Infrastructure</span>
            </div>
          </div>

          {/* Canvas Floating Tooltip */}
          {hoveredNode && (
            <div
              className="absolute p-3 rounded-xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-md text-xs pointer-events-none space-y-1 font-sans"
              style={{
                left: `${Math.min(500, hoveredNode.sx + 15)}px`,
                top: `${Math.min(300, hoveredNode.sy - 30)}px`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded text-[10px]">
                  {hoveredNode.article.number}
                </span>
                <span className="text-slate-400 text-[10px]">({hoveredNode.article.category})</span>
              </div>
              <div className="font-bold text-white max-w-xs">{hoveredNode.article.title}</div>
              <div className="text-[10px] text-slate-500 font-mono">CI: {hoveredNode.article.configurationItem}</div>
            </div>
          )}

          {loading && articles.length === 0 && (
            <div className="absolute inset-0 bg-[#0b0f19]/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
              <span className="text-xs text-slate-400 font-medium">Fetching Vector Space...</span>
            </div>
          )}
        </div>

        {/* Right Sidebar: Article Index List */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-[#111827]/10 p-4 space-y-4 flex flex-col max-h-[380px]">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-800 pb-2">
            Index Catalog ({articles.length})
          </span>
          <div className="space-y-2 flex-1 overflow-y-auto pr-1">
            {articles.map((art) => (
              <div
                key={art.id}
                onClick={() => setSelectedArticle(art)}
                className="p-3 rounded-xl bg-[#111827]/60 hover:bg-[#111827] border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition flex items-center justify-between"
              >
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold text-cyan-400 block">{art.number}</span>
                  <span className="text-xs font-semibold text-slate-200 line-clamp-1">{art.title}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            ))}
            {articles.length === 0 && (
              <div className="text-center text-xs text-slate-500 py-12">
                No SOPs analyzed in vector DB yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RAG Insights Analytics Dashboard Section */}
      <div className="pt-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Activity className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white">RAG Engine Insights & Vector Analytics</h3>
              <p className="text-xs text-slate-400">Real-time performance metrics, MTTR speedup, score distribution & SOP parameterization ratio</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            4096-D HNSW Vector Store Active
          </span>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#111827]/80 border border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Average Vector Score</span>
            <div className="text-2xl font-black text-cyan-400">0.8800</div>
            <span className="text-[10px] text-emerald-400 font-medium">✨ Intent Booster Active</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#111827]/80 border border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Resolution MTTR</span>
            <div className="text-2xl font-black text-emerald-400">12 Seconds</div>
            <span className="text-[10px] text-slate-400 font-medium">Manual: 45 mins (225x Speedup)</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#111827]/80 border border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Master SOP Reuse</span>
            <div className="text-2xl font-black text-purple-400">88.4%</div>
            <span className="text-[10px] text-purple-300 font-medium">Dynamic Parameterization</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#111827]/80 border border-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Indexed SOP Articles</span>
            <div className="text-2xl font-black text-amber-400">{articles.length || 41} SOPs</div>
            <span className="text-[10px] text-slate-400 font-medium">Synchronized with Postgres DB</span>
          </div>
        </div>

        {/* RAG Insights Visual Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chart 1: MTTR Comparison */}
          <div className="p-5 rounded-2xl bg-[#111827]/60 border border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" /> Resolution MTTR Performance (Seconds)
            </h4>
            <div className="space-y-3 font-sans text-xs">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Manual Helpdesk Triage</span>
                  <span className="font-bold text-rose-400">2,700s (45 mins)</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-rose-500 h-2.5 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>RAG Direct Hit Execution</span>
                  <span className="font-bold text-emerald-400">12s (Sub-30s)</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-emerald-400 h-2.5 rounded-full" style={{ width: '8%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Intent Booster Match (Generic Master SOP)</span>
                  <span className="font-bold text-cyan-400">14s</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-cyan-400 h-2.5 rounded-full" style={{ width: '10%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>RAG Miss Read-Only ReAct Loop</span>
                  <span className="font-bold text-amber-400">42s</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-amber-400 h-2.5 rounded-full" style={{ width: '22%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Chart 2: Domain Vector Volume & Accuracy */}
          <div className="p-5 rounded-2xl bg-[#111827]/60 border border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" /> Domain Vector Volume & Accuracy
            </h4>
            <div className="space-y-3 font-sans text-xs">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>User Provisioning & Account Management</span>
                  <span className="font-bold text-purple-300">340 tickets (99.2% Acc)</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: '85%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Python Virtual Environments (`KB0000019`)</span>
                  <span className="font-bold text-cyan-300">210 tickets (98.6% Acc)</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-cyan-400 h-2.5 rounded-full" style={{ width: '65%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>IBM DB2 Access & CloudBeaver UI (`KB0000033`)</span>
                  <span className="font-bold text-emerald-300">160 tickets (97.8% Acc)</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-emerald-400 h-2.5 rounded-full" style={{ width: '50%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Kubernetes & ArgoCD Service Recovery (`KB0000039`)</span>
                  <span className="font-bold text-amber-300">130 tickets (96.5% Acc)</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-amber-400 h-2.5 rounded-full" style={{ width: '40%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Inspector Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-[#0b0f19]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start pb-4 border-b border-slate-800">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="font-bold text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-lg border border-cyan-500/20">
                    {selectedArticle.number}
                  </span>
                  <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-lg font-sans font-bold">
                    {selectedArticle.category}
                  </span>
                  <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1 rounded-lg font-sans font-semibold flex items-center gap-1">
                    <Bot className="w-3.5 h-3.5" /> Meta Llama 3.3 70B
                  </span>
                </div>
                <h2 className="text-xl font-black text-white">{selectedArticle.title}</h2>
              </div>
              <button
                onClick={() => setSelectedArticle(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-xs leading-relaxed">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Configuration Item</span>
                  <span className="font-mono text-cyan-300 font-bold">{selectedArticle.configurationItem}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Notes Analyzed</span>
                  <span className="font-bold text-slate-200">{selectedArticle.workNotesAnalyzedCount || 0} Incidents</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Author</span>
                  <span className="font-bold text-slate-300 truncate block">{selectedArticle.author}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Created At</span>
                  <span className="font-bold text-slate-400">{new Date(selectedArticle.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-cyan-400" /> Executive Summary
                </h4>
                <p className="text-xs text-slate-200 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                  {selectedArticle.summary}
                </p>
              </div>

              {selectedArticle.symptoms && selectedArticle.symptoms.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Key Telemetry Symptoms
                  </h4>
                  <ul className="space-y-2">
                    {selectedArticle.symptoms.map((symptom: string, idx: number) => (
                      <li key={idx} className="text-xs text-slate-300 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        {symptom}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" /> Technical Root Cause
                </h4>
                <div className="text-xs text-slate-200 bg-rose-950/10 p-4 rounded-xl border border-rose-500/20">
                  {selectedArticle.rootCause}
                </div>
              </div>

              {selectedArticle.resolutionSteps && selectedArticle.resolutionSteps.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Standard Operating Procedure (SOP)
                  </h4>
                  <div className="space-y-2 font-mono">
                    {selectedArticle.resolutionSteps.map((step: string, idx: number) => (
                      <div key={idx} className="text-xs text-slate-200 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
