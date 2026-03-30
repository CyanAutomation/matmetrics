import type { ReactNode } from 'react';

import { PluginFilterBar } from '@/components/plugins/plugin-filter-bar';
import { PluginEmptyState } from '@/components/plugins/plugin-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PluginDataSurfaceFilterRowProps = {
  children: ReactNode;
  className?: string;
};

export function PluginDataSurfaceFilterRow({
  children,
  className,
}: PluginDataSurfaceFilterRowProps) {
  return <PluginFilterBar className={className}>{children}</PluginFilterBar>;
}

type PluginDataSurfaceActiveFilter = {
  label: string;
  value?: string;
};

type PluginDataSurfaceSummaryStripProps = {
  filteredCount: number;
  totalCount: number;
  itemLabel: string;
  activeFilters?: PluginDataSurfaceActiveFilter[];
  className?: string;
};

export function PluginDataSurfaceSummaryStrip({
  filteredCount,
  totalCount,
  itemLabel,
  activeFilters = [],
  className,
}: PluginDataSurfaceSummaryStripProps) {
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border bg-secondary/40 px-3 py-2 text-sm',
        className
      )}
    >
      <span className="font-medium">
        Showing {filteredCount} of {totalCount} {itemLabel}
      </span>
      {hasActiveFilters ? (
        <>
          <span className="text-muted-foreground">• Active filters</span>
          {activeFilters.map((filter) => (
            <Badge
              key={`${filter.label}:${filter.value ?? ''}`}
              variant="outline"
            >
              {filter.label}
              {filter.value ? `: ${filter.value}` : ''}
            </Badge>
          ))}
        </>
      ) : null}
    </div>
  );
}

type PluginEmptyFilteredResultsProps = {
  title: string;
  description: ReactNode;
  clearLabel?: string;
  onClear?: () => void;
  icon?: ReactNode;
  className?: string;
};

export function PluginEmptyFilteredResults({
  title,
  description,
  clearLabel,
  onClear,
  icon,
  className,
}: PluginEmptyFilteredResultsProps) {
  return (
    <PluginEmptyState
      title={title}
      description={description}
      ctaLabel={clearLabel}
      onCta={onClear}
      icon={icon}
      className={cn('border-dashed bg-secondary/35', className)}
    />
  );
}

type PluginDataSurfaceSplitProps = {
  list: ReactNode;
  detail?: ReactNode;
  className?: string;
  listClassName?: string;
  detailClassName?: string;
};

export function PluginDataSurfaceSplit({
  list,
  detail,
  className,
  listClassName,
  detailClassName,
}: PluginDataSurfaceSplitProps) {
  return (
    <div className={cn('grid gap-4 lg:grid-cols-2', className)}>
      <div className={listClassName}>{list}</div>
      {detail ? <div className={detailClassName}>{detail}</div> : null}
    </div>
  );
}
