import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';
import type { SessionHistoryFilterBarProps } from './session-history-filter-bar';

const globalKeys = [
  'window',
  'document',
  'HTMLElement',
  'IS_REACT_ACT_ENVIRONMENT',
  'navigator',
] as const;
const originalGlobals = new Map(
  globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { render, fireEvent, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { SessionHistoryFilterBar } = require('../components/session-history-filter-bar') as typeof import('../components/session-history-filter-bar');

function makeProps(
  overrides: Partial<SessionHistoryFilterBarProps> = {}
): SessionHistoryFilterBarProps {
  return {
    searchQuery: '',
    categoryFilter: 'all',
    effortFilter: 'all',
    fromDate: '',
    toDate: '',
    filtersOpen: false,
    activeFilterCount: 0,
    filteredCount: 4,
    sessionCount: 20,
    averageEffort: 3.5,
    duration: 90,
    canUseAi: true,
    canSemanticSearch: true,
    isSemanticSearching: false,
    hasUnreviewedDescriptions: true,
    isReviewingHistory: false,
    reviewProgress: { completed: 0, total: 5 },
    semanticSearchResultCount: null,
    semanticSearchError: null,
    onSearchQueryChange: () => {},
    onCategoryFilterChange: () => {},
    onEffortFilterChange: () => {},
    onFromDateChange: () => {},
    onToDateChange: () => {},
    onToggleFilters: () => {},
    onQuickFilter: () => {},
    onClearFilters: () => {},
    onSemanticSearch: () => {},
    onClearSemanticSearch: () => {},
    onReviewHistory: async () => {},
    ...overrides,
  };
}

after(() => {
  cleanup();
  dom.window.close();
  for (const key of globalKeys) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('history filter bar bridge keeps the current screen integration and updates in Strict Mode', () => {
  const calls: string[] = [];
  const view = render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(SessionHistoryFilterBar, makeProps())
    )
  );
  const search = view.getByLabelText('Search training history') as HTMLInputElement;
  search.focus();

  view.rerender(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        SessionHistoryFilterBar,
        makeProps({
          searchQuery: 'new query',
          filtersOpen: true,
          activeFilterCount: 1,
          onSearchQueryChange: (value) => calls.push(`search:${value}`),
          onToggleFilters: () => calls.push('toggle'),
        })
      )
    )
  );

  assert.equal(view.getByLabelText('Search training history'), search);
  assert.equal(document.activeElement, search);
  assert.equal(search.value, 'new query');
  const filterToggle = view.getByRole('button', { name: 'Filters (1)' });
  assert.equal(filterToggle.getAttribute('aria-expanded'), 'true');

  fireEvent.input(search, { target: { value: 'latest query' } });
  fireEvent.click(filterToggle);
  assert.deepEqual(calls, ['search:latest query', 'toggle']);

  view.unmount();
  fireEvent.input(search, { target: { value: 'ignored' } });
  fireEvent.click(filterToggle);
  assert.deepEqual(calls, ['search:latest query', 'toggle']);
});
