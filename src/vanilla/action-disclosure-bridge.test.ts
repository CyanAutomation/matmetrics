import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const React = require('react') as typeof import('react');
const { render, fireEvent, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { VanillaActionDisclosure } = require('../components/vanilla-action-disclosure') as typeof import('../components/vanilla-action-disclosure');

test('React bridge keeps disclosure state and uses current callback, including in Strict Mode', () => {
  const calls: string[] = [];
  const props = { label: 'Quick filters', options: [{ value: 'week', label: 'This week' }], onAction: (value: string) => calls.push(`old:${value}`) };
  const view = render(React.createElement(React.StrictMode, null, React.createElement(VanillaActionDisclosure, props)));
  const details = view.getByText('Quick filters').closest('details')!;
  const button = view.getByText('This week');
  details.open = true;
  button.focus();
  fireEvent.click(button);
  view.rerender(React.createElement(React.StrictMode, null, React.createElement(VanillaActionDisclosure, { ...props, onAction: (value: string) => calls.push(`new:${value}`) })));
  assert.equal(details.open, true);
  assert.equal(document.activeElement, button);
  fireEvent.click(button);
  view.unmount();
  fireEvent.click(button);
  assert.deepEqual(calls, ['old:week', 'new:week']);
  cleanup();
});

test('training history quick filters invoke the existing filter actions', () => {
  const { SessionHistoryFilterBar } = require('../components/session-history-filter-bar') as typeof import('../components/session-history-filter-bar');
  const calls: string[] = [];
  const view = render(React.createElement(SessionHistoryFilterBar, {
    searchQuery: '', categoryFilter: 'all', effortFilter: 'all', fromDate: '', toDate: '',
    filtersOpen: false, activeFilterCount: 0, filteredCount: 0, sessionCount: 0,
    averageEffort: 0, duration: 0, canUseAi: false, canSemanticSearch: false,
    isSemanticSearching: false, hasUnreviewedDescriptions: false, isReviewingHistory: false,
    reviewProgress: { completed: 0, total: 0 }, semanticSearchResultCount: null, semanticSearchError: null,
    onSearchQueryChange() {}, onCategoryFilterChange() {}, onEffortFilterChange() {},
    onFromDateChange() {}, onToDateChange() {}, onToggleFilters() {},
    onQuickFilter(value) { calls.push(value); }, onClearFilters() {}, onSemanticSearch() {},
    onClearSemanticSearch() {}, async onReviewHistory() {},
  }));
  fireEvent.click(view.getByText('This week'));
  fireEvent.click(view.getByText('Last 30 days'));
  fireEvent.click(view.getByText('High effort'));
  assert.deepEqual(calls, ['week', 'month', 'high-effort']);
  view.unmount();
  cleanup();
});
