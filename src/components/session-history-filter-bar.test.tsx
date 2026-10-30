import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
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
    })
  );
}

test('history keeps quick filters and AI actions collapsed until requested', () => {
  const markup = renderFilterBar(true);
  // The quick actions and external-data details remain available, but are
  // outside the default view until their native disclosure is opened.
  assert.match(markup, /<details[^>]*aria-label="Quick filters"/);
  assert.match(markup, /<details[^>]*aria-label="AI tools"/);
  assert.doesNotMatch(markup, /<details[^>]*open=/);
  assert.match(markup, /Quick filters/);
  assert.match(markup, /AI search and review/);
});

test('AI data-use details appear before each history action', () => {
  const document = parse(renderFilterBar(true));
  const aiTools = document.querySelector('details[aria-label="AI tools"]');
  const sections = aiTools?.querySelectorAll('section');

  assert.ok(aiTools);
  assert.equal(sections?.length, 2);
  assert.ok(
    (sections?.[0]?.innerHTML.indexOf('data-slot="data-use-notice"') ?? -1) <
      (sections?.[0]?.innerHTML.indexOf('<button') ?? -1)
  );
  assert.ok(
    (sections?.[1]?.innerHTML.indexOf('data-slot="data-use-notice"') ?? -1) <
      (sections?.[1]?.innerHTML.indexOf('<button') ?? -1)
  );
  assert.match(aiTools?.textContent ?? '', /up to eight sessions/i);
  assert.match(aiTools?.textContent ?? '', /up to five sessions|review up to 5 sessions/i);
  assert.match(aiTools?.textContent ?? '', /Review up to 5 sessions/);
});

test('signed-out AI guidance stays inside the collapsed AI tools disclosure', () => {
  const document = parse(renderFilterBar(false));
  const aiTools = document.querySelector('details[aria-label="AI tools"]');

  assert.ok(aiTools);
  assert.match(aiTools?.textContent ?? '', /Sign in to use AI search and review/);
  assert.equal(aiTools?.querySelectorAll('button[disabled]').length, 2);
  assert.doesNotMatch(aiTools?.textContent ?? '', /Sign in to search training history by meaning/);
});
