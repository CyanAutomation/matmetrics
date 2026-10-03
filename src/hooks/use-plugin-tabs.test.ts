import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { act, cleanup, render, waitFor } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { usePluginTabs } =
  require('./use-plugin-tabs') as typeof import('./use-plugin-tabs');

afterEach(cleanup);

type PluginTabsOptions = NonNullable<Parameters<typeof usePluginTabs>[0]>;

function Harness({ deps }: { deps: PluginTabsOptions }) {
  usePluginTabs(deps);
  return null;
}

test('plugin discovery waits for auth readiness and avoids requests for guests', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let tokenCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ extensions: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    const getIdToken = async () => {
      tokenCalls += 1;
      return 'firebase-id-token';
    };
    const view = render(
      React.createElement(Harness, {
        deps: { authReady: false, hasUser: false, getIdToken },
      })
    );

    assert.equal(fetchCalls, 0);
    assert.equal(tokenCalls, 0);

    await act(async () => {
      view.rerender(
        React.createElement(Harness, {
          deps: { authReady: true, hasUser: false, getIdToken },
        })
      );
      await Promise.resolve();
    });

    assert.equal(fetchCalls, 0);
    assert.equal(tokenCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authenticated plugin discovery sends the Firebase ID token', async () => {
  const originalFetch = globalThis.fetch;
  const requestHeaders: Headers[] = [];
  let tokenCalls = 0;
  globalThis.fetch = (async (_input, init) => {
    requestHeaders.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ extensions: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    render(
      React.createElement(Harness, {
        deps: {
          authReady: true,
          hasUser: true,
          getIdToken: async () => {
            tokenCalls += 1;
            return 'firebase-id-token';
          },
        },
      })
    );

    await waitFor(() => assert.equal(requestHeaders.length, 1));
    assert.equal(tokenCalls, 1);
    assert.equal(
      requestHeaders[0].get('Authorization'),
      'Bearer firebase-id-token'
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
