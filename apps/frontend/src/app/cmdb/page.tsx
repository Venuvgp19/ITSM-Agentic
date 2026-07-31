'use client';

import React, { useState } from 'react';
import { Server, Database, Shield, Cpu, Network, ArrowRight, Activity, Plus, CheckCircle } from 'lucide-react';

const initialCis = [
  { id: 'CI001', name: 'k8s-prod-cluster-east-1', ciClass: 'Kubernetes Cluster', status: 'OPERATIONAL', ip: '10.240.0.12', env: 'Production', category: 'Cloud Infrastructure' },
  { id: 'CI002', name: 'db-postgres-primary', ciClass: 'PostgreSQL Database', status: 'OPERATIONAL', ip: '10.240.4.88', env: 'Production', category: 'Database' },
  { id: 'CI003', name: 'router-border-nyc-01', ciClass: 'Network Router', status: 'MAINTENANCE', ip: '192.168.1.1', env: 'Production', category: 'Networking' },
  { id: 'CI004', name: 'api-gateway-envoy-v2', ciClass: 'API Gateway', status: 'OPERATIONAL', ip: '10.240.2.14', env: 'Production', category: 'Middleware' },
  { id: 'CI005', name: 'control plane', ciClass: 'Virtual Machine', status: 'OPERATIONAL', ip: '192.168.100.101', env: 'Production', category: 'Cloud Infrastructure' },
];

export default function CmdbPage() {
  const [cis, setCis] = useState(initialCis);
  const [selectedCi, setSelectedCi] = useState(initialCis[0]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states for adding CI
  const [name, setName] = useState('');
  const [ciClass, setCiClass] = useState('Kubernetes Cluster');
  const [status, setStatus] = useState('OPERATIONAL');
  const [ip, setIp] = useState('');
  const [env, setEnv] = useState('Production');

  const handleAddCi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const newCi = {
      id: `CI${String(cis.length + 1).padStart(3, '0')}`,
      name,
      ciClass,
      status,
      ip: ip || '10.240.0.100',
      env,
      category: 'Cloud Infrastructure',
    };

    const updated = [newCi, ...cis];
    setCis(updated);
    setSelectedCi(newCi);
    setName('');
    setIp('');
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Server className="w-6 h-6 text-brand-400" /> Configuration Management Database (CMDB)
          </h1>
          <p className="text-xs text-slate-400">Map enterprise infrastructure CIs, upstream dependencies, and impact topology graphs.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-lg shadow-brand-500/20 transition"
        >
          <Plus className="w-4 h-4" /> Add Configuration Item
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CI Directory list */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-200">CI Directory</h2>
            <span className="text-xs font-mono font-bold text-brand-400">{cis.length} CIs Tracked</span>
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {cis.map((ci) => (
              <div
                key={ci.id}
                onClick={() => setSelectedCi(ci)}
                className={`p-3.5 rounded-xl border cursor-pointer transition space-y-2 ${
                  selectedCi.id === ci.id
                    ? 'bg-brand-600/20 border-brand-500/50 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-xs text-brand-400">{ci.id}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    ci.status === 'OPERATIONAL'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {ci.status}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-100">{ci.name}</div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>{ci.ciClass}</span>
                  <span>{ci.ip}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected CI Details & Dependency Topology Visualizer */}
        <div className="lg:col-span-2 glass-panel p-6 space-y-6">
          <div className="border-b border-slate-800 pb-4 flex justify-between items-start">
            <div>
              <div className="text-xs font-mono font-bold text-brand-400">{selectedCi.id}</div>
              <h2 className="text-xl font-bold text-slate-100">{selectedCi.name}</h2>
              <p className="text-xs text-slate-400">{selectedCi.ciClass} • Environment: {selectedCi.env}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
              selectedCi.status === 'OPERATIONAL'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              {selectedCi.status}
            </span>
          </div>

          {/* Dependency Map Topology */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Upstream & Downstream Relationship Map</h3>
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-6">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center min-w-[140px]">
                  <Network className="w-5 h-5 text-brand-400 mx-auto mb-1" />
                  <div className="text-xs font-bold text-slate-200">api-gateway-envoy</div>
                  <div className="text-[10px] text-slate-500">Upstream Traffic</div>
                </div>

                <ArrowRight className="w-5 h-5 text-slate-600 animate-pulse hidden sm:block" />

                <div className="p-4 rounded-xl bg-brand-900/40 border-2 border-brand-500 text-center min-w-[160px] shadow-lg shadow-brand-500/20">
                  <Server className="w-6 h-6 text-brand-400 mx-auto mb-1" />
                  <div className="text-xs font-extrabold text-white">{selectedCi.name}</div>
                  <div className="text-[10px] text-brand-300 font-mono">{selectedCi.ip}</div>
                </div>

                <ArrowRight className="w-5 h-5 text-slate-600 animate-pulse hidden sm:block" />

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center min-w-[140px]">
                  <Database className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                  <div className="text-xs font-bold text-slate-200">db-postgres-primary</div>
                  <div className="text-[10px] text-slate-500">Depends On DB</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Configuration Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100">Add New Configuration Item (CI)</h2>
            <form onSubmit={handleAddCi} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">CI Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. k8s-prod-cluster-west-1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">CI Class</label>
                  <select
                    value={ciClass}
                    onChange={(e) => setCiClass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="Kubernetes Cluster">Kubernetes Cluster</option>
                    <option value="PostgreSQL Database">PostgreSQL Database</option>
                    <option value="Network Router">Network Router</option>
                    <option value="API Gateway">API Gateway</option>
                    <option value="Redis Cache Server">Redis Cache Server</option>
                    <option value="Virtual Machine">Virtual Machine</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="OPERATIONAL">OPERATIONAL</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="NON_OPERATIONAL">NON_OPERATIONAL</option>
                    <option value="RETIRED">RETIRED</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">IP Address</label>
                  <input
                    type="text"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    placeholder="e.g. 10.240.12.8"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Environment</label>
                  <select
                    value={env}
                    onChange={(e) => setEnv(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="Production">Production</option>
                    <option value="Staging">Staging</option>
                    <option value="Development">Development</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-lg transition"
                >
                  Register Configuration Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
