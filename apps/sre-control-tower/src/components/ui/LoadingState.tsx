import React from 'react';
import { EmptyState } from './EmptyState';

interface LoadingStateProps {
  loading: boolean;
  empty?: boolean;
  emptyLabel?: string;
  emptyDescription?: string;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}

/** Standardizes the loading / empty / loaded three-way branch every view needs. */
export function LoadingState({
  loading,
  empty,
  emptyLabel = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  skeleton,
  children,
}: LoadingStateProps) {
  if (loading) return <>{skeleton}</>;
  if (empty) return <EmptyState title={emptyLabel} description={emptyDescription} icon={emptyIcon} />;
  return <>{children}</>;
}
