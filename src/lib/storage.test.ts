import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { getScopedStorageKey, setActiveUserId } from './client-identity';
import {
  __renewSyncLeaseForTests,
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
  teardownStorageListeners,
} from './storage';
import { getQueue, getSyncQueueStorageKey } from './sync-queue';
import type { JudoSession } from './types';
import { DEFAULT_USER_PREFERENCES } from './user-preferences';

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
      return new Response(JSON.stringify(listRequests === 1 ? [] : [session]), {
        status: 200,
      });
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
      nonce: 'other-nonce',
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
  const originalFetch = global.fetch;
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
        })
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await __tryAcquireSyncLeaseForTests(), true);
    retryCloudSync();
    await flushAsyncWork();

    const queue = getQueue();
    const queuedOperation = queue[0];

    assert.equal(requestCount, 1);
    assert.equal(queue.length, 1);
    assert.equal(queuedOperation.type, 'CREATE');
    assert.equal(queuedOperation.session.id, secondSession.id);
  } finally {
    teardownStorageListeners();
    __resetStorageStateForTests();
    global.fetch = originalFetch;
  }
});

test('compare-and-verify lease acquisition retries under interleaving writes', async () => {
  const { localStorage } = installBrowserEnv();
  setActiveUserId('user-1');
  __resetStorageStateForTests();

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
