import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Key,
  Server,
  Cpu,
  Check,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  Zap,
  Radio,
  Sparkles,
  Layers,
  CheckCircle2
} from 'lucide-react';

export interface ModelConfig {
  environment: 'nvidia' | 'genai_lab' | 'production_azure';
  baseUrl: string;
  apiKey: string;
  routerModel: string;
  resolverModel: string;
  synthesizerModel: string;
  governanceModel: string;
  fallbackModels: string[];
}

export function ModelConfigView() {
  const API_BASE = 'http://localhost:4000/api/v1/agent';
  
  const [config, setConfig] = useState<ModelConfig>({
    environment: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: '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',
    routerModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    resolverModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    synthesizerModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    governanceModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    fallbackModels: [
      'nvidia/nemotron-3.5-lightning-30b-a3b',
      'meta/llama-3.3-70b-instruct',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'mistralai/mistral-7b-instruct-v0.3',
      'deepseek-ai/deepseek-r1'
    ]
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const availableModels = [
    { value: 'azure/genailab-maas-gpt-4o-mini', label: 'OpenAI GPT-4o Mini (GenAI Lab - Fast Classification & Governance)' },
    { value: 'genailab-maas-gpt-4o', label: 'OpenAI GPT-4o (GenAI Lab - High-Precision SSH Resolver)' },
    { value: 'gemini-3.1-pro-preview', label: 'Google Gemini 3.1 Pro Preview (GenAI Lab - Deep Reasoning Synthesizer)' },
    { value: 'azure_ai/genailab-maas-DeepSeek-R1', label: 'DeepSeek R1 (GenAI Lab - Reasoning Engine)' },
    { value: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'NVIDIA Nemotron 3.5 Lightning 30B (NVIDIA NIM - Active & Thinking Enabled)' },
    { value: 'meta/llama-3.3-70b-instruct', label: 'Meta Llama-3.3 70B Instruct (NVIDIA NIM - Active & Verified)' },
    { value: 'gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' }
  ];

  const presets = {
    nvidia: {
      environment: 'nvidia' as const,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: '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',
      routerModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      resolverModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      synthesizerModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      governanceModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      fallbackModels: [
        'nvidia/nemotron-3.5-lightning-30b-a3b',
        'meta/llama-3.3-70b-instruct',
        'nvidia/llama-3.1-nemotron-70b-instruct'
      ]
    },
    genai_lab: {
      environment: 'genai_lab' as const,
      baseUrl: 'https://genailab.tcs.in/v1',
      apiKey: 'sk-0mLmGnF9P0tbG_jlZVYDoA',
      routerModel: 'azure/genailab-maas-gpt-4o-mini',
      resolverModel: 'genailab-maas-gpt-4o',
      synthesizerModel: 'gemini-3.1-pro-preview',
      governanceModel: 'azure/genailab-maas-gpt-4o-mini',
      fallbackModels: [
        'genailab-maas-gpt-4o',
        'azure/genailab-maas-gpt-4o-mini',
        'gemini-3.1-pro-preview',
        'gemini-2.5-flash'
      ]
    },
    production_azure: {
      environment: 'production_azure' as const,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: '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',
      routerModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      resolverModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      synthesizerModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      governanceModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      fallbackModels: [
        'nvidia/nemotron-3.5-lightning-30b-a3b',
        'meta/llama-3.3-70b-instruct'
      ]
    }
  };

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleApplyPreset = (presetKey: 'genai_lab' | 'production_azure') => {
    setConfig(presets[presetKey]);
    setToastMessage(`Switched to ${presetKey === 'genai_lab' ? 'Gen AI Lab MaaS Proxy' : 'Production Direct Enterprise'} Preset`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setToastMessage('✅ Environment & Model Config successfully saved and applied!');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err) {
      setToastMessage('❌ Failed to save configuration');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="lobe-glass rounded-2xl p-16 text-center flex flex-col items-center justify-center shadow-xl">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-400 mb-3" />
        <span className="text-xs font-bold text-slate-400">Loading Environment & Model Configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      {toastMessage && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-4 rounded-xl flex items-center justify-between shadow-lg shadow-emerald-950/20">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-xs">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="lobe-glass rounded-2xl p-6 border border-slate-800/80 shadow-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 bg-cyan-500/20 text-cyan-300 text-xs font-bold px-3 py-1 rounded-full mb-2 border border-cyan-500/30">
            <Sliders className="w-3.5 h-3.5" />
            <span>Multi-Environment Model Governance Engine</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">AI Model & Router Configuration</h2>
          <p className="text-slate-400 text-xs mt-1 max-w-2xl font-medium">
            Seamlessly switch between <strong>Gen AI Lab MaaS Proxy</strong> and <strong>Production NVIDIA Cloud Direct</strong>. Customize API credentials and assign specific LLMs per agent role.
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end shrink-0">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Mode</span>
          <span className="mt-1 bg-emerald-500/20 text-emerald-300 text-xs font-extrabold px-3 py-1 rounded-lg border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{config.environment === 'genai_lab' ? 'Gen AI Lab MaaS' : 'Production NVIDIA Direct'}</span>
          </span>
        </div>
      </div>

      {/* Environment Preset Switcher */}
      <div className="lobe-glass rounded-2xl p-6 border border-slate-800/80 shadow-xl space-y-4">
        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Server className="w-4 h-4 text-cyan-400" />
          <span>Environment Presets</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleApplyPreset('genai_lab')}
            className={`p-5 rounded-xl border text-left transition-all relative cursor-pointer ${
              config.environment === 'genai_lab'
                ? 'bg-cyan-950/40 border-cyan-500/60 text-white shadow-lg shadow-cyan-950/30'
                : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
            }`}
          >
            {config.environment === 'genai_lab' && (
              <span className="absolute top-4 right-4 bg-cyan-500 text-slate-950 p-1 rounded-full font-bold">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <div className="font-extrabold text-sm text-white flex items-center space-x-2">
              <span>Environment 1: Gen AI Lab MaaS Proxy</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
              Enterprise MaaS proxy with Meta Llama-3.3 70B, DeepSeek-R1 reasoning, and custom TCS proxy endpoint.
            </p>
            <div className="mt-3 text-xs font-mono bg-slate-950/80 p-2 rounded-lg text-cyan-300 border border-slate-800">
              URL: https://genailab.tcs.in/v1
            </div>
          </button>

          <button
            onClick={() => handleApplyPreset('production_azure')}
            className={`p-5 rounded-xl border text-left transition-all relative cursor-pointer ${
              config.environment === 'production_azure'
                ? 'bg-cyan-950/40 border-cyan-500/60 text-white shadow-lg shadow-cyan-950/30'
                : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
            }`}
          >
            {config.environment === 'production_azure' && (
              <span className="absolute top-4 right-4 bg-cyan-500 text-slate-950 p-1 rounded-full font-bold">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            )}
            <div className="font-extrabold text-sm text-white flex items-center space-x-2">
              <span>Environment 2: Production NVIDIA Cloud Direct</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
              NVIDIA NIM Build Cloud API endpoint powering all specialized agents with Nemotron-3.5 & Llama-3.3 70B.
            </p>
            <div className="mt-3 text-xs font-mono bg-slate-950/80 p-2 rounded-lg text-emerald-300 border border-slate-800">
              URL: https://integrate.api.nvidia.com/v1
            </div>
          </button>
        </div>
      </div>

      {/* API Credentials Card */}
      <div className="lobe-glass rounded-2xl p-6 border border-slate-800/80 shadow-xl space-y-4">
        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-400" />
          <span>API Credentials & Service Endpoint</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Base API URL Endpoint</label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500 transition"
              placeholder="https://genailab.tcs.in/v1"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">API Access Key Token</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500 pr-10 transition"
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Specialized Agent Model Selectors */}
      <div className="lobe-glass rounded-2xl p-6 border border-slate-800/80 shadow-xl space-y-4">
        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span>Specialized Agent Task Model Assignments</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Router Agent */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                1. Router Agent Model
              </span>
              <span className="text-[10px] font-mono text-cyan-400">Classification</span>
            </div>
            <select
              value={config.routerModel}
              onChange={(e) => setConfig({ ...config, routerModel: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Resolver Agent */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                2. Resolver Agent Model
              </span>
              <span className="text-[10px] font-mono text-cyan-400">SSH & Runbook</span>
            </div>
            <select
              value={config.resolverModel}
              onChange={(e) => setConfig({ ...config, resolverModel: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Knowledge Synthesizer */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                3. Knowledge Synthesizer Model
              </span>
              <span className="text-[10px] font-mono text-purple-400">RAG Deduplication</span>
            </div>
            <select
              value={config.synthesizerModel}
              onChange={(e) => setConfig({ ...config, synthesizerModel: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Governance Subsystem */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                4. Governance Agent Model
              </span>
              <span className="text-[10px] font-mono text-emerald-400">Safety & HITL</span>
            </div>
            <select
              value={config.governanceModel}
              onChange={(e) => setConfig({ ...config, governanceModel: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Save Button Action */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-cyan-600 via-teal-500 to-emerald-500 hover:opacity-95 text-slate-950 font-black text-xs px-6 py-3 rounded-xl shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin text-slate-950" /> : <Zap className="w-4 h-4 text-slate-950 fill-slate-950" />}
          <span>Save & Apply AI Configuration</span>
        </button>
      </div>
    </div>
  );
}
