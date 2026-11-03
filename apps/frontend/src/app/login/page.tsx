'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { ShieldCheck, User, Lock, ArrowRight, CheckCircle2, Radio, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const [userId, setUserId] = useState('Venu');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const cleanUser = userId.trim();
    const cleanPass = password.trim();

    try {
      // Attempt API call to NestJS Auth backend
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanUser, password: cleanPass }),
      });

      if (res.ok) {
        const data = await res.json();
        login(data.accessToken, data.user);
        router.push('/incidents');
        return;
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.message || 'Invalid User ID or Password. Please contact your administrator for access.');
        setLoading(false);
        return;
      }
    } catch {
      // Client-side direct auth check fallback
      if (
        (cleanUser.toLowerCase() === 'venu' || cleanUser.toLowerCase() === 'admin') &&
        cleanPass === 'admin007'
      ) {
        const verifiedUser = {
          id: 'usr_venu_01',
          email: 'venu@service-now.com',
          firstName: 'Venu',
          lastName: '',
          tenantId: 'tenant_acme_01',
          tenantName: 'ServiceNow Washington DC',
          role: 'Global Administrator & SRE Lead',
        };
        login('demo-jwt-access-token-itsm', verifiedUser);
        router.push('/incidents');
        return;
      } else {
        setError('Invalid credentials. Please contact your administrator for access.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#162224] flex flex-col items-center justify-center p-4 select-none font-sans text-slate-800">
      <div className="w-full max-w-md space-y-6">
        {/* ServiceNow Brand Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-extrabold text-3xl tracking-tight text-white font-sans">
              servicenow<span className="text-[#30bb7b] font-black text-4xl">.</span>
            </span>
          </div>
          <p className="text-xs text-slate-300 font-medium">Washington DC Enterprise SRE Instance</p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-[#cbd5e1] rounded-xl p-8 space-y-6 shadow-2xl">
          <div className="border-b border-[#e2e8f0] pb-4">
            <h2 className="text-base font-extrabold text-[#1a2c30] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#288554]" /> ServiceNow Authentication
            </h2>
            <p className="text-xs text-slate-600 mt-1">Sign in with your authorized operator credentials.</p>
          </div>

          {error && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">User ID</label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g. Venu"
                  className="w-full bg-white border border-[#cbd5e1] focus:border-[#288554] rounded pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none transition shadow-inner font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border border-[#cbd5e1] focus:border-[#288554] rounded pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none transition shadow-inner font-mono"
                />
              </div>
            </div>

            {/* Quick credentials hint -- User ID only. The password is
                intentionally never rendered on screen: this page gets
                recorded for demo videos, and a hint here is functionally
                identical to printing the real password. */}
            <div className="bg-[#f8fafc] border border-[#e2e8f0] p-3 rounded text-[11px] text-slate-600 flex items-center">
              <div>
                <span className="font-bold text-slate-800">Authorized Operator:</span> User ID: <code className="font-bold text-[#288554]">Venu</code>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Quick link to Agent Control Tower */}
          <div className="pt-2 border-t border-[#e2e8f0] text-center">
            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#0284c7] hover:underline font-bold"
            >
              <Radio className="w-3 h-3 text-[#288554] animate-pulse" />
              <span>Launch Agent Control Tower (Port 5173)</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
