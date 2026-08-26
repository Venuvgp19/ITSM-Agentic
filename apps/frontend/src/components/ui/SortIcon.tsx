import React from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

export function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 text-slate-400" />;
  return dir === 'asc' ? (
    <ArrowUp className="w-3 h-3 text-[#288554]" />
  ) : (
    <ArrowDown className="w-3 h-3 text-[#288554]" />
  );
}
