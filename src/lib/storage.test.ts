import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { setActiveUserId } from './client-identity';
import {
  __resetStorageStateForTests,
  getSessions,
  initializeStorage,
  retryCloudSync,
  saveSession,
  teardownStorageListeners,
} from './storage';
import { getQueue } from './sync-queue';
import type { JudoSession } from './types';

class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function installBrowserEnv() {
  const windowTarget = new EventTarget();
  const localStorage = new LocalStorageMock();
  const windowLike = Object.assign(windowTarget, {
    localStorage,
    location: { origin: 'http://localhost' },
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: windowLike,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true },
  });

  return { localStorage };
}

function makeSession(id: string): JudoSession {
  return {
    id,
    date: '2026-03-18',
    duration: 90,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: ['uchi-mata'],
  };
}

async function flushAsyncWork(): Promise<void> {
  await delay(0);
  await delay(0);
}

test('stale refresh does not overwrite an optimistic create while the create request is in flight', async () => {
  installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  let resolveCreate: (() => void) | undefined;
  const createPending = new Promise<Response>((resolve) => {
    resolveCreate = () => resolve(new Response(JSON.stringify({ ok: true })));
  });

  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/sessions/create')) {
      return createPending;
    }

    if (url.endsWith('/api/sessions/list')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    initializeStorage();
    const session = makeSession('session-stale-refresh');

    const savePromise = saveSession(session);
    getSessions();
    await flushAsyncWork();

    assert.deepEqual(
      getSessions().map((entry) => entry.id),
      ['session-stale-refresh']
    );

    resolveCreate?.();
    await savePromise;
    await flushAsyncWork();
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('non-retryable create failures are not queued and optimistic state is reconciled away', async () => {
  installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/sessions/create')) {
      return new Response(JSON.stringify({ error: 'invalid' }), {
        status: 400,
      });
    }

    if (url.endsWith('/api/sessions/list')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    initializeStorage();

    await assert.rejects(saveSession(makeSession('session-terminal-failure')));
    await flushAsyncWork();

    assert.deepEqual(getQueue(), []);
    assert.deepEqual(getSessions(), []);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('retryable create failures remain queued for later sync', async () => {
  installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/sessions/create')) {
      return new Response(JSON.stringify({ error: 'server' }), {
        status: 503,
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    initializeStorage();

    const result = await saveSession(makeSession('session-retryable-failure'));
    await flushAsyncWork();

    assert.equal(result.status, 'queued');
    assert.equal(getQueue().length, 1);
    assert.equal(getQueue()[0].type, 'CREATE');
    assert.deepEqual(
      getSessions().map((entry) => entry.id),
      ['session-retryable-failure']
    );
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('successful create stays visible until refresh confirms the remote copy', async () => {
  installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const session = makeSession('session-refresh-confirmation');
  let listRequests = 0;

  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/sessions/create')) {
      return new Response(JSON.stringify(session), { status: 201 });
    }

    if (url.endsWith('/api/sessions/list')) {
      listRequests += 1;
      return new Response(
        JSON.stringify(listRequests === 1 ? [] : [session]),
        { status: 200 }
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    initializeStorage();

    const result = await saveSession(session);
    assert.equal(result.status, 'synced');
    await flushAsyncWork();

    assert.deepEqual(
      getSessions().map((entry) => entry.id),
      ['session-refresh-confirmation']
    );
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('sync lease prevents replay when another tab already owns the queue flush', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  localStorage.setItem(
    'matmetrics_sync_queue:user-1',
    JSON.stringify([
      {
        type: 'CREATE',
        session: makeSession('session-queued-elsewhere'),
        queuedAt: 1,
      },
    ])
  );
  localStorage.setItem(
    'matmetrics_sync_lock:user-1',
    JSON.stringify({
      owner: 'other-tab',
      expiresAt: Date.now() + 60_000,
    })
  );

  let requestCount = 0;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    initializeStorage();
    retryCloudSync();
    await flushAsyncWork();

    assert.equal(requestCount, 0);
    assert.equal(getQueue().length, 1);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});
