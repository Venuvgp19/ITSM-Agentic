import React from 'react';
import './globals.css';
import { AuthGuard } from '@/components/layout/AuthGuard';

export const metadata = {
  title: 'ServiceNow Enterprise ITSM Platform',
  description: 'Enterprise IT Service Management Platform powered by ServiceNow Experience and Autonomous AI Agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#162224] text-[#1e293b] antialiased font-sans">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
