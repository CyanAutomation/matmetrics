import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SessionHistoryFilterBar } from './session-history-filter-bar';

function renderFilterBar(canUseAi: boolean) {
  return renderToStaticMarkup(
    React.createElement(SessionHistoryFilterBar, {
      searchQuery: 'taller partners',
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
      canUseAi,
      canSemanticSearch: true,
      isSemanticSearching: false,
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
    })
  );
}

test('history filter presents semantic search with an external-data notice', () => {
  const markup = renderFilterBar(true);

  assert.match(markup, />Search by meaning</);
  assert.match(markup, /up to eight sessions/i);
  assert.match(markup, /chosen locally by text overlap and recency/i);
  assert.match(markup, /your query/i);
  assert.match(markup, /Session IDs and your full history are not sent/i);
});

test('history filter tells signed-out users semantic search requires sign-in', () => {
  const markup = renderFilterBar(false);

  assert.match(markup, /Sign in to search training history by meaning/);
  assert.match(markup, /<button[^>]*disabled="">[\s\S]*?Search by meaning<\/button>/);
});
