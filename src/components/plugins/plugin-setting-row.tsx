import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginSettingRowProps = {
  title: ReactNode;
  description: ReactNode;
  control?: ReactNode;
  badge?: ReactNode;
  className?: string;
};

/** A predictable label, explanation and trailing-control layout for settings. */
export function PluginSettingRow({
  title,
  description,
  control,
  badge,
  className,
}: PluginSettingRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-4',
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold">{title}</div>
          {badge}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </div>
  );
}
