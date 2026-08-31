import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

type FilterBarProps = ComponentPropsWithoutRef<'div'> & {
  label: string;
};

/** A responsive, labelled filter region shared by data-heavy product views. */
export function FilterBar({
  children,
  className,
  label,
  ...props
}: FilterBarProps) {
  return (
    <div
      {...props}
      role="region"
      aria-label={label}
      className={cn(
        'grid gap-3 rounded-2xl bg-card p-4 shadow-[0_14px_28px_-26px_hsl(var(--foreground)/0.18)] sm:grid-cols-2 lg:grid-cols-5',
        className
      )}
    >
      {children}
    </div>
  );
}
