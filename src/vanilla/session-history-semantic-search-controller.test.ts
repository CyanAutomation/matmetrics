import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionHistorySearchCandidate } from '@/lib/session-history-search';
import {
  SessionHistorySemanticSearchController,
  type SessionHistorySemanticSearchDependencies,
} from './session-history-semantic-search-controller';

const candidates: SessionHistorySearchCandidate[] = [
  {
    id: 'session-1',
    date: '2026-11-01',
    category: 'Technical',
    effort: 3,
    techniques: ['Uchi-mata'],
    description: 'Practiced entries',
    notes: '',
  },
  {
    id: 'session-2',
    date: '2026-11-02',
    category: 'Randori',
    effort: 4,
    techniques: ['Newaza'],
    description: 'Worked on transitions',
    notes: '',
  },
];

function makeResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function makeController(
  overrides: Partial<SessionHistorySemanticSearchDependencies> = {}
) {
  return new SessionHistorySemanticSearchController({
    getAuthHeaders: async (headers) => headers ?? {},
    fetcher: async () => makeResponse({ matches: [] }),
    ...overrides,
  });
}

test('semantic search sends the trimmed query with candidates and exposes ranked matches', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const controller = makeController({
    getAuthHeaders: async (headers) => ({
      ...(headers as Record<string, string>),
      Authorization: 'Bearer test-token',
    }),
    fetcher: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return makeResponse({ matches: [{ id: 'session-2', relevance: 0.92 }] });
    },
  });

  const search = controller.search('  groundwork transitions  ', candidates);
  assert.equal(controller.getSnapshot().isSearching, true);
  await search;

  assert.equal(requestUrl, '/api/ai/search-sessions');
  assert.equal(requestInit?.method, 'POST');
  assert.equal(
    (requestInit?.headers as Record<string, string>).Authorization,
    'Bearer test-token'
  );
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    query: 'groundwork transitions',
    candidates,
  });
  assert.ok(requestInit?.signal instanceof AbortSignal);
  assert.deepEqual(controller.getSnapshot(), {
    matches: [{ id: 'session-2', relevance: 0.92 }],
    isSearching: false,
    error: null,
  });
  controller.destroy();
});

test('semantic search keeps text results available and reports a safe fallback on request failure', async () => {
  let jsonCalls = 0;
  const controller = makeController({
    fetcher: async () => ({
      ok: false,
      json: async () => {
        jsonCalls += 1;
        return {};
      },
    }) as Response,
  });

  await controller.search('groundwork', candidates);

  assert.equal(jsonCalls, 0);
  assert.equal(controller.getSnapshot().isSearching, false);
  assert.equal(controller.getSnapshot().matches, null);
  assert.equal(
    controller.getSnapshot().error,
    'Semantic ranking is unavailable; showing text matches.'
  );
  controller.destroy();
});

test('semantic search distinguishes invalid responses from unavailable ranking', async () => {
  const controller = makeController({
    fetcher: async () => makeResponse({ matches: [{ id: 'unknown', relevance: 0.95 }] }),
  });

  await controller.search('groundwork', candidates);

  assert.equal(
    controller.getSnapshot().error,
    'The semantic search response was invalid.'
  );
  controller.destroy();
});

test('clearing search aborts the request and ignores its late response', async () => {
  let resolveRequest!: (response: Response) => void;
  let requestSignal: AbortSignal | undefined;
  const controller = makeController({
    fetcher: async (_input, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      });
    },
  });

  const search = controller.search('groundwork', candidates);
  await Promise.resolve();
  controller.clear();
  assert.equal(requestSignal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), {
    matches: null,
    isSearching: false,
    error: null,
  });

  resolveRequest(makeResponse({ matches: [{ id: 'session-1', relevance: 0.9 }] }));
  await search;
  assert.equal(controller.getSnapshot().matches, null);
  assert.equal(controller.getSnapshot().isSearching, false);
  controller.destroy();
});

test('a stale request cannot clear the loading state or results of a newer search', async () => {
  const pending: Array<(response: Response) => void> = [];
  const controller = makeController({
    fetcher: async () =>
      new Promise<Response>((resolve) => pending.push(resolve)),
  });

  const firstSearch = controller.search('first query', candidates);
  await Promise.resolve();
  controller.clear();
  const secondSearch = controller.search('second query', candidates);
  await Promise.resolve();
  assert.equal(pending.length, 2);

  pending[0]?.(makeResponse({ matches: [{ id: 'session-1', relevance: 0.9 }] }));
  await firstSearch;
  assert.equal(controller.getSnapshot().isSearching, true);
  assert.equal(controller.getSnapshot().matches, null);

  pending[1]?.(makeResponse({ matches: [{ id: 'session-2', relevance: 0.95 }] }));
  await secondSearch;
  assert.deepEqual(controller.getSnapshot().matches, [
    { id: 'session-2', relevance: 0.95 },
  ]);
  assert.equal(controller.getSnapshot().isSearching, false);
  controller.destroy();
});
