import React from 'react';
import { cx } from './cx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'active';
  padding?: 'sm' | 'md' | 'none';
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
};

export function Card({ variant = 'default', padding = 'md', className, children, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        variant === 'active' ? 'pro-card-active' : 'pro-card',
        'rounded-2xl',
        paddingMap[padding],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
