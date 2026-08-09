'use client';

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Sparkles,
  Eye,
  ThumbsUp,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Bot,
  RefreshCw,
  X,
  Layers,
  ArrowRight,
  ShieldAlert,
  Terminal,
  Zap,
  Activity,
  Pencil,
  Save,
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
  keywords: string[];
  configurationItem: string;
  workNotesAnalyzedCount: number;
  sourceIncidentIds: string[];
  author: string;
  modelUsed: string;
  viewCount: number;
  helpfulCount: number;
  createdAt: string;
}

interface WorkerStatus {
  totalIncidentsCount: number;
  analyzedIncidentCount: number;
  percentageAnalyzed: number;
  publishedArticlesCount: number;
  isWorkerRunning: boolean;
  modelUsed: string;
}

export default function KnowledgePage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [genSuccessMessage, setGenSuccessMessage] = useState<string | null>(null);

  // Edit Article Form State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    category: '',
    configurationItem: '',
    summary: '',
    rootCause: '',
    symptoms: '',
    resolutionSteps: '',
  });

  const API_BASE = 'http://localhost:4000/api/v1';

  const startEditing = (article: KnowledgeArticle) => {
    setEditForm({
      title: article.title || '',
      category: article.category || '',
      configurationItem: article.configurationItem || '',
      summary: article.summary || '',
      rootCause: article.rootCause || '',
      symptoms: Array.isArray(article.symptoms) ? article.symptoms.join('\n') : '',
      resolutionSteps: Array.isArray(article.resolutionSteps) ? article.resolutionSteps.join('\n') : '',
    });
    setIsEditing(true);
  };

  const handleSaveArticle = async () => {
    if (!selectedArticle) return;
    try {
      setIsSaving(true);
      const authRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@acme.com', password: 'Admin123!' }),
      });
      const authData = await authRes.json();
      const token = authData.accessToken;

      const payload = {
        title: editForm.title,
        category: editForm.category,
        configurationItem: editForm.configurationItem,
        summary: editForm.summary,
        rootCause: editForm.rootCause,
        symptoms: editForm.symptoms.split('\n').map((s) => s.trim()).filter(Boolean),
        resolutionSteps: editForm.resolutionSteps.split('\n').map((s) => s.trim()).filter(Boolean),
      };

      const res = await fetch(`${API_BASE}/knowledge/articles/${selectedArticle.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedArticle(updated);
        setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setIsEditing(false);
        setGenSuccessMessage(`Knowledge Article ${updated.number || updated.id} successfully updated and saved to Database.`);
      }
    } catch (err: any) {
      console.error('Failed to save article edits:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchStatusAndArticles = async () => {
    try {
      const authRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@acme.com', password: 'Admin123!' }),
      });
      const authData = await authRes.json();
      const token = authData.accessToken;

      // Fetch Articles
      const resArticles = await fetch(`${API_BASE}/knowledge/articles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dataArticles = await resArticles.json();
      if (Array.isArray(dataArticles)) {
        setArticles(dataArticles);
      }

      // Fetch Status
      const resStatus = await fetch(`${API_BASE}/knowledge/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dataStatus = await resStatus.json();
      if (dataStatus && typeof dataStatus.percentageAnalyzed === 'number') {
        setStatus(dataStatus);
      }
    } catch (err) {
      console.error('Failed to fetch knowledge data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndArticles();
    // Poll every 3 seconds for continuous real-time progress updates
    const interval = setInterval(() => {
      fetchStatusAndArticles();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSynthesizeAll1000 = async () => {
    try {
      setGenerating(true);
      setGenSuccessMessage(null);

      const authRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@acme.com', password: 'Admin123!' }),
      });
      const authData = await authRes.json();
      const token = authData.accessToken;

      const res = await fetch(`${API_BASE}/knowledge/synthesize-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();

      setGenSuccessMessage(
        `🚀 Background Worker Triggered! Analyzing 1,000 Incidents in 10-ticket chunks with Meta Llama 3.3 70B Instruct.`
      );
      fetchStatusAndArticles();
    } catch (err: any) {
      console.error('Error triggering background synthesis:', err);
    } finally {
      setGenerating(false);
    }
  };

  const categories = ['ALL', ...Array.from(new Set(articles.map((a) => a.category)))];

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.configurationItem.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.rootCause.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      selectedCategory === 'ALL' || article.category.toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 space-y-8 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                Enterprise Knowledge Base & KEDB
                <span className="text-xs px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-semibold font-mono">
                  Meta Llama 3.3 70B Continuous AI
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Continuous background AI Worker scanning 1,000 incident work notes in 10-ticket chunks.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatusAndArticles}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Catalog
          </button>

          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono text-xs font-semibold shadow-sm">
            <Zap className="w-4 h-4 text-indigo-400 animate-pulse" />
            Autonomous AI Daemon Active (24/7 Scanning)
          </div>
        </div>
      </div>

      {/* Real-time Continuous Progress Banner */}
      {status && (
        <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-6 space-y-4 shadow-xl backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Activity className="w-6 h-6 text-indigo-400 animate-pulse" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  Continuous Backend AI Worker Status
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold">
                    {status.isWorkerRunning ? 'ACTIVE & PROCESSING' : 'PERSISTED & IDLE'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Runs continuously in the NestJS backend. Navigating between pages preserves all progress!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs font-mono">
              <div className="text-right">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Analyzed Incidents</span>
                <span className="font-extrabold text-indigo-300 text-sm">
                  {status.analyzedIncidentCount} / {status.totalIncidentsCount}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Published SOPs</span>
                <span className="font-extrabold text-emerald-400 text-sm">{status.publishedArticlesCount} Articles</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-bold text-slate-400">
              <span>Batch Analysis Progress</span>
              <span className="text-indigo-400 font-mono">{status.percentageAnalyzed}%</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-3 p-0.5 border border-slate-800">
              <div
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 h-2 rounded-full transition-all duration-500 shadow-lg shadow-indigo-500/30"
                style={{ width: `${status.percentageAnalyzed}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {genSuccessMessage && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {genSuccessMessage}
          </div>
          <button onClick={() => setGenSuccessMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Control Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Knowledge Base for SOPs, diagnostic work notes, CIs, or root cause analysis..."
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/60 transition shadow-inner"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1">
          {categories.slice(0, 6).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedCategory.toLowerCase() === cat.toLowerCase()
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Articles Grid */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 text-xs font-semibold flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
          Fetching Knowledge Base Catalog & Continuous Progress...
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-slate-900/40 border border-slate-800/60 space-y-3">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">No Knowledge Articles Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The continuous backend AI worker is scanning incidents. Articles will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArticles.map((article) => (
            <div
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              className="group bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-6 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                    {article.number}
                  </span>
                  <span className="font-semibold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
                    {article.category}
                  </span>
                </div>

                <h3 className="text-sm font-extrabold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-2">
                  {article.title}
                </h3>

                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                  {article.summary}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5 text-purple-400 font-semibold">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Meta Llama 3.3 70B</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-slate-500" /> {article.workNotesAnalyzedCount} notes
                  </span>
                  <span className="flex items-center gap-1 text-slate-300">
                    <Eye className="w-3.5 h-3.5 text-slate-500" /> {article.viewCount}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Modal Viewer (View & Edit Modes) */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-800">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
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
              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <button
                    onClick={() => startEditing(selectedArticle)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Article
                  </button>
                ) : (
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedArticle(null);
                    setIsEditing(false);
                  }}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Read Mode vs. Edit Form Mode */}
            {isEditing ? (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-indigo-400" /> Edit Knowledge Article Details ({selectedArticle.number})
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Article Title *</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Category</label>
                    <input
                      type="text"
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 font-semibold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Configuration Item (CI)</label>
                  <input
                    type="text"
                    value={editForm.configurationItem}
                    onChange={(e) => setEditForm({ ...editForm, configurationItem: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-mono font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Executive Summary</label>
                  <textarea
                    rows={3}
                    value={editForm.summary}
                    onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 leading-relaxed focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Technical Root Cause</label>
                  <textarea
                    rows={3}
                    value={editForm.rootCause}
                    onChange={(e) => setEditForm({ ...editForm, rootCause: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-rose-300 font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Key Telemetry Symptoms (One per line)</label>
                  <textarea
                    rows={3}
                    value={editForm.symptoms}
                    onChange={(e) => setEditForm({ ...editForm, symptoms: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Standard Operating Procedure / SOP Remediation (One step per line)</label>
                  <textarea
                    rows={4}
                    value={editForm.resolutionSteps}
                    onChange={(e) => setEditForm({ ...editForm, resolutionSteps: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-emerald-300 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveArticle}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-lg shadow-emerald-600/20"
                  >
                    <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
                    {isSaving ? 'Saving Changes...' : 'Save Knowledge Article'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Affected CI & Author Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Configuration Item</span>
                    <span className="font-mono text-indigo-300 font-bold">{selectedArticle.configurationItem}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Notes Analyzed</span>
                    <span className="font-bold text-slate-200">{selectedArticle.workNotesAnalyzedCount} Incidents</span>
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

                {/* Executive Summary */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-400" /> Executive Summary
                  </h4>
                  <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                    {selectedArticle.summary}
                  </p>
                </div>

                {/* Symptoms & Telemetry */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Key Telemetry Symptoms
                  </h4>
                  <ul className="space-y-2">
                    {selectedArticle.symptoms.map((symptom, idx) => (
                      <li key={idx} className="text-xs text-slate-300 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        {symptom}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Root Cause Analysis */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" /> Technical Root Cause
                  </h4>
                  <div className="text-xs text-slate-200 bg-rose-950/10 p-4 rounded-xl border border-rose-500/20 leading-relaxed">
                    {selectedArticle.rootCause}
                  </div>
                </div>

                {/* Step-by-step SOP Remediation */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Standard Operating Procedure (SOP)
                  </h4>
                  <div className="space-y-2">
                    {((selectedArticle.resolutionSteps && selectedArticle.resolutionSteps.length > 0)
                      ? selectedArticle.resolutionSteps
                      : ((selectedArticle as any).commands && (selectedArticle as any).commands.length > 0)
                        ? (selectedArticle as any).commands
                        : (selectedArticle.content || '').split('\n').filter((l: string) => l.trim().length > 0)
                    ).map((step: string, idx: number) => (
                      <div key={idx} className="text-xs text-slate-200 bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono whitespace-pre-wrap">
                        {step}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Source Incidents */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>Linked Incident IDs:</span>
                    <div className="flex gap-1 overflow-x-auto">
                      {selectedArticle.sourceIncidentIds.slice(0, 6).map((id) => (
                        <span key={id} className="font-mono text-[10px] bg-slate-800 px-2 py-0.5 rounded text-indigo-300">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
