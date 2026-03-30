import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function PluginToolbar({ children, className }: PluginToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        className
      )}
    >
      {children}
    </div>
  );
}
