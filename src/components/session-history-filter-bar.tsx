'use client';

import { Filter, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataUseNotice } from '@/components/ui/data-use-notice';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { InputWithIcon } from '@/components/ui/input-with-icon';
import { EFFORT_LABELS, SESSION_CATEGORIES } from '@/lib/types';
import type { SessionHistoryQuickFilter } from '@/lib/session-history-filter';

interface SessionHistoryFilterBarProps {
  searchQuery: string;
  categoryFilter: string;
  effortFilter: string;
  fromDate: string;
  toDate: string;
  filtersOpen: boolean;
  activeFilterCount: number;
  filteredCount: number;
  sessionCount: number;
  averageEffort: number;
  duration: number;
  canUseAi: boolean;
  canSemanticSearch: boolean;
  isSemanticSearching: boolean;
  semanticSearchResultCount: number | null;
  semanticSearchError: string | null;
  onSearchQueryChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onEffortFilterChange: (value: string) => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onToggleFilters: () => void;
  onQuickFilter: (kind: SessionHistoryQuickFilter) => void;
  onClearFilters: () => void;
  onSemanticSearch: () => void;
  onClearSemanticSearch: () => void;
}

function QuickFilters({
  onQuickFilter,
}: {
  onQuickFilter: SessionHistoryFilterBarProps['onQuickFilter'];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick filters">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onQuickFilter('week')}
      >
        This week
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onQuickFilter('month')}
      >
        Last 30 days
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onQuickFilter('high-effort')}
      >
        High effort
      </Button>
    </div>
  );
}

function SessionHistoryAdvancedFilters({
  categoryFilter,
  effortFilter,
  fromDate,
  toDate,
  filtersOpen,
  onCategoryFilterChange,
  onEffortFilterChange,
  onFromDateChange,
  onToDateChange,
  onClearFilters,
}: Pick<
  SessionHistoryFilterBarProps,
  | 'categoryFilter'
  | 'effortFilter'
  | 'fromDate'
  | 'toDate'
  | 'filtersOpen'
  | 'onCategoryFilterChange'
  | 'onEffortFilterChange'
  | 'onFromDateChange'
  | 'onToDateChange'
  | 'onClearFilters'
>) {
  return (
    <div
      className={`mt-3 grid gap-3 @min-[32rem]/filters:grid-cols-2 @min-[62rem]/filters:grid-cols-5 ${filtersOpen ? 'grid' : 'hidden'}`}
    >
      <select
        value={categoryFilter}
        onChange={(event) => onCategoryFilterChange(event.target.value)}
        aria-label="Filter by session type"
        className="h-11 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="all">All session types</option>
        {SESSION_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <select
        value={effortFilter}
        onChange={(event) => onEffortFilterChange(event.target.value)}
        aria-label="Filter by effort level"
        className="h-11 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="all">All effort levels</option>
        {[1, 2, 3, 4, 5].map((effort) => (
          <option key={effort} value={effort}>
            {EFFORT_LABELS[effort as keyof typeof EFFORT_LABELS]}
          </option>
        ))}
      </select>
      <Input
        type="date"
        value={fromDate}
        onChange={(event) => onFromDateChange(event.target.value)}
        aria-label="Sessions from date"
        className="h-11"
      />
      <Input
        type="date"
        value={toDate}
        onChange={(event) => onToDateChange(event.target.value)}
        aria-label="Sessions to date"
        className="h-11"
      />
      <Button
        type="button"
        variant="ghost"
        className="min-h-11"
        onClick={onClearFilters}
      >
        <X className="h-4 w-4" /> Clear filters
      </Button>
    </div>
  );
}

export function SessionHistoryFilterBar(props: SessionHistoryFilterBarProps) {
  return (
    <FilterBar
      label="Filter training history"
      className="@container/filters sticky top-3 z-[1] mb-6 block bg-card/95 p-3 shadow-[0_18px_32px_-28px_hsl(var(--foreground)/0.28)] backdrop-blur sm:p-4"
    >
      <div className="flex flex-col gap-2 @min-[48rem]/filters:flex-row">
        <InputWithIcon
          icon={<Search className="h-4 w-4" />}
          value={props.searchQuery}
          onChange={(event) => props.onSearchQueryChange(event.target.value)}
          placeholder="Search techniques or notes"
          aria-label="Search training history"
          wrapperClassName="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full shrink-0 @min-[48rem]/filters:w-auto"
          onClick={props.onSemanticSearch}
          disabled={
            !props.canUseAi ||
            !props.canSemanticSearch ||
            props.isSemanticSearching ||
            !props.searchQuery.trim()
          }
        >
          <Sparkles className="h-4 w-4" />
          {props.isSemanticSearching ? 'Searching…' : 'Search by meaning'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full shrink-0 @min-[30rem]/filters:w-auto"
          onClick={props.onToggleFilters}
          aria-expanded={props.filtersOpen}
        >
          <Filter className="h-4 w-4" />
          Filters{props.activeFilterCount ? ` (${props.activeFilterCount})` : ''}
        </Button>
      </div>
      <div className="mt-2 space-y-1">
        <DataUseNotice variant="semantic-history-search" />
        {props.semanticSearchResultCount !== null ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <p role="status">
              {props.semanticSearchResultCount > 0
                ? `JEV found ${props.semanticSearchResultCount} likely ${props.semanticSearchResultCount === 1 ? 'match' : 'matches'}.`
                : 'JEV found no likely matches among the sessions checked.'}
            </p>
            <Button
              type="button"
              variant="link"
              size="text"
              className="text-muted-foreground underline underline-offset-2"
              onClick={props.onClearSemanticSearch}
            >
              Clear semantic results
            </Button>
          </div>
        ) : null}
        {props.semanticSearchError ? (
          <p role="alert" className="text-xs text-destructive">
            {props.semanticSearchError}
          </p>
        ) : null}
        {!props.canUseAi ? (
          <p className="text-xs text-muted-foreground">
            Sign in to search training history by meaning.
          </p>
        ) : null}
      </div>
      <QuickFilters onQuickFilter={props.onQuickFilter} />
      <SessionHistoryAdvancedFilters {...props} />
      <p className="mt-3 text-sm text-muted-foreground">
        Showing {props.filteredCount} of {props.sessionCount} sessions · average
        effort {props.averageEffort.toFixed(1)}/5
        {props.duration ? ` · ${props.duration} minutes` : ''}
      </p>
    </FilterBar>
  );
}
