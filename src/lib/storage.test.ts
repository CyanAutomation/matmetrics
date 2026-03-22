import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { getScopedStorageKey, setActiveUserId } from './client-identity';
import {
  __renewSyncLeaseForTests,
  __setSyncLeaseTimingForTests,
  __setStorageDependencyOverridesForTests,
  __resetStorageStateForTests,
  __tryAcquireSyncLeaseForTests,
  clearAllData,
  getGitHubSyncStatus,
  getSessions,
  initializeStorage,
  retryCloudSync,
  saveSession,
  setGitHubSyncStatus,
  updateSession,
  deleteSession,
  teardownStorageListeners,
} from './storage';
import { getQueue, getSyncQueueStorageKey } from './sync-queue';
import type { SyncOperation } from './sync-queue';
import type { JudoSession } from './types';
import { DEFAULT_USER_PREFERENCES } from './user-preferences';

function assertCreateOperation(
  operation: SyncOperation | undefined
): asserts operation is Extract<SyncOperation, { type: 'CREATE' }> {
  assert.ok(operation);
  assert.equal(operation.type, 'CREATE');
}

function createIntervalHandle(): ReturnType<typeof setInterval> {
  return 0 as unknown as ReturnType<typeof setInterval>;
}

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

class LockManagerMock {
  private held = false;

  async request(
    _name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: { name: string } | null) => Promise<void>
  ): Promise<void> {
    if (this.held) {
      if (options.ifAvailable) {
        await callback(null);
        return;
      }
      throw new Error(
        'Lock contention without ifAvailable is unsupported in test'
      );
    }

    this.held = true;
    await callback({ name: 'matmetrics-sync' });
    this.held = false;
  }
}

function installBrowserEnv(options: { withLocks?: boolean } = {}) {
  const windowTarget = new EventTarget();
  const localStorage = new LocalStorageMock();
  const lockManager = new LockManagerMock();
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
    value: options.withLocks
      ? { onLine: true, locks: lockManager }
      : { onLine: true },
  });

  return { localStorage, lockManager };
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

test('429 replay failure keeps failed and later queued operations', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const firstSession = makeSession('session-queued-rate-limited-1');
  const secondSession = makeSession('session-queued-rate-limited-2');
  localStorage.setItem(
    getSyncQueueStorageKey(),
    JSON.stringify([
      { type: 'CREATE', session: firstSession, queuedAt: 1 },
      { type: 'CREATE', session: secondSession, queuedAt: 2 },
    ])
  );

  let createRequests = 0;
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/sessions/create')) {
      createRequests += 1;
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: {
          'Retry-After': '0',
        },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    initializeStorage();
    retryCloudSync();
    await flushAsyncWork();

    assert.equal(createRequests, 1);
    assert.deepEqual(getQueue(), [
      { type: 'CREATE', session: firstSession, queuedAt: 1 },
      { type: 'CREATE', session: secondSession, queuedAt: 2 },
    ]);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('non-retryable queued create failures are removed during sync replay', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const queuedSession = makeSession('session-queued-terminal-failure');
  localStorage.setItem(
    getSyncQueueStorageKey(),
    JSON.stringify([{ type: 'CREATE', session: queuedSession, queuedAt: 1 }])
  );

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
    retryCloudSync();
    await flushAsyncWork();

    assert.deepEqual(getQueue(), []);
    assert.deepEqual(getSessions(), []);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('successful create clears dirty state even when immediate refresh fails', async () => {
  installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const session = makeSession('session-clear-dirty-create');
  let listRequests = 0;

  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/sessions/create')) {
      return new Response(JSON.stringify(session), { status: 201 });
    }

    if (url.endsWith('/api/sessions/list')) {
      listRequests += 1;
      if (listRequests === 1) {
        return new Response(JSON.stringify({ error: 'refresh failed' }), {
          status: 500,
        });
      }

      return new Response(JSON.stringify([]), { status: 200 });
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
      ['session-clear-dirty-create']
    );

    await flushAsyncWork();

    assert.deepEqual(getSessions(), []);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('successful update clears dirty state even when immediate refresh fails', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const originalSession = makeSession('session-clear-dirty-update');
  const updatedSession: JudoSession = {
    ...originalSession,
    notes: 'updated locally',
  };
  const sessionsStorageKey = getScopedStorageKey('matmetrics_sessions');
  localStorage.setItem(sessionsStorageKey, JSON.stringify([originalSession]));

  let listRequests = 0;
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith(`/api/sessions/${updatedSession.id}`)) {
      return new Response(JSON.stringify(updatedSession), { status: 200 });
    }

    if (url.endsWith('/api/sessions/list')) {
      listRequests += 1;
      if (listRequests === 1) {
        return new Response(JSON.stringify({ error: 'refresh failed' }), {
          status: 500,
        });
      }

      return new Response(JSON.stringify([originalSession]), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    initializeStorage();

    const result = await updateSession(updatedSession);
    assert.equal(result.status, 'synced');
    await flushAsyncWork();

    assert.equal(getSessions()[0].notes, 'updated locally');

    await flushAsyncWork();

    assert.equal(getSessions()[0].notes, originalSession.notes);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('successful delete clears dirty state even when immediate refresh fails', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const session = makeSession('session-clear-dirty-delete');
  const sessionsStorageKey = getScopedStorageKey('matmetrics_sessions');
  localStorage.setItem(sessionsStorageKey, JSON.stringify([session]));

  let listRequests = 0;
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith(`/api/sessions/${session.id}`)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (url.endsWith('/api/sessions/list')) {
      listRequests += 1;
      if (listRequests === 1) {
        return new Response(JSON.stringify({ error: 'refresh failed' }), {
          status: 500,
        });
      }

      return new Response(JSON.stringify([session]), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    initializeStorage();

    const result = await deleteSession(session.id);
    assert.equal(result.status, 'synced');
    await flushAsyncWork();

    assert.deepEqual(getSessions(), []);

    await flushAsyncWork();

    assert.deepEqual(
      getSessions().map((entry) => entry.id),
      ['session-clear-dirty-delete']
    );
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('retryable queued create remains visible until replay succeeds', async () => {
  installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const session = makeSession('session-queued-dirty-until-success');
  let createShouldFail = true;
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.endsWith('/api/sessions/create')) {
      if (createShouldFail) {
        return new Response(JSON.stringify({ error: 'server' }), {
          status: 503,
        });
      }

      return new Response(JSON.stringify(session), { status: 201 });
    }

    if (url.endsWith('/api/sessions/list')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    initializeStorage();

    const queuedResult = await saveSession(session);
    assert.equal(queuedResult.status, 'queued');
    assert.equal(getQueue().length, 1);
    await flushAsyncWork();

    assert.deepEqual(
      getSessions().map((entry) => entry.id),
      ['session-queued-dirty-until-success']
    );

    createShouldFail = false;
    retryCloudSync();
    await flushAsyncWork();

    assert.deepEqual(getQueue(), []);
    assert.deepEqual(getSessions(), []);
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
      nonce: 'other-nonce',
      epoch: 1,
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

test('sync lease acquisition retries when competing lease expires during backoff', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true },
  });

  const syncLockStorageKey = getScopedStorageKey('matmetrics_sync_lock');

  localStorage.setItem(
    syncLockStorageKey,
    JSON.stringify({
      owner: 'other-tab',
      expiresAt: Date.now() + 1,
      nonce: 'other-nonce',
      epoch: 1,
    })
  );

  try {
    assert.equal(await __tryAcquireSyncLeaseForTests(), true);

    const lease = JSON.parse(localStorage.getItem(syncLockStorageKey) ?? '{}');
    assert.notEqual(lease.owner, 'other-tab');
    assert.notEqual(lease.nonce, 'other-nonce');
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
  }
});

test('sync lease owner can renew its own lease', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const syncLockStorageKey = getScopedStorageKey('matmetrics_sync_lock');

  try {
    assert.equal(await __tryAcquireSyncLeaseForTests(), true);
    const beforeRenewal = JSON.parse(
      localStorage.getItem(syncLockStorageKey) ?? '{}'
    );

    assert.equal(__renewSyncLeaseForTests(), true);

    const afterRenewal = JSON.parse(
      localStorage.getItem(syncLockStorageKey) ?? '{}'
    );
    assert.equal(afterRenewal.owner, beforeRenewal.owner);
    assert.equal(afterRenewal.nonce, beforeRenewal.nonce);
    assert.ok(afterRenewal.expiresAt >= beforeRenewal.expiresAt);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
  }
});

test('stale sync lease owner cannot renew after another owner acquires lease', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const syncLockStorageKey = getScopedStorageKey('matmetrics_sync_lock');

  try {
    assert.equal(await __tryAcquireSyncLeaseForTests(), true);
    localStorage.setItem(
      syncLockStorageKey,
      JSON.stringify({
        owner: 'other-tab',
        expiresAt: Date.now() + 60_000,
        nonce: 'other-nonce',
        epoch: 99,
      })
    );

    assert.equal(__renewSyncLeaseForTests(), false);
    const currentLease = JSON.parse(
      localStorage.getItem(syncLockStorageKey) ?? '{}'
    );
    assert.equal(currentLease.owner, 'other-tab');
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
  }
});

test('sync loop exits when lease renewal fails mid-flight', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const syncQueueStorageKey = getSyncQueueStorageKey();
  const syncLockStorageKey = getScopedStorageKey('matmetrics_sync_lock');
  const firstSession = makeSession('session-renew-ok');
  const secondSession = makeSession('session-renew-fails');

  localStorage.setItem(
    syncQueueStorageKey,
    JSON.stringify([
      { type: 'CREATE', session: firstSession, queuedAt: 1 },
      { type: 'CREATE', session: secondSession, queuedAt: 2 },
    ])
  );

  let requestCount = 0;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalFetch = global.fetch;
  global.setInterval = (() =>
    createIntervalHandle()) as unknown as typeof setInterval;
  global.clearInterval = (() => undefined) as typeof clearInterval;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (!url.endsWith('/api/sessions/create')) {
      throw new Error(`Unexpected fetch: ${url}`);
    }

    requestCount += 1;
    if (requestCount === 1) {
      localStorage.setItem(
        syncLockStorageKey,
        JSON.stringify({
          owner: 'other-tab',
          expiresAt: Date.now() + 60_000,
          nonce: 'other-nonce',
          epoch: 2,
        })
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await __tryAcquireSyncLeaseForTests(), true);
    retryCloudSync();
    await flushAsyncWork();

    assert.ok(requestCount >= 1);
    assert.equal(getQueue().length, 2);
    const queue = getQueue();
    assertCreateOperation(queue[0]);
    assert.equal(queue[0].session.id, firstSession.id);
    assertCreateOperation(queue[1]);
    assert.equal(queue[1].session.id, secondSession.id);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    global.fetch = originalFetch;
  }
});

test('sync loop heartbeat cadence uses configured sync heartbeat value', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();
  __setSyncLeaseTimingForTests({
    ttlMs: 30_000,
    heartbeatMs: 7_777,
  });

  localStorage.setItem(
    getSyncQueueStorageKey(),
    JSON.stringify([
      {
        type: 'CREATE',
        session: makeSession('session-heartbeat-config'),
        queuedAt: 1,
      },
    ])
  );

  const intervals: number[] = [];
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalFetch = global.fetch;
  global.setInterval = ((_: TimerHandler, timeout?: number) => {
    intervals.push(Number(timeout));
    return createIntervalHandle();
  }) as unknown as typeof setInterval;
  global.clearInterval = (() => undefined) as typeof clearInterval;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/sessions/create')) {
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }

    if (url.endsWith('/api/sessions/list')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    retryCloudSync();
    await flushAsyncWork();

    assert.deepEqual(intervals, [7_777]);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    global.fetch = originalFetch;
  }
});

test('sync loop heartbeat cadence is clamped by ttl safety bound', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();
  __setSyncLeaseTimingForTests({
    ttlMs: 6_000,
    heartbeatMs: 10_000,
  });

  localStorage.setItem(
    getSyncQueueStorageKey(),
    JSON.stringify([
      {
        type: 'CREATE',
        session: makeSession('session-heartbeat-clamp'),
        queuedAt: 1,
      },
    ])
  );

  const intervals: number[] = [];
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalFetch = global.fetch;
  global.setInterval = ((_: TimerHandler, timeout?: number) => {
    intervals.push(Number(timeout));
    return createIntervalHandle();
  }) as unknown as typeof setInterval;
  global.clearInterval = (() => undefined) as typeof clearInterval;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/sessions/create')) {
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }

    if (url.endsWith('/api/sessions/list')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    retryCloudSync();
    await flushAsyncWork();

    assert.deepEqual(intervals, [3_000]);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    global.fetch = originalFetch;
  }
});

test('sync loop aborts safely when lease expires during a delayed sync request', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();
  __setSyncLeaseTimingForTests({
    ttlMs: 1_000,
    heartbeatMs: 10_000,
  });

  const syncQueueStorageKey = getSyncQueueStorageKey();
  const firstSession = makeSession('session-delayed-lease-expiry-1');
  const secondSession = makeSession('session-delayed-lease-expiry-2');

  localStorage.setItem(
    syncQueueStorageKey,
    JSON.stringify([
      { type: 'CREATE', session: firstSession, queuedAt: 1 },
      { type: 'CREATE', session: secondSession, queuedAt: 2 },
    ])
  );

  let requestCount = 0;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalFetch = global.fetch;
  global.setInterval = (() =>
    createIntervalHandle()) as unknown as typeof setInterval;
  global.clearInterval = (() => undefined) as typeof clearInterval;
  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (!url.endsWith('/api/sessions/create')) {
      throw new Error(`Unexpected fetch: ${url}`);
    }

    requestCount += 1;
    await delay(1_200);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    retryCloudSync();
    await delay(1_250);
    await flushAsyncWork();

    assert.ok(requestCount >= 1);
    assert.equal(getQueue().length, 2);
    const queue = getQueue();
    assertCreateOperation(queue[0]);
    assert.equal(queue[0].session.id, firstSession.id);
    assertCreateOperation(queue[1]);
    assert.equal(queue[1].session.id, secondSession.id);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    global.fetch = originalFetch;
  }
});

test('compare-and-verify lease acquisition retries under interleaving writes', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true },
  });

  const syncLockStorageKey = getScopedStorageKey('matmetrics_sync_lock');
  const originalSetItem = localStorage.setItem.bind(localStorage);
  let interleavingWriteCount = 0;

  localStorage.setItem = (key: string, value: string): void => {
    originalSetItem(key, value);
    if (key !== syncLockStorageKey || interleavingWriteCount > 0) {
      return;
    }

    interleavingWriteCount += 1;
    originalSetItem(
      key,
      JSON.stringify({
        owner: 'other-tab',
        expiresAt: Date.now() - 1,
        nonce: 'interleaving-write',
        epoch: 1,
      })
    );
  };

  try {
    assert.equal(await __tryAcquireSyncLeaseForTests(), true);
    assert.equal(interleavingWriteCount, 1);

    const lease = JSON.parse(localStorage.getItem(syncLockStorageKey) ?? '{}');
    assert.equal(typeof lease.owner, 'string');
    assert.notEqual(lease.owner, 'other-tab');
    assert.notEqual(lease.nonce, 'interleaving-write');
  } finally {
    localStorage.setItem = originalSetItem;
    teardownStorageListeners();
    __resetStorageStateForTests();
  }
});

test('only one contender acquires web lock when racing simultaneously', async () => {
  const { lockManager } = installBrowserEnv({ withLocks: true });
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const primaryAttempt = __tryAcquireSyncLeaseForTests();
  const competingAttempt = (async (): Promise<boolean> => {
    let acquired = false;
    await lockManager.request(
      'matmetrics-sync',
      { ifAvailable: true },
      async (lock) => {
        acquired = Boolean(lock);
        await delay(0);
      }
    );
    return acquired;
  })();

  try {
    const [primaryAcquired, competingAcquired] = await Promise.all([
      primaryAttempt,
      competingAttempt,
    ]);

    assert.equal(primaryAcquired || competingAcquired, true);
    assert.equal(primaryAcquired && competingAcquired, false);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
  }
});

test('clearAllData clears scoped sync queue and lock keys and emits storage sync event', () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const syncLockStorageKey = getScopedStorageKey('matmetrics_sync_lock');
  localStorage.setItem(getSyncQueueStorageKey(), JSON.stringify([]));
  localStorage.setItem(
    syncLockStorageKey,
    JSON.stringify({
      owner: 'tab-1',
      expiresAt: Date.now() + 60_000,
      nonce: 'tab-1-nonce',
      epoch: 1,
    })
  );

  let eventSessions: JudoSession[] | undefined;
  const onStorageSync = (event: Event) => {
    eventSessions = (event as CustomEvent<{ sessions: JudoSession[] }>).detail
      .sessions;
  };

  window.addEventListener('storageSync', onStorageSync);

  try {
    clearAllData();

    assert.equal(localStorage.getItem(getSyncQueueStorageKey()), null);
    assert.equal(localStorage.getItem(syncLockStorageKey), null);
    assert.deepEqual(eventSessions, []);
  } finally {
    window.removeEventListener('storageSync', onStorageSync);
    teardownStorageListeners();
    __resetStorageStateForTests();
  }
});

test('setGitHubSyncStatus persists via preferences and remains observable after reload/init', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const preferencesStorageKey = getScopedStorageKey(
    'matmetrics_user_preferences'
  );
  let preferenceState = {
    ...DEFAULT_USER_PREFERENCES,
    gitHub: { ...DEFAULT_USER_PREFERENCES.gitHub },
  };

  __setStorageDependencyOverridesForTests({
    resolveAuthenticatedUserId: () => 'user-1',
    readPreferences: () => preferenceState,
    persistGitHubSettingsPreference: async (_uid, gitHub) => {
      preferenceState = {
        ...preferenceState,
        gitHub,
      };
      localStorage.setItem(
        preferencesStorageKey,
        JSON.stringify(preferenceState)
      );
    },
  });

  try {
    setGitHubSyncStatus('success');
    await flushAsyncWork();

    assert.equal(getGitHubSyncStatus(), 'success');

    // Simulate reload by replacing in-memory preference state from persisted cache.
    preferenceState = {
      ...DEFAULT_USER_PREFERENCES,
      gitHub: { ...DEFAULT_USER_PREFERENCES.gitHub },
    };
    initializeStorage();
    preferenceState = JSON.parse(
      localStorage.getItem(preferencesStorageKey) ?? '{}'
    );

    assert.equal(getGitHubSyncStatus(), 'success');
    assert.ok(preferenceState.gitHub.lastSyncTime);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
  }
});

test('setGitHubSyncStatus warns and no-ops when no authenticated user is available', async () => {
  installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

  const preferenceState = {
    ...DEFAULT_USER_PREFERENCES,
    gitHub: { ...DEFAULT_USER_PREFERENCES.gitHub },
  };
  let persisted = false;

  __setStorageDependencyOverridesForTests({
    resolveAuthenticatedUserId: () => null,
    readPreferences: () => preferenceState,
    persistGitHubSettingsPreference: async () => {
      persisted = true;
    },
  });

  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = ((message: string) => {
    warnings.push(message);
  }) as typeof console.warn;

  try {
    setGitHubSyncStatus('error');
    await flushAsyncWork();

    assert.equal(persisted, false);
    assert.equal(getGitHubSyncStatus(), 'idle');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /no authenticated user/i);
  } finally {
    console.warn = originalWarn;
    teardownStorageListeners();
    __resetStorageStateForTests();
  }
});
