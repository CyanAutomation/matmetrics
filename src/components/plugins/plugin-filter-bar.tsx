import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginFilterBarProps = {
  children: ReactNode;
  className?: string;
};

export function PluginFilterBar({ children, className }: PluginFilterBarProps) {
  return (
    <div className={cn('grid gap-3 lg:grid-cols-5', className)}>{children}</div>
  );
}
