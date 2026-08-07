import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginToolbarProps = {
  children?: ReactNode;
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
  className?: string;
};

export function PluginToolbar({
  children,
  leadingActions,
  trailingActions,
  className,
}: PluginToolbarProps) {
  return (
    <div
      data-slot="plugin-toolbar"
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        className
      )}
    >
      {leadingActions ? (
        <div
          role="group"
          aria-label="Leading toolbar actions"
          data-slot="plugin-toolbar-leading-actions"
        >
          {leadingActions}
        </div>
      ) : null}
      {children}
      {trailingActions ? (
        <div
          role="group"
          aria-label="Trailing toolbar actions"
          data-slot="plugin-toolbar-trailing-actions"
        >
          {trailingActions}
        </div>
      ) : null}
    </div>
  );
}
