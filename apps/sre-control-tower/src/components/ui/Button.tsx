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
  primary: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold',
  secondary: 'bg-slate-800/80 hover:bg-slate-700 text-slate-100 border border-slate-700',
  ghost: 'bg-transparent hover:bg-slate-800/60 text-slate-300',
  danger: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40',
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
