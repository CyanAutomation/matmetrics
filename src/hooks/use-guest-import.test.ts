import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach } from 'node:test';
import type { JudoSession, MutationResult } from '@/lib/types';

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
const { act, cleanup, render } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { useGuestImport } =
  require('./use-guest-import') as typeof import('./use-guest-import');

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const sessions: JudoSession[] = [
  {
    id: 'guest-one',
    date: '2026-08-12',
    techniques: ['uchi-mata'],
    effort: 3,
    category: 'Technical',
  },
  {
    id: 'guest-two',
    date: '2026-08-13',
    techniques: ['osoto-gari'],
    effort: 4,
    category: 'Randori',
  },
];

test('a concurrent import reuses one snapshot and finalizes it once', async () => {
  const saves = sessions.map(() => deferred<MutationResult>());
  const submitted: string[] = [];
  let finalized = 0;
  let completed = 0;
  let dismissed = 0;
  let hook!: ReturnType<typeof useGuestImport>;

  function Harness() {
    hook = useGuestImport({
      userId: 'user-one',
      onImportComplete: () => completed++,
      operations: {
        getGuestSessionsForImport: () => sessions,
        saveSession: (session) => {
          submitted.push(session.id);
          return saves[submitted.length - 1].promise;
        },
        clearGuestWorkspaceAfterImport: () => finalized++,
        dismissGuestImport: async () => {
          dismissed++;
        },
      },
    });
    return null;
  }

  render(React.createElement(Harness));

  let firstImport!: Promise<void>;
  await act(async () => {
    firstImport = hook.handleImportGuestData();
    await hook.handleImportGuestData();
    await hook.handleDismissGuestImport();
  });

  assert.deepEqual(submitted, ['guest-one', 'guest-two']);
  assert.equal(dismissed, 0);

  await act(async () => {
    saves.forEach((save) => save.resolve({ status: 'synced' }));
    await firstImport;
  });

  assert.deepEqual(submitted, ['guest-one', 'guest-two']);
  assert.equal(finalized, 1);
  assert.equal(completed, 1);
});

test('an idempotent create conflict is finalized instead of retained', async () => {
  let finalized = 0;
  let retained = 0;
  let hook!: ReturnType<typeof useGuestImport>;

  function Harness() {
    hook = useGuestImport({
      userId: 'user-one',
      operations: {
        getGuestSessionsForImport: () => [sessions[0]],
        saveSession: async () => {
          throw new Error('Session already exists on GitHub');
        },
        clearGuestWorkspaceAfterImport: () => finalized++,
        retainGuestSessionsAfterPartialImport: () => retained++,
      },
    });
    return null;
  }

  render(React.createElement(Harness));
  await act(async () => hook.handleImportGuestData());

  assert.equal(finalized, 1);
  assert.equal(retained, 0);
});
