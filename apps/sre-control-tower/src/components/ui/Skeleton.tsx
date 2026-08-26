import React from 'react';
import { cx } from './cx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse motion-reduce:animate-none rounded-md bg-slate-800/70', className)} />;
}

export function SkeletonCard() {
  return (
    <div className="pro-card rounded-2xl p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}
