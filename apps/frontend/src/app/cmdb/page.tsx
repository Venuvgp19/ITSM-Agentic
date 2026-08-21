'use client';

import React, { useState } from 'react';
import {
  Server,
  Database,
  Shield,
  Cpu,
  Network,
  ArrowRight,
  Activity,
  Plus,
  CheckCircle,
  ChevronRight,
  Search,
  Filter,
  Info,
  Layers,
  X
} from 'lucide-react';

const initialCis = [
  { id: 'CI001', name: 'k8s-prod-cluster-east-1', ciClass: 'Kubernetes Cluster', status: 'OPERATIONAL', ip: '10.240.0.12', env: 'Production', category: 'Cloud Infrastructure' },
  { id: 'CI002', name: 'db-postgres-primary', ciClass: 'PostgreSQL Database', status: 'OPERATIONAL', ip: '10.240.4.88', env: 'Production', category: 'Database' },
  { id: 'CI003', name: 'router-border-nyc-01', ciClass: 'Network Router', status: 'MAINTENANCE', ip: '192.168.1.1', env: 'Production', category: 'Networking' },
  { id: 'CI004', name: 'api-gateway-envoy-v2', ciClass: 'API Gateway', status: 'OPERATIONAL', ip: '10.240.2.14', env: 'Production', category: 'Middleware' },
  { id: 'CI005', name: 'control plane', ciClass: 'Virtual Machine', status: 'OPERATIONAL', ip: '192.168.100.101', env: 'Production', category: 'Cloud Infrastructure' },
  { id: 'CI006', name: 'WorkerNode1HL', ciClass: 'Worker Node', status: 'OPERATIONAL', ip: '192.168.100.102', env: 'Production', category: 'Cloud Infrastructure' },
  { id: 'CI007', name: 'worker2OL', ciClass: 'Worker Node', status: 'OPERATIONAL', ip: '192.168.56.11', env: 'Production', category: 'Cloud Infrastructure' },
];

export default function CmdbPage() {
  const [cis, setCis] = useState(initialCis);
  const [selectedCi, setSelectedCi] = useState(initialCis[0]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const filteredCis = cis.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase()) ||
    c.ciClass.toLowerCase().includes(search.toLowerCase()) ||
    c.ip.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. Context Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Service Management</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Configuration Management (CMDB)</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-extrabold flex items-center gap-1.5">
            Configuration Items (CIs)
            <span className="px-1.5 py-0.2 rounded bg-[#f1f5f9] text-[#1e6844] font-mono text-[10px] font-bold border border-[#cbd5e1]">
              {cis.length} Tracked
            </span>
          </span>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-3 py-1.5 bg-[#288554] hover:bg-[#30bb7b] text-white font-bold rounded flex items-center gap-1.5 shadow-sm transition cursor-pointer text-xs"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>New Configuration Item</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto max-w-7xl mx-auto w-full">
        {/* Left: CI Directory */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-4 space-y-4 shadow-sm h-fit">
          <div className="flex justify-between items-center border-b border-[#e2e8f0] pb-3">
            <h2 className="text-xs font-extrabold uppercase text-slate-900">CI Directory Tree</h2>
            <span className="text-xs font-mono font-bold text-[#1e6844]">{filteredCis.length} Records</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter CI list..."
              className="w-full bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#30bb7b] rounded pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
            />
          </div>

          <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
            {filteredCis.map((ci) => (
              <div
                key={ci.id}
                onClick={() => setSelectedCi(ci)}
                className={`p-3 rounded border cursor-pointer transition space-y-1.5 ${
                  selectedCi.id === ci.id
                    ? 'bg-[#e6f7ef] border-[#30bb7b] shadow-xs'
                    : 'bg-white border-[#e2e8f0] hover:bg-[#f8fafc]'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-xs text-[#0284c7]">{ci.id}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.2 rounded ${
                    ci.status === 'OPERATIONAL'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {ci.status}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 truncate">{ci.name}</div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>{ci.ciClass}</span>
                  <span>{ci.ip}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Selected CI Details & Relationship Topology */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-sm space-y-4 border-t-2 border-t-[#30bb7b]">
            <div className="flex justify-between items-center border-b border-[#e2e8f0] pb-3">
              <div>
                <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">CONFIGURATION ITEM RECORD</span>
                <h2 className="text-base font-extrabold text-slate-900 mt-0.5">{selectedCi.name}</h2>
              </div>
              <span className="px-2.5 py-1 rounded text-xs font-bold bg-[#e6f7ef] text-[#1e6844] border border-[#30bb7b]/30">
                {selectedCi.status}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              <div className="p-3 rounded bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">CI Class</span>
                <div className="font-bold text-slate-900">{selectedCi.ciClass}</div>
              </div>

              <div className="p-3 rounded bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">IP Address</span>
                <div className="font-bold text-[#0284c7] font-mono">{selectedCi.ip}</div>
              </div>

              <div className="p-3 rounded bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Environment</span>
                <div className="font-bold text-slate-900">{selectedCi.env}</div>
              </div>
            </div>
          </div>

          {/* Topology Graph */}
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold uppercase text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#30bb7b]" />
              Upstream & Downstream Impact Topology
            </h3>

            <div className="p-5 rounded bg-[#f8fafc] border border-[#e2e8f0] flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="p-3 rounded bg-white border border-[#e2e8f0] text-center w-full md:w-44 shadow-xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Upstream Ingress</div>
                <div className="text-xs font-bold text-slate-900 mt-1">api-gateway-envoy-v2</div>
              </div>

              <ArrowRight className="w-5 h-5 text-slate-400 hidden md:block" />

              <div className="p-3 rounded bg-[#e6f7ef] border border-[#30bb7b] text-center w-full md:w-48 shadow-sm">
                <div className="text-[10px] text-[#1e6844] font-bold uppercase">Target CI</div>
                <div className="text-xs font-black text-slate-900 mt-1">{selectedCi.name}</div>
              </div>

              <ArrowRight className="w-5 h-5 text-slate-400 hidden md:block" />

              <div className="p-3 rounded bg-white border border-[#e2e8f0] text-center w-full md:w-44 shadow-xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Downstream DB</div>
                <div className="text-xs font-bold text-slate-900 mt-1">db-postgres-primary</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add CI Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-sm">Configuration Item - New Record</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCi} className="p-6 space-y-4 text-xs bg-[#f8fafc]">
              <div>
                <label className="block text-slate-700 font-bold mb-1">CI Name / Hostname *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. auth-redis-cluster-01"
                  className="w-full bg-white border border-[#cbd5e1] focus:border-[#30bb7b] rounded p-2 text-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">CI Class</label>
                  <select
                    value={ciClass}
                    onChange={(e) => setCiClass(e.target.value)}
                    className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-slate-900 focus:outline-none"
                  >
                    <option value="Kubernetes Cluster">Kubernetes Cluster</option>
                    <option value="PostgreSQL Database">PostgreSQL Database</option>
                    <option value="Network Router">Network Router</option>
                    <option value="API Gateway">API Gateway</option>
                    <option value="Virtual Machine">Virtual Machine</option>
                    <option value="Worker Node">Worker Node</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">IP Address</label>
                  <input
                    type="text"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    placeholder="10.240.0.100"
                    className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-slate-900 font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold transition shadow-sm cursor-pointer"
                >
                  Create CI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
