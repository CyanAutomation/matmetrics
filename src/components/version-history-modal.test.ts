import assert from 'node:assert/strict';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type EffectCallback = () => void | (() => void);

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function renderWithMockedHooks(params: { fetchImpl: typeof fetch }) {
  const stateStore: unknown[] = [];
  const setters: Array<(value: unknown) => void> = [];
  const pendingEffects: EffectCallback[] = [];

  let hookIndex = 0;
  test.mock.method(React, 'useState', (<T>(initialValue: T | (() => T)) => {
    const currentIndex = hookIndex;
    hookIndex += 1;

    if (!(currentIndex in stateStore)) {
      stateStore[currentIndex] =
        typeof initialValue === 'function'
          ? (initialValue as () => T)()
          : initialValue;
    }

    if (!setters[currentIndex]) {
      setters[currentIndex] = (value: unknown) => {
        const prev = stateStore[currentIndex];
        stateStore[currentIndex] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(prev)
            : value;
      };
    }

    return [
      stateStore[currentIndex] as T,
      setters[currentIndex] as React.Dispatch<React.SetStateAction<T>>,
    ] as const;
  }) as typeof React.useState);

  test.mock.method(React, 'useEffect', ((callback: EffectCallback) => {
    pendingEffects.push(callback);
  }) as typeof React.useEffect);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = params.fetchImpl;

  const { VersionHistoryModal } = await import('./version-history-modal');

  const render = () => {
    hookIndex = 0;
    return renderToStaticMarkup(
      React.createElement(VersionHistoryModal, {
        open: true,
        onOpenChange: () => undefined,
        disableDialogWrapper: true,
      })
    );
  };

  const runEffects = () => {
    const effects = [...pendingEffects];
    pendingEffects.length = 0;
    const cleanups: Array<void | (() => void)> = [];
    for (const effect of effects) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    }
    return () => cleanups.forEach((cleanup) => typeof cleanup === 'function' && cleanup());
  };

  const cleanup = () => {
    globalThis.fetch = originalFetch;
    test.mock.restoreAll();
  };

  return { render, runEffects, cleanup };
}

test('VersionHistoryModal clears loading and renders release content after a successful fetch', async () => {
  const deferred = createDeferred<Response>();
  const harness = await renderWithMockedHooks({
    fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => deferred.promise) as typeof fetch,
  });

  try {
    harness.render();
    harness.runEffects();

    const loadingMarkup = harness.render();
    assert.match(loadingMarkup, /Loading recent releases\.\.\./);

    deferred.resolve({
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

    await flushMicrotasks();

    const successMarkup = harness.render();
    assert.doesNotMatch(successMarkup, /Loading recent releases\.\.\./);
    assert.match(successMarkup, /v1\.2\.3/);
    assert.match(successMarkup, /Resolved loading state race/);

    const regressionMarkup = harness.render();
    assert.doesNotMatch(regressionMarkup, /Loading recent releases\.\.\./);
  } finally {
    harness.cleanup();
  }
});

test('VersionHistoryModal clears loading and surfaces an error message after a failed fetch', async () => {
  const deferred = createDeferred<Response>();
  const harness = await renderWithMockedHooks({
    fetchImpl: (() => deferred.promise) as typeof fetch,
  });

  try {
    harness.render();
    harness.runEffects();

    const loadingMarkup = harness.render();
    assert.match(loadingMarkup, /Loading recent releases\.\.\./);

    deferred.reject(new Error('Network unavailable'));
    await flushMicrotasks();

    const errorMarkup = harness.render();
    assert.doesNotMatch(errorMarkup, /Loading recent releases\.\.\./);
    assert.match(errorMarkup, /Unable to load release history\./);
    assert.match(errorMarkup, /Network unavailable/);
  } finally {
    harness.cleanup();
  }
});
