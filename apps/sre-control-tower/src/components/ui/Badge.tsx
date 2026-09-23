import React from 'react';
import { cx } from './cx';

export type BadgeTone = 'low' | 'medium' | 'high' | 'critical' | 'success' | 'pending' | 'error' | 'neutral';

export const toneClasses: Record<BadgeTone, string> = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40',
  high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/40',
  critical: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/40',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40',
  pending: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/40',
  error: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/40',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/40',
};

const toneTopBorder: Record<BadgeTone, string> = {
  low: 'border-t-emerald-500',
  medium: 'border-t-amber-500',
  high: 'border-t-orange-500',
  critical: 'border-t-rose-500',
  success: 'border-t-emerald-500',
  pending: 'border-t-cyan-500',
  error: 'border-t-rose-500',
  neutral: 'border-t-slate-500',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
}

/** Single source of truth for risk/status coloring across the app. */
export function Badge({ tone, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-2xs font-bold uppercase tracking-wide whitespace-nowrap',
        toneClasses[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** For components that accent a card's top border instead of (or alongside) a Badge. */
export function topBorderAccent(tone: BadgeTone): string {
  return cx('border-t-2', toneTopBorder[tone]);
}

/** Maps a free-text risk/status string (LOW/MEDIUM/HIGH/CRITICAL, etc.) onto a BadgeTone. */
export function riskTone(risk?: string | null): BadgeTone {
  switch ((risk || '').toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    default:
      return 'neutral';
  }
}
