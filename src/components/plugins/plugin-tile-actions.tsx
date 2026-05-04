import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginTileActionsProps = {
  leadingActions?: ReactNode;
  menuAction?: ReactNode;
  className?: string;
};

export function PluginTileActions({
  leadingActions,
  menuAction,
  className,
}: PluginTileActionsProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {leadingActions}
      {menuAction ? (
        <div className="ml-auto transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {menuAction}
        </div>
      ) : null}
    </div>
  );
}
