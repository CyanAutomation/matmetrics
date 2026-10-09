import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  StorageEvent: dom.window.StorageEvent,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { act, cleanup, render } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { getScopedStorageKey, setActiveUserId } =
  require('../lib/client-identity') as typeof import('../lib/client-identity');
const {
  __resetStorageStateForTests,
  __setStorageDependencyOverridesForTests,
  teardownStorageListeners,
} = require('../lib/storage') as typeof import('../lib/storage');
const { DEFAULT_USER_PREFERENCES } =
  require('../lib/user-preferences') as typeof import('../lib/user-preferences');
const { useSessionsData } =
  require('./use-sessions-data') as typeof import('./use-sessions-data');

afterEach(() => {
  cleanup();
  teardownStorageListeners();
  __resetStorageStateForTests();
  setActiveUserId(null);
  dom.window.localStorage.clear();
});

type SessionsDataOptions = NonNullable<Parameters<typeof useSessionsData>[0]>;

function Harness({ deps }: { deps: SessionsDataOptions }) {
  const { sessions } = useSessionsData(deps);
  return React.createElement(
    'output',
    null,
    sessions.map((session) => session.id).join(',')
  );
}

function renderedSessionIds(view: { container: HTMLElement }): string[] {
  return (view.container.textContent ?? '').split(',').filter(Boolean);
}

function authenticatedPreferences() {
  return {
    ...DEFAULT_USER_PREFERENCES,
    gitHub: {
      ...DEFAULT_USER_PREFERENCES.gitHub,
      enabled: true,
      config: { owner: 'octocat', repo: 'hello-world', branch: 'main' },
    },
  };
}

test('session refresh waits for auth and preferences, then fetches once with credentials', async () => {
  const { localStorage } = dom.window;
  setActiveUserId('user-1');
  __resetStorageStateForTests();
  const preferences = authenticatedPreferences();
  __setStorageDependencyOverridesForTests({
    readPreferences: () => preferences,
    getSessionRefreshAuthHeaders: async () => ({
      Authorization: 'Bearer firebase-token',
    }),
  });

  const cachedSession = {
    id: 'cached-session',
    date: '2026-03-18',
    effort: 3,
    category: 'Technical',
    techniques: ['uchi-mata'],
  };
  const latestSession = {
    ...cachedSession,
    id: 'latest-session',
    date: '2026-10-08',
  };
  localStorage.setItem(
    getScopedStorageKey('matmetrics_sessions'),
    JSON.stringify([cachedSession])
  );

  let listRequests = 0;
  let requestAuthorization: string | null = null;
  const originalInfo = console.info;
  const infoDiagnostics: unknown[][] = [];
  console.info = (...args: unknown[]) => {
    infoDiagnostics.push(args);
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname !== '/api/sessions/list') {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    listRequests += 1;
    requestAuthorization = new Headers(init?.headers).get('Authorization');
    return new Response(JSON.stringify([latestSession]), {
      status: 200,
      headers: { 'x-vercel-id': 'iad1::refresh-456' },
    });
  }) as typeof fetch;

  try {
    const view = render(
      React.createElement(Harness, {
        deps: {
          userId: 'user-1',
          authMode: 'authenticated',
          authReady: false,
          preferencesReady: false,
        },
      })
    );
    await act(async () => {
      await delay(10);
    });
    assert.equal(listRequests, 0);

    await act(async () => {
      view.rerender(
        React.createElement(Harness, {
          deps: {
            userId: 'user-1',
            authMode: 'authenticated',
            authReady: true,
            preferencesReady: false,
          },
        })
      );
      await delay(10);
    });
    assert.equal(listRequests, 0);

    await act(async () => {
      view.rerender(
        React.createElement(Harness, {
          deps: {
            userId: 'user-1',
            authMode: 'authenticated',
            authReady: true,
            preferencesReady: true,
          },
        })
      );
      await delay(20);
    });

    assert.equal(listRequests, 1);
    assert.equal(requestAuthorization, 'Bearer firebase-token');
    assert.ok(
      infoDiagnostics.some(([event, details]) => {
        const diagnostic = details as {
          source?: string;
          sessionCount?: number;
          requestId?: string;
        };
        return (
          event === 'session_list_refresh_completed' &&
          diagnostic.source === 'github' &&
          diagnostic.sessionCount === 1 &&
          diagnostic.requestId === 'iad1::refresh-456'
        );
      })
    );
    assert.equal(JSON.stringify(infoDiagnostics).includes('firebase-token'), false);
    assert.deepEqual(renderedSessionIds(view), ['latest-session']);
    assert.deepEqual(
      JSON.parse(
        localStorage.getItem(getScopedStorageKey('matmetrics_sessions')) ??
          '[]'
      ).map((session: { id: string }) => session.id),
      ['latest-session']
    );
  } finally {
    console.info = originalInfo;
    globalThis.fetch = originalFetch;
  }
});

test('switching users hides the old list and ignores its pending response', async () => {
  const { localStorage } = dom.window;
  setActiveUserId('user-1');
  __resetStorageStateForTests();
  const preferences = authenticatedPreferences();
  __setStorageDependencyOverridesForTests({
    readPreferences: () => preferences,
    getSessionRefreshAuthHeaders: async () => ({
      Authorization: 'Bearer firebase-token',
    }),
  });

  const userOneSession = {
    id: 'user-one-cache',
    date: '2026-03-18',
    effort: 3,
    category: 'Technical',
    techniques: ['uchi-mata'],
  };
  const userTwoSession = { ...userOneSession, id: 'user-two-cache' };
  const userTwoLatestSession = {
    ...userTwoSession,
    id: 'user-two-latest',
    date: '2026-10-08',
  };
  const userOneCacheKey = getScopedStorageKey('matmetrics_sessions');
  localStorage.setItem(userOneCacheKey, JSON.stringify([userOneSession]));
  setActiveUserId('user-2');
  const userTwoCacheKey = getScopedStorageKey('matmetrics_sessions');
  localStorage.setItem(userTwoCacheKey, JSON.stringify([userTwoSession]));
  setActiveUserId('user-1');

  let resolveUserOneList: ((response: Response) => void) | undefined;
  const userOneListPending = new Promise<Response>((resolve) => {
    resolveUserOneList = resolve;
  });
  let listRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname !== '/api/sessions/list') {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    listRequests += 1;
    if (listRequests === 1) return userOneListPending;
    return new Response(JSON.stringify([userTwoLatestSession]), {
      status: 200,
    });
  }) as typeof fetch;

  try {
    const view = render(
      React.createElement(Harness, {
        deps: {
          userId: 'user-1',
          authMode: 'authenticated',
          authReady: true,
          preferencesReady: true,
        },
      })
    );
    await act(async () => {
      await delay(10);
    });
    assert.deepEqual(renderedSessionIds(view), ['user-one-cache']);

    setActiveUserId('user-2');
    await act(async () => {
      view.rerender(
        React.createElement(Harness, {
          deps: {
            userId: 'user-2',
            authMode: 'authenticated',
            authReady: true,
            preferencesReady: false,
          },
        })
      );
    });
    assert.deepEqual(renderedSessionIds(view), []);

    resolveUserOneList?.(
      new Response(JSON.stringify([userOneSession]), { status: 200 })
    );
    await act(async () => {
      await delay(10);
    });
    assert.deepEqual(
      JSON.parse(localStorage.getItem(userTwoCacheKey) ?? '[]').map(
        (session: { id: string }) => session.id
      ),
      ['user-two-cache']
    );

    await act(async () => {
      view.rerender(
        React.createElement(Harness, {
          deps: {
            userId: 'user-2',
            authMode: 'authenticated',
            authReady: true,
            preferencesReady: true,
          },
        })
      );
      await delay(20);
    });
    assert.equal(listRequests, 2);
    assert.deepEqual(renderedSessionIds(view), ['user-two-latest']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ready guest session loading does not request the authenticated list API', async () => {
  setActiveUserId(null);
  __resetStorageStateForTests();
  let listRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    if (String(input).includes('/api/sessions/list')) listRequests += 1;
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  try {
    render(
      React.createElement(Harness, {
        deps: {
          userId: null,
          authMode: 'guest',
          authReady: true,
          preferencesReady: true,
        },
      })
    );
    await act(async () => {
      await delay(10);
    });
    assert.equal(listRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
