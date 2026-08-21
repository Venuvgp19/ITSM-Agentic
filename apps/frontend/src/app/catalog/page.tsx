'use client';

import React, { useState } from 'react';
import {
  ShoppingBag,
  Laptop,
  ShieldCheck,
  Key,
  Cloud,
  CheckCircle,
  Search,
  ChevronRight,
  X,
  Plus
} from 'lucide-react';

const catalogItems = [
  { id: 'CAT01', category: 'Hardware Request', title: 'MacBook Pro 16" M3 Max', description: 'Enterprise developer workstation with 36GB Unified Memory & 1TB SSD.', price: '$2,499.00', icon: Laptop },
  { id: 'CAT02', category: 'Software Access', title: 'GitHub Enterprise & Copilot', description: 'License provision for enterprise GitHub repository access and AI pairing.', price: '$38.00 / mo', icon: Key },
  { id: 'CAT03', category: 'Cloud Resources', title: 'AWS Sandboxed Dev Account', description: 'Isolated AWS account with $500 monthly budget guardrails for testing.', price: '$500.00 / mo', icon: Cloud },
  { id: 'CAT04', category: 'Security & Access', title: 'YubiKey 5C NFC Security Key', description: 'Hardware FIDO2 MFA security key for passwordless authentication.', price: '$55.00', icon: ShieldCheck },
];

export default function CatalogPage() {
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const handleOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderSuccess(true);
    setTimeout(() => {
      setOrderSuccess(false);
      setSelectedItem(null);
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. Context Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-4 py-2.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Service Management</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Service Catalog & Self-Service</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-extrabold flex items-center gap-1.5">
            Catalog Items
            <span className="px-1.5 py-0.2 rounded bg-[#f1f5f9] text-[#1e6844] font-mono text-[10px] font-bold border border-[#cbd5e1]">
              {catalogItems.length} Offerings
            </span>
          </span>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl mx-auto w-full">
        {/* Banner */}
        <div className="bg-white border border-[#e2e8f0] p-5 rounded-lg shadow-sm border-l-4 border-l-[#30bb7b]">
          <div className="text-[10px] font-bold text-[#1e6844] uppercase tracking-wider mb-1 font-mono">
            Self-Service Request Fulfillment
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">IT Service Catalog Portal</h1>
          <p className="text-xs text-slate-500 mt-1">
            Order standard hardware, request software licenses, and initiate automated approval workflows.
          </p>
        </div>

        {/* Catalog Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {catalogItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="bg-white border border-[#e2e8f0] hover:border-[#30bb7b] rounded-lg p-5 space-y-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-all"
              >
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-[#e6f7ef] border border-[#30bb7b]/30 flex items-center justify-center text-[#1e6844]">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.category}</span>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">{item.title}</h3>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{item.description}</p>
                </div>

                <div className="pt-3 border-t border-[#e2e8f0] flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-900">{item.price}</span>
                  <button
                    onClick={() => setSelectedItem(item)}
                    className="px-3 py-1.5 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold text-xs transition cursor-pointer shadow-xs"
                  >
                    Request Item
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Request Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            {orderSuccess ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle className="w-12 h-12 text-[#288554] mx-auto animate-bounce" />
                <h3 className="text-base font-bold text-slate-900">Service Request Submitted!</h3>
                <p className="text-xs text-slate-600">Request REQ0008420 created. Multi-level approval workflow initiated.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
                  <h2 className="text-sm font-bold text-slate-900">Request Item: {selectedItem.title}</h2>
                  <button onClick={() => setSelectedItem(null)} className="p-1 text-slate-400 hover:text-slate-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <form onSubmit={handleOrder} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Business Justification *</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Explain why this request is needed for your project..."
                      className="w-full bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#30bb7b] rounded p-2.5 text-xs text-slate-900 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedItem(null)}
                      className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold transition shadow-sm cursor-pointer"
                    >
                      Submit Request
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
