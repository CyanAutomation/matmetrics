import type { ComponentPropsWithoutRef } from 'react';

import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/ui/filter-bar';
import { cn } from '@/lib/utils';

type DataToolbarProps = ComponentPropsWithoutRef<'div'> & { label: string };

/** Shared search, filter, and result-summary frame for data-heavy pages. */
export function DataToolbar({
  children,
  className,
  label,
  ...props
}: DataToolbarProps) {
  return (
    <FilterBar {...props} label={label} className={cn('items-end', className)}>
      {children}
    </FilterBar>
  );
}

type ActiveFilter = { label: string; value?: string };

export function DataToolbarSummary({
  filteredCount,
  totalCount,
  itemLabel,
  activeFilters = [],
  className,
}: {
  filteredCount: number;
  totalCount: number;
  itemLabel: string;
  activeFilters?: ActiveFilter[];
  className?: string;
}) {
  const activeFilterSummary = activeFilters.length
    ? `${activeFilters.length} active filter${activeFilters.length === 1 ? '' : 's'}`
    : 'No active filters';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg bg-secondary/55 px-3 py-2 text-sm',
        className
      )}
    >
      <span className="font-medium">
        Showing {filteredCount} of {totalCount} {itemLabel}
      </span>
      <span className="text-muted-foreground">• {activeFilterSummary}</span>
      {activeFilters.map((filter) => (
        <Badge key={`${filter.label}:${filter.value ?? ''}`} variant="outline">
          {filter.label}
          {filter.value ? `: ${filter.value}` : ''}
        </Badge>
      ))}
    </div>
  );
}

export function DataList({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      data-slot="data-list"
      className={cn(
        'overflow-hidden rounded-xl bg-[hsl(var(--color-surface-container-lowest))] shadow-[0_12px_24px_-24px_hsl(var(--foreground)/0.4)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DataListRow({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      data-slot="data-list-row"
      className={cn(
        'group flex min-h-16 items-center justify-between gap-3 px-3 py-3 transition-colors odd:bg-[hsl(var(--color-surface-container-low)/0.55)] hover:bg-[hsl(var(--color-primary-fixed)/0.35)] focus-within:bg-[hsl(var(--color-primary-fixed)/0.5)]',
        className
      )}
    >
      {children}
    </div>
  );
}
