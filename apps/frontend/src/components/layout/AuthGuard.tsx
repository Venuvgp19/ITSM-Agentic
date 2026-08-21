'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, token, init } = useAuthStore();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    init();
    setHasMounted(true);
  }, [init]);

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!hasMounted) return;

    if (!isAuthenticated && !isLoginPage) {
      router.replace('/login');
    } else if (isAuthenticated && isLoginPage) {
      router.replace('/incidents');
    }
  }, [hasMounted, isAuthenticated, isLoginPage, router]);

  if (!hasMounted) {
    return (
      <div className="min-h-screen bg-[#162224] flex items-center justify-center text-white">
        <div className="w-8 h-8 rounded-full border-2 border-[#30bb7b] border-t-transparent animate-spin"></div>
      </div>
    );
  }

  // On Login page, render login without Topbar and Sidebar
  if (isLoginPage) {
    return <>{children}</>;
  }

  // If not logged in and not yet redirected
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#162224] flex items-center justify-center text-white">
        <div className="w-8 h-8 rounded-full border-2 border-[#30bb7b] border-t-transparent animate-spin"></div>
      </div>
    );
  }

  // Authenticated workspace
  return (
    <div className="bg-[#f3f4f6] text-[#1e293b] flex flex-col h-screen overflow-hidden antialiased font-sans">
      <Topbar />
      <div className="flex-1 flex min-w-0 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-[#f8fafc] text-[#1e293b]">
          {children}
        </main>
      </div>
    </div>
  );
}
