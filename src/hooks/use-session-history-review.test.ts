import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, before, mock } from 'node:test';
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
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const { act, cleanup, renderHook } =
  require('@testing-library/react') as typeof import('@testing-library/react');

mock.module('@/components/auth-provider', {
  namedExports: { useAuth: () => ({ canUseAi: true }) },
});
mock.module('@/lib/auth-session', {
  namedExports: { getAuthHeaders: async (headers?: HeadersInit) => headers ?? {} },
});

let useSessionHistoryReview: typeof import('./use-session-history-review').useSessionHistoryReview;
before(async () => {
  ({ useSessionHistoryReview } = await import('./use-session-history-review'));
});
let originalFetch: typeof fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function session(): JudoSession {
  return {
    id: 'session-1',
    date: '2026-10-29',
    category: 'Technical',
    effort: 3,
    techniques: [],
    description: 'Practiced uchi-mata entries.',
  };
}

test('history review checks HTTP status before parsing a non-JSON error body', async () => {
  originalFetch = globalThis.fetch;
  let jsonCalls = 0;
  globalThis.fetch = (async () => ({
    ok: false,
    status: 502,
    json: async () => {
      jsonCalls += 1;
      throw new SyntaxError('upstream error was not JSON');
    },
  })) as unknown as typeof fetch;

  const { result } = renderHook(() => useSessionHistoryReview([session()]));
  await act(async () => {
    await result.current.handleReviewHistory();
  });

  assert.equal(jsonCalls, 0);
  assert.equal(result.current.historyReviewEntries.length, 1);
  assert.equal(result.current.historyReviewEntries[0]?.error, true);
});
