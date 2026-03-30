import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginBulkActionsProps = {
  selectedCount?: number;
  itemLabel?: string;
  disabledMessage?: string;
  children: ReactNode;
  className?: string;
};

export function PluginBulkActions({
  selectedCount,
  itemLabel = 'item',
  disabledMessage,
  children,
  className,
}: PluginBulkActionsProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {typeof selectedCount === 'number' ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {selectedCount} {itemLabel}
          {selectedCount === 1 ? '' : 's'} selected
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {disabledMessage ? (
        <p className="text-xs text-muted-foreground">{disabledMessage}</p>
      ) : null}
    </div>
  );
}
