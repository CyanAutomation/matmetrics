import type { ReactNode } from 'react';

import { PluginEmptyState } from '@/components/plugins/plugin-state';
import {
  DataList,
  DataListRow,
  DataToolbar,
  DataToolbarSummary,
} from '@/components/ui/data-toolbar';
import { cn } from '@/lib/utils';

type PluginDataSurfaceFilterRowProps = {
  children: ReactNode;
  className?: string;
};

export function PluginDataSurfaceFilterRow({
  children,
  className,
}: PluginDataSurfaceFilterRowProps) {
  return (
    <DataToolbar
      label="Filters"
      data-slot="plugin-filter-row"
      className={cn('items-end', className)}
    >
      {children}
    </DataToolbar>
  );
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
  return (
    <DataToolbarSummary
      filteredCount={filteredCount}
      totalCount={totalCount}
      itemLabel={itemLabel}
      activeFilters={activeFilters}
      className={className}
    />
  );
}

/** @deprecated Use DataList directly for new product surfaces. */
export const PluginDataList = DataList;
/** @deprecated Use DataListRow directly for new product surfaces. */
export const PluginDataListRow = DataListRow;

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
  const hasDetail = Boolean(detail);

  return (
    <div
      className={cn('grid gap-4', hasDetail ? 'lg:grid-cols-2' : '', className)}
    >
      <div className={listClassName}>{list}</div>
      {hasDetail ? <div className={detailClassName}>{detail}</div> : null}
    </div>
  );
}
