import React, { useState, useEffect } from 'react';
import { Sliders, Key, Server, Cpu, Check, AlertCircle, RefreshCw, Eye, EyeOff, ShieldCheck, Zap } from 'lucide-react';

export interface ModelConfig {
  environment: 'genai_lab' | 'production_azure';
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
    environment: 'genai_lab',
    baseUrl: 'https://genailab.tcs.in/v1',
    apiKey: 'sk-RRoxANx2dKdNE3N5j0mbxQ',
    routerModel: 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
    resolverModel: 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
    synthesizerModel: 'azure_ai/genailab-maas-DeepSeek-R1',
    governanceModel: 'genailab-maas-gpt-4o',
    fallbackModels: [
      'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
      'azure_ai/genailab-maas-DeepSeek-R1',
      'genailab-maas-gpt-4o',
      'gemini-2.5-pro',
      'azure/genailab-maas-gpt-4o-mini'
    ]
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const availableModels = [
    { value: 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct', label: 'Meta Llama-3.3 70B Instruct (High Precision Routing)' },
    { value: 'azure_ai/genailab-maas-DeepSeek-R1', label: 'DeepSeek R1 (Advanced SOP Reasoning & Synthesis)' },
    { value: 'genailab-maas-gpt-4o', label: 'OpenAI GPT-4o (Governance & Multi-Modal Evaluation)' },
    { value: 'gemini-2.5-pro', label: 'Google Gemini 2.5 Pro (Enterprise Reasoning)' },
    { value: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash (Fast Execution)' },
    { value: 'azure/genailab-maas-gpt-4o-mini', label: 'OpenAI GPT-4o Mini (Cost-Optimized Fallback)' },
    { value: 'gpt-4o', label: 'Direct Production OpenAI GPT-4o' },
    { value: 'gpt-4o-mini', label: 'Direct Production OpenAI GPT-4o Mini' }
  ];

  const presets = {
    genai_lab: {
      environment: 'genai_lab' as const,
      baseUrl: 'https://genailab.tcs.in/v1',
      apiKey: 'sk-RRoxANx2dKdNE3N5j0mbxQ',
      routerModel: 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
      resolverModel: 'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
      synthesizerModel: 'azure_ai/genailab-maas-DeepSeek-R1',
      governanceModel: 'genailab-maas-gpt-4o',
      fallbackModels: [
        'azure_ai/genailab-maas-Llama-3.3-70B-Instruct',
        'azure_ai/genailab-maas-DeepSeek-R1',
        'genailab-maas-gpt-4o',
        'gemini-2.5-pro',
        'azure/genailab-maas-gpt-4o-mini'
      ]
    },
    production_azure: {
      environment: 'production_azure' as const,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-proj-prod-enterprise-key',
      routerModel: 'gpt-4o-mini',
      resolverModel: 'gpt-4o',
      synthesizerModel: 'gpt-4o',
      governanceModel: 'gpt-4o',
      fallbackModels: ['gpt-4o', 'gpt-4o-mini']
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
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading Environment & Model Configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {toastMessage && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <Check className="w-5 h-5" />
            <span className="font-medium text-sm">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900/40 via-purple-900/40 to-slate-900/60 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="flex items-start justify-between relative z-10">
          <div>
            <div className="inline-flex items-center space-x-2 bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full mb-3 border border-indigo-500/30">
              <Sliders className="w-3.5 h-3.5" />
              <span>Multi-Environment Model Governance Engine</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Model & Environment Configuration</h2>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Seamlessly switch between <strong>Gen AI Lab MaaS Proxy</strong> and <strong>Production Enterprise Direct</strong> environments. Customize API credentials and specific model selections for each specialized agent role.
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400 font-medium">Active System Mode</span>
            <span className="mt-1 bg-emerald-500/20 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-500/30 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{config.environment === 'genai_lab' ? 'Gen AI Lab MaaS Proxy' : 'Production Direct Enterprise'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Environment Preset Switcher */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-md">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center space-x-2">
          <Server className="w-4 h-4 text-indigo-400" />
          <span>Environment Presets</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleApplyPreset('genai_lab')}
            className={`p-5 rounded-xl border text-left transition-all relative ${
              config.environment === 'genai_lab'
                ? 'bg-indigo-600/15 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/10'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80 hover:border-slate-600'
            }`}
          >
            {config.environment === 'genai_lab' && (
              <span className="absolute top-4 right-4 bg-indigo-500 text-white p-1 rounded-full">
                <Check className="w-3.5 h-3.5" />
              </span>
            )}
            <div className="font-bold text-base text-white flex items-center space-x-2">
              <span>Environment 1: Gen AI Lab MaaS Proxy</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Enterprise MaaS proxy with Meta Llama-3.3 70B, DeepSeek-R1 reasoning, and custom TCS endpoint.
            </p>
            <div className="mt-3 text-xs font-mono bg-slate-950/60 p-2 rounded text-indigo-300 border border-slate-800">
              URL: https://genailab.tcs.in/v1
            </div>
          </button>

          <button
            onClick={() => handleApplyPreset('production_azure')}
            className={`p-5 rounded-xl border text-left transition-all relative ${
              config.environment === 'production_azure'
                ? 'bg-indigo-600/15 border-indigo-500/50 text-white shadow-lg shadow-indigo-500/10'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80 hover:border-slate-600'
            }`}
          >
            {config.environment === 'production_azure' && (
              <span className="absolute top-4 right-4 bg-indigo-500 text-white p-1 rounded-full">
                <Check className="w-3.5 h-3.5" />
              </span>
            )}
            <div className="font-bold text-base text-white flex items-center space-x-2">
              <span>Environment 2: Production Direct Enterprise</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Direct Production OpenAI or Azure OpenAI service endpoint with high-throughput GPT-4o models.
            </p>
            <div className="mt-3 text-xs font-mono bg-slate-950/60 p-2 rounded text-emerald-300 border border-slate-800">
              URL: https://api.openai.com/v1
            </div>
          </button>
        </div>
      </div>

      {/* API Credentials Card */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-md space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
          <Key className="w-4 h-4 text-emerald-400" />
          <span>API Credentials & Service Endpoint</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Base API URL Endpoint</label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
              placeholder="https://genailab.tcs.in/v1"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">API Access Key Token</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 pr-10"
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Specialized Agent Model Selectors */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-md space-y-6">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span>Specialized Agent Task Model Assignments</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Router Agent */}
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">🚦</span>
              <div>
                <h4 className="text-sm font-bold text-white">1. Router Agent Model</h4>
                <p className="text-xs text-slate-400">Classifies categories, priority matrix, and queue routing.</p>
              </div>
            </div>
            <select
              value={config.routerModel}
              onChange={(e) => setConfig({ ...config, routerModel: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white mt-2 focus:outline-none focus:border-indigo-500"
            >
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Resolver Agent */}
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">🛠️</span>
              <div>
                <h4 className="text-sm font-bold text-white">2. Resolver Agent Model</h4>
                <p className="text-xs text-slate-400">SSH runbook matching, non-interactive execution & verification.</p>
              </div>
            </div>
            <select
              value={config.resolverModel}
              onChange={(e) => setConfig({ ...config, resolverModel: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white mt-2 focus:outline-none focus:border-indigo-500"
            >
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Knowledge Synthesizer */}
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">🧠</span>
              <div>
                <h4 className="text-sm font-bold text-white">3. Knowledge Synthesizer Model</h4>
                <p className="text-xs text-slate-400">Deep reasoning & Master SOP deduplication (KB0000050–57).</p>
              </div>
            </div>
            <select
              value={config.synthesizerModel}
              onChange={(e) => setConfig({ ...config, synthesizerModel: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white mt-2 focus:outline-none focus:border-indigo-500"
            >
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Governance Subsystem */}
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">🛡️</span>
              <div>
                <h4 className="text-sm font-bold text-white">4. Governance Agent Model</h4>
                <p className="text-xs text-slate-400">Risk evaluation, HITL approval queue & audit history logging.</p>
              </div>
            </div>
            <select
              value={config.governanceModel}
              onChange={(e) => setConfig({ ...config, governanceModel: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white mt-2 focus:outline-none focus:border-indigo-500"
            >
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Save Button Action */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center space-x-2 disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
          <span>Save & Apply Environment Config</span>
        </button>
      </div>
    </div>
  );
}
