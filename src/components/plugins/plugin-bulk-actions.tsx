import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginBulkActionsProps = {
  selectedCount?: number;
  itemLabel?: string;
  isDisabled?: boolean;
  disabledMessage?: string;
  children?: ReactNode;
  className?: string;
};

export function PluginBulkActions({
  selectedCount,
  itemLabel = 'item',
  isDisabled = false,
  disabledMessage,
  children,
  className,
}: PluginBulkActionsProps) {
  const disabledMessageId = useId();
  const resolvedDisabledMessage =
    disabledMessage ??
    (isDisabled
      ? 'Bulk actions are unavailable until selection criteria is met.'
      : null);

  return (
    <div
      className={cn(
        'space-y-2 rounded-md border border-border bg-card/60 p-3',
        className
      )}
    >
      {typeof selectedCount === 'number' ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {selectedCount} {itemLabel}
          {selectedCount === 1 ? '' : 's'} selected
        </p>
      ) : null}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Bulk actions"
        aria-describedby={
          resolvedDisabledMessage ? disabledMessageId : undefined
        }
      >
        {children}
      </div>
      {resolvedDisabledMessage ? (
        <p id={disabledMessageId} className="text-xs text-muted-foreground">
          {resolvedDisabledMessage}
        </p>
      ) : null}
    </div>
  );
}
