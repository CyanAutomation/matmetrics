import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import type { JudoSession } from '@/lib/types';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  Event: dom.window.Event,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { act, cleanup, fireEvent, render, screen, waitFor } =
  require('@testing-library/react') as typeof import('@testing-library/react');

interface FilterBarProps {
  searchQuery: string;
  isSemanticSearching: boolean;
  semanticSearchError: string | null;
  onSearchQueryChange: (value: string) => void;
  onSemanticSearch: () => void;
}

interface ContentProps {
  filterBarProps: FilterBarProps;
  filteredSessions: JudoSession[];
}

const sessions: JudoSession[] = [
  {
    id: 'session-1',
    date: '2026-10-19',
    category: 'Randori',
    effort: 4,
    techniques: ['Uchi-mata'],
    description: 'Practiced entries against a larger partner.',
  },
  {
    id: 'session-2',
    date: '2026-10-18',
    category: 'Technical',
    effort: 3,
    techniques: ['Newaza'],
    description: 'Worked on groundwork escapes.',
  },
];

let SessionHistory: typeof import('./session-history').SessionHistory;
let originalFetch: typeof fetch;

before(async () => {
  mock.module('@/lib/auth-session', {
    namedExports: { getAuthHeaders: async () => ({}) },
  });
  mock.module('@/hooks/use-session-history-review', {
    namedExports: {
      useSessionHistoryReview: () => ({
        canUseAi: true,
        clearHistoryReview: () => undefined,
        handleReviewHistory: () => undefined,
        hasUnreviewedDescriptions: false,
        isReviewingHistory: false,
        reviewProgress: null,
        historyReviewEntries: [],
        recurringThemeSummary: null,
      }),
    },
  });
  mock.module('@/hooks/use-session-history-actions', {
    namedExports: {
      useSessionHistoryActions: () => ({
        deletingSessionId: null,
        handleDelete: () => undefined,
      }),
    },
  });
  mock.module('./session-history-content', {
    namedExports: {
      SessionHistoryContent: ({ filterBarProps, filteredSessions }: ContentProps) => {
        return React.createElement(
          'section',
          null,
          React.createElement('input', {
            'aria-label': 'Search query',
            value: filterBarProps.searchQuery,
            onChange: (event: { target: { value: string } }) =>
              filterBarProps.onSearchQueryChange(event.target.value),
          }),
          React.createElement(
            'button',
            { onClick: filterBarProps.onSemanticSearch },
            'Search by meaning'
          ),
          filterBarProps.isSemanticSearching
            ? React.createElement('p', { role: 'status' }, 'Finding sessions by meaning')
            : null,
          React.createElement(
            'p',
            { 'data-testid': 'visible-sessions' },
            filteredSessions.map((session) => session.id).join(',')
          ),
          filterBarProps.semanticSearchError
            ? React.createElement(
                'p',
                { role: 'alert' },
                filterBarProps.semanticSearchError
              )
            : null
        );
      },
      SessionHistoryEmptyState: () => null,
    },
  });

  ({ SessionHistory } = await import('./session-history'));
});

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function renderHistory() {
  return render(
    React.createElement(SessionHistory, {
      sessions,
      onRefresh: () => undefined,
    })
  );
}

function searchFor(query: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Search query' }), {
    target: { value: query },
  });
}

test('text search stays local until requested semantic search merges likely matches', async () => {
  globalThis.fetch = (async (_url, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    const body = JSON.parse(String(init?.body)) as { query: string };
    assert.equal(body.query, 'larger partner');
    return {
      ok: true,
      json: async () => ({ matches: [{ id: 'session-2', relevance: 0.9 }] }),
    } as Response;
  }) as typeof fetch;

  renderHistory();
  searchFor('larger partner');
  assert.equal(screen.getByTestId('visible-sessions').textContent, 'session-1');
  assert.equal(screen.queryByRole('status'), null);
  assert.equal(screen.getByTestId('visible-sessions').textContent, 'session-1');
  assert.equal(screen.getByRole('button', { name: 'Search by meaning' }).textContent, 'Search by meaning');

  fireEvent.click(screen.getByRole('button', { name: 'Search by meaning' }));
  await waitFor(() =>
    assert.equal(screen.getByTestId('visible-sessions').textContent, 'session-2,session-1')
  );
  assert.equal(screen.getByTestId('visible-sessions').textContent, 'session-2,session-1');
});

test('ordinary search results remain visible when semantic ranking fails', async () => {
  globalThis.fetch = (async () => ({ ok: false }) as Response) as typeof fetch;
  renderHistory();
  searchFor('larger partner');
  fireEvent.click(screen.getByRole('button', { name: 'Search by meaning' }));

  assert.equal(screen.getByTestId('visible-sessions').textContent, 'session-1');
  await waitFor(() => assert.ok(screen.getByRole('alert')));
  assert.equal(screen.getByTestId('visible-sessions').textContent, 'session-1');
});

test('a stale request does not clear the loading state of a newer request', async () => {
  const pending: Array<(response: Response) => void> = [];
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => pending.push(resolve))) as typeof fetch;

  renderHistory();
  searchFor('larger partner');
  fireEvent.click(screen.getByRole('button', { name: 'Search by meaning' }));
  await waitFor(() => assert.equal(pending.length, 1));

  await act(async () => {
    searchFor('different wording');
    fireEvent.click(screen.getByRole('button', { name: 'Search by meaning' }));
  });
  await waitFor(() => assert.equal(pending.length, 2));

  await act(async () => {
    pending[0]?.({
      ok: true,
      json: async () => ({ matches: [{ id: 'session-1', relevance: 0.9 }] }),
    } as Response);
  });

  assert.equal(screen.getByRole('status').textContent, 'Finding sessions by meaning');

  await act(async () => {
    pending[1]?.({
      ok: true,
      json: async () => ({ matches: [{ id: 'session-1', relevance: 0.9 }] }),
    } as Response);
  });
  await waitFor(() => assert.equal(screen.queryByRole('status'), null), { timeout: 1500 });
});

test('a failed HTTP response is rejected without parsing its body', async () => {
  let jsonCalls = 0;
  globalThis.fetch = (async () => ({
    ok: false,
    json: async () => {
      jsonCalls += 1;
      throw new SyntaxError('not JSON');
    },
  })) as unknown as typeof fetch;

  renderHistory();
  searchFor('larger partner');
  fireEvent.click(screen.getByRole('button', { name: 'Search by meaning' }));
  await waitFor(() => assert.ok(screen.getByRole('alert')));
  assert.equal(jsonCalls, 0);
});
