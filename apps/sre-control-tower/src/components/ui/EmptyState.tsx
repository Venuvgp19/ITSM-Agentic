import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 gap-2 text-slate-500 dark:text-slate-500">
      <Icon className="w-8 h-8 text-slate-400 dark:text-slate-600" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">{title}</p>
      {description && <p className="text-2xs text-slate-500 max-w-sm dark:text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
