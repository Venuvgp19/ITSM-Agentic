import React from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface BaseProps {
  variant?: Variant;
  size?: Size;
}

type IconOnlyProps = BaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    iconOnly: true;
    /** Required for icon-only buttons so they have an accessible name. */
    'aria-label': string;
  };

type RegularProps = BaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    iconOnly?: false;
  };

export type ButtonProps = IconOnlyProps | RegularProps;

const variantClasses: Record<Variant, string> = {
  primary: 'bg-cyan-600 hover:bg-cyan-500 text-white font-bold dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-700',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 dark:hover:bg-slate-800/60 dark:text-slate-300',
  danger: 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 dark:text-rose-300 dark:border-rose-500/40',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-2xs',
  md: 'h-9 px-4 text-xs',
};

const iconOnlySizeClasses: Record<Size, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
};

export function Button({ variant = 'secondary', size = 'sm', iconOnly, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        variantClasses[variant],
        iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
