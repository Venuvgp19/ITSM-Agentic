import React from 'react';

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function SectionHeading({ title, subtitle, actions }: SectionHeadingProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-base font-bold text-slate-100 tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
