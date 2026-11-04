import type { SessionHistoryQuickFilter } from '../lib/session-history-filter';
import { actionDisclosureHtml, mountActionDisclosure } from './action-disclosure';
import { historyFiltersHtml, mountHistoryFilters, type HistoryFiltersProps } from './history-filters';
import { escapeHtml, type ComponentController } from './component';
import { dataUseNoticeHtml } from './data-use-notice';
import { buttonHtml, mountButton, type ButtonProps } from './button';
import { mountSearchField, searchFieldHtml } from './search-field';

export interface SessionHistoryFilterBarProps {
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

function searchProps(props: SessionHistoryFilterBarProps) {
  return {
    id: 'session-history-search',
    label: 'Search training history',
    value: props.searchQuery,
    placeholder: 'Search techniques or notes',
    onInput: props.onSearchQueryChange,
  };
}

function historyFiltersProps(
  props: SessionHistoryFilterBarProps
): HistoryFiltersProps {
  return {
    category: props.categoryFilter,
    effort: props.effortFilter,
    fromDate: props.fromDate,
    toDate: props.toDate,
    open: props.filtersOpen,
    onCategoryChange: props.onCategoryFilterChange,
    onEffortChange: props.onEffortFilterChange,
    onFromDateChange: props.onFromDateChange,
    onToDateChange: props.onToDateChange,
    onClear: props.onClearFilters,
  };
}

function quickFilterProps(
  props: SessionHistoryFilterBarProps
): Parameters<typeof actionDisclosureHtml>[0] {
  return {
    label: 'Quick filters',
    options: quickFilterOptions,
    onAction(value) {
      if (value === 'week' || value === 'month' || value === 'high-effort') {
        props.onQuickFilter(value);
      }
    },
  };
}

function filterToggleProps(
  props: SessionHistoryFilterBarProps
): ButtonProps {
  return {
    label: props.activeFilterCount
      ? `Filters (${props.activeFilterCount})`
      : 'Filters',
    icon: 'filter',
    variant: 'outline',
    ariaExpanded: props.filtersOpen,
    ariaControls: 'training-history-filters',
    dataAction: 'toggle-filters',
    onClick: props.onToggleFilters,
  };
}

function semanticSearchProps(
  props: SessionHistoryFilterBarProps
): ButtonProps {
  return {
    label: props.isSemanticSearching ? 'Searching…' : 'Search by meaning',
    icon: props.isSemanticSearching ? 'loader' : 'sparkles',
    variant: 'outline',
    disabled:
      !props.canUseAi ||
      !props.canSemanticSearch ||
      !props.searchQuery.trim() ||
      props.isSemanticSearching,
    ariaBusy: props.isSemanticSearching,
    dataAction: 'semantic-search',
    onClick: props.onSemanticSearch,
  };
}

function reviewHistoryProps(
  props: SessionHistoryFilterBarProps
): ButtonProps {
  return {
    label: props.isReviewingHistory
      ? `Reviewing ${props.reviewProgress.completed} of ${props.reviewProgress.total}`
      : props.hasUnreviewedDescriptions
        ? 'Review up to 5 sessions'
        : 'This view is reviewed',
    icon: props.isReviewingHistory ? 'loader' : 'sparkles',
    variant: 'outline',
    disabled:
      !props.canUseAi ||
      props.isReviewingHistory ||
      !props.hasUnreviewedDescriptions,
    ariaBusy: props.isReviewingHistory,
    dataAction: 'review-history',
    onClick: () => {
      void props.onReviewHistory();
    },
  };
}

function clearSemanticProps(
  props: SessionHistoryFilterBarProps
): ButtonProps {
  return {
    label: 'Clear semantic results',
    variant: 'link',
    dataAction: 'clear-semantic',
    onClick: props.onClearSemanticSearch,
  };
}

function buttonController(
  button: HTMLButtonElement,
  props: ButtonProps
): ComponentController<ButtonProps> {
  return mountButton(button, props);
}

function resultMessage(count: number): string {
  if (count === 0) return 'JEV found no likely matches among the sessions checked.';
  return `JEV found ${count} likely ${count === 1 ? 'match' : 'matches'}.`;
}

function summaryMessage(props: SessionHistoryFilterBarProps): string {
  return `Showing ${props.filteredCount} of ${props.sessionCount} sessions · average effort ${props.averageEffort.toFixed(1)}/5${props.duration ? ` · ${props.duration} minutes` : ''}`;
}

/** Render the reusable history toolbar with native controls and disclosures. */
export function sessionHistoryFilterBarHtml(
  props: SessionHistoryFilterBarProps
): string {
  const filterToggle = buttonHtml(filterToggleProps(props), 'ui-session-history-filter-bar__filter-toggle');
  const semanticButton = buttonHtml(semanticSearchProps(props), 'ui-session-history-filter-bar__ai-action');
  const reviewButton = buttonHtml(reviewHistoryProps(props), 'ui-session-history-filter-bar__ai-action');
  const clearSemanticButton = buttonHtml(clearSemanticProps(props), 'ui-session-history-filter-bar__clear-semantic');
  const resultCount = props.semanticSearchResultCount;

  return `<div class="ui-session-history-filter-bar" role="region" aria-label="Filter training history">
    <div class="ui-session-history-filter-bar__toolbar">
      <div class="ui-session-history-filter-bar__search" data-search-field-host>${searchFieldHtml(searchProps(props))}</div>
      <div class="ui-session-history-filter-bar__quick-filters">${actionDisclosureHtml(quickFilterProps(props))}</div>
      ${filterToggle}
    </div>
    ${historyFiltersHtml(historyFiltersProps(props))}
    <details class="ui-session-history-filter-bar__ai-tools" aria-label="AI tools">
      <summary class="ui-session-history-filter-bar__ai-summary">
        <svg aria-hidden="true" class="ui-session-history-filter-bar__sparkle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/></svg>
        <span class="ui-session-history-filter-bar__ai-title">AI search and review</span>
        <span class="ui-session-history-filter-bar__sign-in" data-ai-sign-in${props.canUseAi ? ' hidden' : ''}>Sign in required</span>
        <svg aria-hidden="true" class="ui-session-history-filter-bar__ai-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div class="ui-session-history-filter-bar__ai-grid">
        <p class="ui-session-history-filter-bar__ai-guidance" data-ai-guidance${props.canUseAi ? ' hidden' : ''}>Sign in to use AI search and review.</p>
        <section class="ui-session-history-filter-bar__ai-section">
          <div>
            <h3 class="ui-session-history-filter-bar__section-title">Search by meaning</h3>
            ${dataUseNoticeHtml({ variant: 'semantic-history-search' })}
          </div>
          <p class="ui-session-history-filter-bar__query-guidance" data-query-guidance${!props.canUseAi || props.searchQuery.trim() ? ' hidden' : ''}>Enter a search term above to enable this action.</p>
          ${semanticButton}
        </section>
        <section class="ui-session-history-filter-bar__ai-section">
          <div>
            <h3 class="ui-session-history-filter-bar__section-title">Review recent sessions</h3>
            ${dataUseNoticeHtml({ variant: 'history' })}
          </div>
          ${reviewButton}
        </section>
      </div>
    </details>
    <div class="ui-session-history-filter-bar__status">
      <div class="ui-session-history-filter-bar__semantic-results" data-semantic-results role="status"${resultCount === null ? ' hidden' : ''}>
        <span data-semantic-result-copy>${resultCount === null ? '' : escapeHtml(resultMessage(resultCount))}</span>
        ${clearSemanticButton}
      </div>
      <p class="ui-session-history-filter-bar__semantic-error" data-semantic-error role="alert"${props.semanticSearchError ? '' : ' hidden'}>${escapeHtml(props.semanticSearchError ?? '')}</p>
    </div>
    <p class="ui-session-history-filter-bar__summary" data-history-summary>${escapeHtml(summaryMessage(props))}</p>
  </div>`;
}

export function mountSessionHistoryFilterBar(
  root: HTMLElement,
  initialProps: SessionHistoryFilterBarProps
): ComponentController<SessionHistoryFilterBarProps> {
  if (!root.matches('[role="region"][aria-label="Filter training history"]')) {
    throw new Error('History filter bar markup is incomplete');
  }

  const searchHost = root.querySelector<HTMLElement>('[data-search-field-host]');
  const quickFilterElement = root.querySelector<HTMLDetailsElement>(
    'details[aria-label="Quick filters"]'
  );
  const advancedFilters = root.querySelector<HTMLElement>(
    '#training-history-filters'
  );
  const filterToggleButton = root.querySelector<HTMLButtonElement>(
    '[data-ui-action="toggle-filters"]'
  );
  const semanticSearchButton = root.querySelector<HTMLButtonElement>(
    '[data-ui-action="semantic-search"]'
  );
  const reviewHistoryButton = root.querySelector<HTMLButtonElement>(
    '[data-ui-action="review-history"]'
  );
  const clearSemanticButton = root.querySelector<HTMLButtonElement>(
    '[data-ui-action="clear-semantic"]'
  );
  const resultRegion = root.querySelector<HTMLElement>('[data-semantic-results]');
  const resultCopy = root.querySelector<HTMLElement>('[data-semantic-result-copy]');
  const semanticError = root.querySelector<HTMLElement>('[data-semantic-error]');
  const summary = root.querySelector<HTMLElement>('[data-history-summary]');
  const signInLabel = root.querySelector<HTMLElement>('[data-ai-sign-in]');
  const aiGuidance = root.querySelector<HTMLElement>('[data-ai-guidance]');
  const queryGuidance = root.querySelector<HTMLElement>('[data-query-guidance]');

  if (
    !searchHost ||
    !quickFilterElement ||
    !advancedFilters ||
    !filterToggleButton?.querySelector('[data-button-label]') ||
    !semanticSearchButton?.querySelector('[data-button-label]') ||
    !reviewHistoryButton?.querySelector('[data-button-label]') ||
    !clearSemanticButton?.querySelector('[data-button-label]') ||
    !resultRegion ||
    !resultCopy ||
    !semanticError ||
    !summary ||
    !signInLabel ||
    !aiGuidance ||
    !queryGuidance
  ) {
    throw new Error('History filter bar markup is incomplete');
  }

  const filterToggle = buttonController(
    filterToggleButton,
    filterToggleProps(initialProps)
  );
  const semanticSearch = buttonController(
    semanticSearchButton,
    semanticSearchProps(initialProps)
  );
  const reviewHistory = buttonController(
    reviewHistoryButton,
    reviewHistoryProps(initialProps)
  );
  const clearSemantic = buttonController(
    clearSemanticButton,
    clearSemanticProps(initialProps)
  );
  const search = mountSearchField(searchHost, searchProps(initialProps));
  const quickFilters = mountActionDisclosure(
    quickFilterElement,
    quickFilterProps(initialProps)
  );
  const filters = mountHistoryFilters(
    advancedFilters,
    historyFiltersProps(initialProps)
  );

  const update = (next: SessionHistoryFilterBarProps) => {
    search.update(searchProps(next));
    quickFilters.update(quickFilterProps(next));
    filters.update(historyFiltersProps(next));
    filterToggle.update(filterToggleProps(next));
    semanticSearch.update(semanticSearchProps(next));
    reviewHistory.update(reviewHistoryProps(next));
    clearSemantic.update(clearSemanticProps(next));

    signInLabel.hidden = next.canUseAi;
    aiGuidance.hidden = next.canUseAi;
    queryGuidance.hidden = !next.canUseAi || Boolean(next.searchQuery.trim());
    resultRegion.hidden = next.semanticSearchResultCount === null;
    clearSemanticButtonVisibility(root, next.semanticSearchResultCount !== null);
    if (next.semanticSearchResultCount !== null) {
      resultCopy.textContent = resultMessage(next.semanticSearchResultCount);
    } else {
      resultCopy.textContent = '';
    }
    semanticError.hidden = !next.semanticSearchError;
    semanticError.textContent = next.semanticSearchError ?? '';
    summary.textContent = summaryMessage(next);
  };

  update(initialProps);
  return {
    update,
    destroy() {
      filters.destroy();
      quickFilters.destroy();
      search.destroy();
      clearSemantic.destroy();
      reviewHistory.destroy();
      semanticSearch.destroy();
      filterToggle.destroy();
    },
  };
}

function clearSemanticButtonVisibility(root: ParentNode, visible: boolean): void {
  const button = root.querySelector<HTMLElement>(
    '[data-ui-action="clear-semantic"]'
  );
  if (button) button.hidden = !visible;
}
