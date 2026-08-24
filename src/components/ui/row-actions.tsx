import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type RowActionsProps = {
  children: ReactNode;
  overflow: ReactNode;
  className?: string;
};

/** Keeps row controls in one trailing cluster at every screen size. */
export function RowActions({ children, overflow, className }: RowActionsProps) {
  return (
    <div className={cn('ml-auto flex shrink-0 items-center gap-2', className)}>
      <div className="hidden items-center gap-2 sm:flex">{children}</div>
      {overflow}
    </div>
  );
}
