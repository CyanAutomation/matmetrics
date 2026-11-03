'use client';

import { ChevronDown, Filter, Loader2, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataUseNotice } from '@/components/ui/data-use-notice';
import { FilterBar } from '@/components/ui/filter-bar';
import { VanillaActionDisclosure } from '@/components/vanilla-action-disclosure';
import { VanillaHistoryFilters } from '@/components/vanilla-history-filters';
import { InputWithIcon } from '@/components/ui/input-with-icon';
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
  hasUnreviewedDescriptions: boolean;
  isReviewingHistory: boolean;
  reviewProgress: { completed: number; total: number };
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
  onReviewHistory: () => Promise<void>;
}

const quickFilterOptions = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'high-effort', label: 'High effort' },
] as const;

function AiTools({
  searchQuery,
  canUseAi,
  canSemanticSearch,
  isSemanticSearching,
  hasUnreviewedDescriptions,
  isReviewingHistory,
  reviewProgress,
  onSemanticSearch,
  onReviewHistory,
}: Pick<
  SessionHistoryFilterBarProps,
  | 'searchQuery'
  | 'canUseAi'
  | 'canSemanticSearch'
  | 'isSemanticSearching'
  | 'hasUnreviewedDescriptions'
  | 'isReviewingHistory'
  | 'reviewProgress'
  | 'onSemanticSearch'
  | 'onReviewHistory'
>) {
  return (
    <details aria-label="AI tools" className="group rounded-lg border border-border/70 bg-background/75 p-3">
      <summary className="flex min-h-6 cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 marker:content-none">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="flex-1">AI search and review</span>
        {!canUseAi ? (
          <span className="text-xs text-muted-foreground">Sign in required</span>
        ) : null}
        <ChevronDown
          className="h-4 w-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 grid gap-3 @min-[48rem]/filters:grid-cols-2">
        {!canUseAi ? (
          <p className="text-xs text-muted-foreground @min-[48rem]/filters:col-span-2">
            Sign in to use AI search and review.
          </p>
        ) : null}
        <section className="space-y-3 rounded-lg bg-muted/35 p-3">
          <div>
            <h3 className="text-sm font-semibold">Search by meaning</h3>
            <DataUseNotice
              variant="semantic-history-search"
              className="mt-1"
            />
          </div>
          {canUseAi && !searchQuery.trim() ? (
            <p className="text-xs text-muted-foreground">
              Enter a search term above to enable this action.
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full @min-[48rem]/filters:w-auto"
            onClick={onSemanticSearch}
            disabled={
              !canUseAi ||
              !canSemanticSearch ||
              !searchQuery.trim() ||
              isSemanticSearching
            }
          >
            {isSemanticSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isSemanticSearching ? 'Searching…' : 'Search by meaning'}
          </Button>
        </section>
        <section className="space-y-3 rounded-lg bg-muted/35 p-3">
          <div>
            <h3 className="text-sm font-semibold">Review recent sessions</h3>
            <DataUseNotice variant="history" className="mt-1" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full @min-[48rem]/filters:w-auto"
            onClick={() => void onReviewHistory()}
            disabled={
              !canUseAi ||
              isReviewingHistory ||
              !hasUnreviewedDescriptions
            }
          >
            {isReviewingHistory ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isReviewingHistory
              ? `Reviewing ${reviewProgress.completed} of ${reviewProgress.total}`
              : hasUnreviewedDescriptions
                ? 'Review up to 5 sessions'
                : 'This view is reviewed'}
          </Button>
        </section>
      </div>
    </details>
  );
}

function SemanticSearchStatus({
  semanticSearchResultCount,
  semanticSearchError,
  onClearSemanticSearch,
}: Pick<
  SessionHistoryFilterBarProps,
  'semanticSearchResultCount' | 'semanticSearchError' | 'onClearSemanticSearch'
>) {
  return (
    <>
      {semanticSearchResultCount !== null ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <p role="status">
            {semanticSearchResultCount > 0
              ? `JEV found ${semanticSearchResultCount} likely ${semanticSearchResultCount === 1 ? 'match' : 'matches'}.`
              : 'JEV found no likely matches among the sessions checked.'}
          </p>
          <Button
            type="button"
            variant="link"
            size="text"
            className="text-muted-foreground underline underline-offset-2"
            onClick={onClearSemanticSearch}
          >
            Clear semantic results
          </Button>
        </div>
      ) : null}
      {semanticSearchError ? (
        <p role="alert" className="text-xs text-destructive">
          {semanticSearchError}
        </p>
      ) : null}
    </>
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
        <VanillaActionDisclosure
          label="Quick filters"
          options={quickFilterOptions}
          onAction={(value) => {
            if (value === 'week' || value === 'month' || value === 'high-effort') {
              props.onQuickFilter(value);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full shrink-0 @min-[30rem]/filters:w-auto"
          onClick={props.onToggleFilters}
          aria-expanded={props.filtersOpen}
          aria-controls="training-history-filters"
        >
          <Filter className="h-4 w-4" />
          Filters{props.activeFilterCount ? ` (${props.activeFilterCount})` : ''}
        </Button>
      </div>
      <VanillaHistoryFilters
        category={props.categoryFilter}
        effort={props.effortFilter}
        fromDate={props.fromDate}
        toDate={props.toDate}
        open={props.filtersOpen}
        onCategoryChange={props.onCategoryFilterChange}
        onEffortChange={props.onEffortFilterChange}
        onFromDateChange={props.onFromDateChange}
        onToDateChange={props.onToDateChange}
        onClear={props.onClearFilters}
      />
      <AiTools
        searchQuery={props.searchQuery}
        canUseAi={props.canUseAi}
        canSemanticSearch={props.canSemanticSearch}
        isSemanticSearching={props.isSemanticSearching}
        hasUnreviewedDescriptions={props.hasUnreviewedDescriptions}
        isReviewingHistory={props.isReviewingHistory}
        reviewProgress={props.reviewProgress}
        onSemanticSearch={props.onSemanticSearch}
        onReviewHistory={props.onReviewHistory}
      />
      <SemanticSearchStatus
        semanticSearchResultCount={props.semanticSearchResultCount}
        semanticSearchError={props.semanticSearchError}
        onClearSemanticSearch={props.onClearSemanticSearch}
      />
      <p className="text-sm text-muted-foreground">
        Showing {props.filteredCount} of {props.sessionCount} sessions · average
        effort {props.averageEffort.toFixed(1)}/5
        {props.duration ? ` · ${props.duration} minutes` : ''}
      </p>
    </FilterBar>
  );
}
