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
  ChevronRight,
  Lock,
  MessageSquare,
  Tag,
  Server,
  Code2,
  Trash2
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
  content?: string;
}

export default function KnowledgePage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedCi, setSelectedCi] = useState('ALL');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);

  // Edit / Create Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const [editForm, setEditForm] = useState({
    id: '',
    title: '',
    category: 'Unix',
    configurationItem: 'control plane',
    summary: '',
    rootCause: '',
    symptoms: '',
    resolutionSteps: '',
  });

  const [createForm, setCreateForm] = useState({
    title: '',
    category: 'Unix',
    configurationItem: 'control plane',
    summary: '',
    rootCause: '',
    symptoms: '',
    resolutionSteps: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      let data: any[] = [];
      const res = await fetch('/api/v1/knowledge/articles');
      if (res.ok) {
        data = await res.json();
      } else {
        const directRes = await fetch('http://localhost:4000/api/v1/knowledge/articles');
        if (directRes.ok) {
          data = await directRes.json();
        }
      }

      if (Array.isArray(data)) {
        setArticles(data);
      }
    } catch (e) {
      console.error('Error fetching knowledge articles:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const openEditModal = (article: KnowledgeArticle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditForm({
      id: article.id,
      title: article.title || '',
      category: article.category || 'Unix',
      configurationItem: article.configurationItem || 'control plane',
      summary: article.summary || '',
      rootCause: article.rootCause || '',
      symptoms: Array.isArray(article.symptoms) ? article.symptoms.join('\n') : '',
      resolutionSteps: Array.isArray(article.resolutionSteps) ? article.resolutionSteps.join('\n') : '',
    });
    setIsEditModalOpen(true);
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.id || !editForm.title) return;
    try {
      setIsSaving(true);
      const payload = {
        title: editForm.title,
        category: editForm.category,
        configurationItem: editForm.configurationItem,
        summary: editForm.summary,
        rootCause: editForm.rootCause,
        symptoms: editForm.symptoms.split('\n').map((s) => s.trim()).filter(Boolean),
        resolutionSteps: editForm.resolutionSteps.split('\n').map((s) => s.trim()).filter(Boolean),
      };

      const res = await fetch(`/api/v1/knowledge/articles/${editForm.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        if (selectedArticle && selectedArticle.id === updated.id) {
          setSelectedArticle(updated);
        }
        setSaveSuccessMsg(`Master SOP '${updated.title}' updated successfully! ✅`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
        setIsEditModalOpen(false);
      }
    } catch (e) {
      console.error('Error saving article:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title) return;
    try {
      setIsSaving(true);
      const payload = {
        title: createForm.title,
        category: createForm.category,
        configurationItem: createForm.configurationItem,
        summary: createForm.summary,
        rootCause: createForm.rootCause,
        symptoms: createForm.symptoms.split('\n').map((s) => s.trim()).filter(Boolean),
        resolutionSteps: createForm.resolutionSteps.split('\n').map((s) => s.trim()).filter(Boolean),
      };

      const res = await fetch('/api/v1/knowledge/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        setArticles((prev) => [created, ...prev]);
        setSaveSuccessMsg(`New Master SOP '${created.title}' created and published! ✅`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
        setIsCreateModalOpen(false);
        setCreateForm({
          title: '',
          category: 'Unix',
          configurationItem: 'control plane',
          summary: '',
          rootCause: '',
          symptoms: '',
          resolutionSteps: '',
        });
      }
    } catch (e) {
      console.error('Error creating article:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredArticles = articles.filter((a) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      a.title?.toLowerCase().includes(q) ||
      a.number?.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q) ||
      a.configurationItem?.toLowerCase().includes(q) ||
      a.rootCause?.toLowerCase().includes(q) ||
      (Array.isArray(a.symptoms) && a.symptoms.some((s) => s.toLowerCase().includes(q))) ||
      (Array.isArray(a.resolutionSteps) && a.resolutionSteps.some((s) => s.toLowerCase().includes(q)));

    const matchesCategory = selectedCategory === 'ALL' || a.category === selectedCategory;
    const matchesCi = selectedCi === 'ALL' || a.configurationItem === selectedCi;
    return matchesSearch && matchesCategory && matchesCi;
  });

  const categories = Array.from(new Set(articles.map((a) => a.category).filter(Boolean)));
  const cis = Array.from(new Set(articles.map((a) => a.configurationItem).filter(Boolean)));

  return (
    <div className="flex flex-col min-h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. Context Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#e2e8f0] px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Service Management</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Knowledge Management</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-extrabold flex items-center gap-1.5">
            Knowledge Articles & Master SOPs
            <span className="px-1.5 py-0.2 rounded bg-[#f1f5f9] text-[#1e6844] font-mono text-[10px] font-bold border border-[#cbd5e1]">
              {articles.length} Published
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3 py-1.5 bg-[#288554] hover:bg-[#30bb7b] text-white font-bold rounded flex items-center gap-1.5 shadow-sm transition cursor-pointer text-xs"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>New Master SOP</span>
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded bg-white hover:bg-slate-100 text-slate-600 border border-[#cbd5e1] transition cursor-pointer shadow-xs"
            title="Refresh Knowledge Base"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#30bb7b]' : ''}`} />
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-emerald-800 text-xs font-bold flex items-center gap-2 shadow-xs animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {saveSuccessMsg}
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 p-6 space-y-5 max-w-7xl mx-auto w-full">
        {/* Action & Filter Ribbon */}
        <div className="bg-white border border-[#e2e8f0] rounded p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-1.5 bg-[#f8fafc] border border-[#cbd5e1] px-2.5 py-1.5 rounded text-[11px] text-slate-700 font-medium">
              <Filter className="w-3 h-3 text-[#288554]" />
              <span className="text-slate-600 font-mono">Status = Published</span>
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border border-[#cbd5e1] text-slate-800 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-[#30bb7b]"
            >
              <option value="ALL">Category: All ({articles.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* CI Filter */}
            <select
              value={selectedCi}
              onChange={(e) => setSelectedCi(e.target.value)}
              className="bg-white border border-[#cbd5e1] text-slate-800 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-[#30bb7b]"
            >
              <option value="ALL">Target CI: All</option>
              {cis.map((ci) => (
                <option key={ci} value={ci}>{ci}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search SOP title, tags, commands, symptoms..."
              className="bg-white border border-[#cbd5e1] focus:border-[#30bb7b] rounded pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none w-72 transition shadow-inner"
            />
          </div>
        </div>

        {/* Knowledge Articles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && articles.length === 0 ? (
            <div className="col-span-3 text-center py-16 text-slate-500">
              Querying ServiceNow Master SOPs & Vector Knowledge Articles...
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="col-span-3 text-center py-16 text-slate-500 font-medium">
              No knowledge articles match the filter.
            </div>
          ) : (
            filteredArticles.map((article) => (
              <div
                key={article.id}
                onClick={() => setSelectedArticle(article)}
                className="bg-white border border-[#e2e8f0] hover:border-[#30bb7b] rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-3 flex flex-col justify-between group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#0284c7] bg-[#f0f9ff] px-2 py-0.5 rounded border border-[#bae6fd]">
                      {article.number || article.id}
                    </span>

                    {/* Edit Button directly on card */}
                    <button
                      onClick={(e) => openEditModal(article, e)}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-[#e6f7ef] text-slate-600 hover:text-[#1e6844] border border-slate-200 hover:border-[#30bb7b]/40 text-[10px] font-bold flex items-center gap-1 transition"
                      title="Edit this Master SOP"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit SOP</span>
                    </button>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                    {article.title}
                  </h3>

                  {/* Rich Tag Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {article.title.toLowerCase().includes('investigative') || article.category.toLowerCase().includes('investigative') ? (
                      <span className="text-[10px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                        <Search className="w-2.5 h-2.5 text-purple-600" />
                        Reusable Investigative SOP
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-[#1e6844] bg-[#e6f7ef] px-2 py-0.5 rounded border border-[#30bb7b]/30 flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        {article.category || 'Master SOP'}
                      </span>
                    )}

                    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1 font-mono">
                      <Server className="w-2.5 h-2.5 text-slate-500" />
                      {article.configurationItem || 'Global CI'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {article.summary}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#e2e8f0] flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span className="flex items-center gap-1 text-[#0284c7] font-semibold">
                    <Code2 className="w-3 h-3" /> {article.resolutionSteps?.length || 0} Executable Steps
                  </span>
                  <span className="text-slate-400">Published</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Article Detail Drawer / Modal */}
      {selectedArticle && !isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-sm">{selectedArticle.number || selectedArticle.id}: {selectedArticle.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(selectedArticle)}
                  className="px-3 py-1 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit SOP</span>
                </button>
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs bg-[#f8fafc]">
              {/* Tags Ribbon */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-bold text-[#1e6844] bg-[#e6f7ef] px-3 py-1 rounded border border-[#30bb7b]/30 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> Category: {selectedArticle.category}
                </span>
                <span className="text-xs font-bold text-slate-700 bg-white px-3 py-1 rounded border border-[#cbd5e1] flex items-center gap-1.5 font-mono">
                  <Server className="w-3.5 h-3.5 text-slate-500" /> Target CI: {selectedArticle.configurationItem}
                </span>
              </div>

              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Executive Summary</span>
                <p className="text-xs text-slate-700 leading-relaxed">{selectedArticle.summary}</p>
              </div>

              {/* Resolution Steps (Yellow Work Notes Style) */}
              <div className="bg-[#fffbeb] p-4 rounded border border-[#fde68a] shadow-sm space-y-2">
                <div className="flex items-center justify-between text-amber-900 font-bold">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Standard Operating Procedure (Executable CLI Runbook)</span>
                  </div>
                  <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-[#fde68a]">
                    {selectedArticle.resolutionSteps?.length || 0} Commands
                  </span>
                </div>
                <div className="space-y-1.5 font-mono text-xs text-amber-950 bg-white p-3 rounded border border-[#fde68a]">
                  {selectedArticle.resolutionSteps?.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-amber-600 font-bold select-none">{idx + 1}.</span>
                      <span className="text-slate-900 select-all">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Root Cause */}
              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Underlying Root Cause</span>
                <p className="text-xs text-slate-700 leading-relaxed font-mono">{selectedArticle.rootCause}</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedArticle(null)}
                  className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Close Article
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit SOP Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[#288554]" />
                <span className="font-extrabold text-slate-900 text-sm">Edit Master SOP Runbook</span>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveArticle} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs bg-[#f8fafc]">
              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    SOP Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full bg-white border border-[#cbd5e1] focus:border-[#30bb7b] rounded p-2 text-xs text-slate-900 focus:outline-none font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Category / Domain</label>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:outline-none"
                    >
                      <option value="Unix">Unix</option>
                      <option value="Network Ops">Network Ops</option>
                      <option value="App Support">App Support</option>
                      <option value="Desktop Support">Desktop Support</option>
                      <option value="SecOps">SecOps</option>
                      <option value="DBA Team">DBA Team</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Target Configuration Item (CI)</label>
                    <input
                      type="text"
                      value={editForm.configurationItem}
                      onChange={(e) => setEditForm({ ...editForm, configurationItem: e.target.value })}
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Executive Summary</label>
                  <textarea
                    rows={2}
                    value={editForm.summary}
                    onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                    className="w-full bg-white border border-[#cbd5e1] focus:border-[#30bb7b] rounded p-2 text-xs text-slate-900 focus:outline-none leading-relaxed"
                  />
                </div>
              </div>

              {/* Executable CLI Runbook Steps (Yellow Work Notes Style) */}
              <div className="bg-[#fffbeb] p-4 rounded border border-[#fde68a] shadow-sm space-y-2">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Executable CLI Runbook Steps (One command per line)</span>
                </div>
                <textarea
                  rows={6}
                  value={editForm.resolutionSteps}
                  onChange={(e) => setEditForm({ ...editForm, resolutionSteps: e.target.value })}
                  placeholder="Enter bash commands (one per line)..."
                  className="w-full bg-white border border-[#fde68a] rounded p-2.5 text-xs text-slate-900 font-mono focus:outline-none leading-relaxed"
                />
              </div>

              {/* Underlying Root Cause */}
              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-2">
                <label className="block text-slate-700 font-bold">Underlying Root Cause</label>
                <textarea
                  rows={2}
                  value={editForm.rootCause}
                  onChange={(e) => setEditForm({ ...editForm, rootCause: e.target.value })}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 font-mono focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold transition shadow-sm cursor-pointer disabled:opacity-40"
                >
                  {isSaving ? 'Saving...' : 'Save & Update Master SOP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create SOP Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#288554]" />
                <span className="font-extrabold text-slate-900 text-sm">Create New Master SOP Runbook</span>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateArticle} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs bg-[#f8fafc]">
              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    SOP Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    placeholder="e.g. Master SOP: Fix BGP Peer Session Flapping on Switch"
                    className="w-full bg-white border border-[#cbd5e1] focus:border-[#30bb7b] rounded p-2 text-xs text-slate-900 focus:outline-none font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Category / Domain</label>
                    <select
                      value={createForm.category}
                      onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:outline-none"
                    >
                      <option value="Unix">Unix</option>
                      <option value="Network Ops">Network Ops</option>
                      <option value="App Support">App Support</option>
                      <option value="Desktop Support">Desktop Support</option>
                      <option value="SecOps">SecOps</option>
                      <option value="DBA Team">DBA Team</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Target Configuration Item (CI)</label>
                    <input
                      type="text"
                      value={createForm.configurationItem}
                      onChange={(e) => setCreateForm({ ...createForm, configurationItem: e.target.value })}
                      placeholder="e.g. router-border-nyc-01"
                      className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Executive Summary</label>
                  <textarea
                    rows={2}
                    value={createForm.summary}
                    onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })}
                    placeholder="Brief description of the runbook procedure..."
                    className="w-full bg-white border border-[#cbd5e1] focus:border-[#30bb7b] rounded p-2 text-xs text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Executable CLI Runbook Steps (Yellow Work Notes Style) */}
              <div className="bg-[#fffbeb] p-4 rounded border border-[#fde68a] shadow-sm space-y-2">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Executable CLI Runbook Steps (One command per line)</span>
                </div>
                <textarea
                  rows={5}
                  value={createForm.resolutionSteps}
                  onChange={(e) => setCreateForm({ ...createForm, resolutionSteps: e.target.value })}
                  placeholder="systemctl restart control-plane&#10;journalctl -u control-plane -n 50"
                  className="w-full bg-white border border-[#fde68a] rounded p-2.5 text-xs text-slate-900 font-mono focus:outline-none leading-relaxed"
                />
              </div>

              {/* Underlying Root Cause */}
              <div className="bg-white p-4 rounded border border-[#e2e8f0] shadow-sm space-y-2">
                <label className="block text-slate-700 font-bold">Underlying Root Cause</label>
                <textarea
                  rows={2}
                  value={createForm.rootCause}
                  onChange={(e) => setCreateForm({ ...createForm, rootCause: e.target.value })}
                  placeholder="Root cause identified for this procedure..."
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 font-mono focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold transition shadow-sm cursor-pointer disabled:opacity-40"
                >
                  {isSaving ? 'Publishing...' : 'Create & Publish SOP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
