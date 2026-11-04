import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  mountSessionHistoryFilterBar,
  sessionHistoryFilterBarHtml,
  type SessionHistoryFilterBarProps,
} from './session-history-filter-bar';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

function makeProps(
  overrides: Partial<SessionHistoryFilterBarProps> = {}
): SessionHistoryFilterBarProps {
  return {
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

test('history filter bar keeps quick filters and AI tools collapsed by default', () => {
  const dom = new JSDOM(sessionHistoryFilterBarHtml(makeProps()));
  const document = dom.window.document;

  assert.ok(document.querySelector('details[aria-label="Quick filters"]'));
  assert.ok(document.querySelector('details[aria-label="AI tools"]'));
  assert.equal(document.querySelectorAll('details[open]').length, 0);
  assert.match(document.body.textContent ?? '', /AI search and review/);
  assert.match(document.body.textContent ?? '', /Search by meaning/);
  dom.window.close();
});

test('history filter bar keeps AI guidance before actions and disables signed-out actions', () => {
  const dom = new JSDOM(
    sessionHistoryFilterBarHtml(makeProps({ canUseAi: false }))
  );
  const aiTools = dom.window.document.querySelector('details[aria-label="AI tools"]');
  const sections = aiTools?.querySelectorAll('section') as NodeListOf<HTMLElement> | undefined;

  assert.ok(aiTools);
  assert.equal(sections?.length, 2);
  assert.match(aiTools?.textContent ?? '', /Sign in to use AI search and review/);
  assert.equal(aiTools?.querySelectorAll('button[disabled]').length, 2);
  for (const section of Array.from(sections ?? []) as HTMLElement[]) {
    assert.ok(
      (section.innerHTML.indexOf('data-slot="data-use-notice"') ?? -1) <
        section.innerHTML.indexOf('<button')
    );
  }
  dom.window.close();
});

test('history filter bar updates controls in place, routes events to current props, and cleans up', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const calls: string[] = [];
  const initial = makeProps();
  host.innerHTML = sessionHistoryFilterBarHtml(initial);
  const root = host.firstElementChild as HTMLElement;
  const search = root.querySelector<HTMLInputElement>('[aria-label="Search training history"]')!;
  const controller = mountSessionHistoryFilterBar(root, initial);
  search.focus();

  controller.update(makeProps({
    searchQuery: 'updated query',
    filtersOpen: true,
    activeFilterCount: 1,
    semanticSearchResultCount: 2,
    onSearchQueryChange: (value) => calls.push(`search:${value}`),
    onCategoryFilterChange: (value) => calls.push(`category:${value}`),
    onToggleFilters: () => calls.push('toggle'),
    onQuickFilter: (value) => calls.push(`quick:${value}`),
    onSemanticSearch: () => calls.push('semantic'),
    onClearSemanticSearch: () => calls.push('clear-semantic'),
    onReviewHistory: async () => { calls.push('review'); },
    onClearFilters: () => calls.push('clear-filters'),
  }));

  assert.equal(root.querySelector('input[type="search"]'), search);
  assert.equal(dom.window.document.activeElement, search);
  assert.equal(search.value, 'updated query');
  assert.equal(root.querySelector('[data-ui-action="toggle-filters"]')?.getAttribute('aria-expanded'), 'true');
  assert.equal(root.querySelector<HTMLElement>('#training-history-filters')?.hidden, false);

  search.value = 'new phrase';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  root.querySelector<HTMLButtonElement>('[data-ui-action="toggle-filters"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-action-value="month"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-ui-action="semantic-search"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-ui-action="review-history"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-ui-action="clear-semantic"]')!.click();
  root.querySelector<HTMLSelectElement>('[data-filter-category]')!.dispatchEvent(
    new dom.window.Event('change', { bubbles: true })
  );
  root.querySelector<HTMLButtonElement>('.ui-history-filters__clear')!.click();

  assert.deepEqual(calls, [
    'search:new phrase',
    'toggle',
    'quick:month',
    'semantic',
    'review',
    'clear-semantic',
    'category:all',
    'clear-filters',
  ]);

  controller.destroy();
  search.value = 'ignored';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  root.querySelector<HTMLButtonElement>('[data-ui-action="toggle-filters"]')!.click();
  assert.equal(calls.length, 8);
  dom.window.close();
});
