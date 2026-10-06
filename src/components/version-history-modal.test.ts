import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, afterEach } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
const domGlobalNames = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'NodeFilter',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'getComputedStyle',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
const originalDomGlobals = new Map(
  domGlobalNames.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ])
);
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { cleanup, render } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { VersionHistoryModal } =
  require('./version-history-modal') as typeof import('./version-history-modal');

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

afterEach(cleanup);
after(() => {
  cleanup();
  dom.window.close();
  for (const name of domGlobalNames) {
    const descriptor = originalDomGlobals.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('VersionHistoryModal shows release content after a successful fetch', async () => {
  const response = createDeferred<Response>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => response.promise) as typeof fetch;

  try {
    const view = render(
      React.createElement(VersionHistoryModal, {
        open: true,
        onOpenChange: () => undefined,
        disableDialogWrapper: true,
      })
    );

    assert.equal(
      (await view.findByText('Loading recent releases...')).textContent,
      'Loading recent releases...'
    );

    response.resolve({
      ok: true,
      json: async () => ({
        currentVersion: '1.2.3',
        releases: [
          {
            version: '1.2.3',
            date: '2026-03-30',
            sections: [
              { label: 'Fixes', items: ['Resolved loading state race'] },
            ],
          },
        ],
      }),
    } as Response);

    assert.equal(
      (await view.findByText('Resolved loading state race')).textContent,
      'Resolved loading state race'
    );
    assert.equal(view.queryByText('Loading recent releases...'), null);
    assert.ok(view.getByRole('heading', { name: 'v1.2.3' }));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test(
  'VersionHistoryModal clears loading and shows a recovery message after a failed fetch',
  async () => {
    const response = createDeferred<Response>();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => response.promise) as typeof fetch;

    try {
      const view = render(
        React.createElement(VersionHistoryModal, {
          open: true,
          onOpenChange: () => undefined,
          disableDialogWrapper: true,
        })
      );

      assert.equal(
        (await view.findByText('Loading recent releases...')).textContent,
        'Loading recent releases...'
      );

      response.reject(new Error('Network unavailable'));

      const error = await view.findByText(/Unable to load release history\./);
      assert.match(error.textContent ?? '', /Network unavailable/);
      assert.equal(view.queryByText('Loading recent releases...'), null);
    } finally {
      cleanup();
      globalThis.fetch = originalFetch;
    }
  }
);
