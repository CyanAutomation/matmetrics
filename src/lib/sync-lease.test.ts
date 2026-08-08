import assert from 'node:assert/strict';
import test from 'node:test';
import {
  randomBackoffMs,
  randomVerifyDelayMs,
  createSyncLeaseNonce,
  getNextSyncLeaseEpoch,
  readSyncLease,
  initializeSyncLeaseModule,
  releaseSyncLease,
  setActiveSyncLease,
  tryAcquireSyncLease,
  SYNC_LOCK_BACKOFF_MIN_MS,
  SYNC_LOCK_BACKOFF_MAX_MS,
  SYNC_LOCK_VERIFY_DELAY_MIN_MS,
  SYNC_LOCK_VERIFY_DELAY_MAX_MS,
  type LeaseTakeoverDiagnosticPayload,
  type SyncLease,
} from './sync-lease';

// Mock localStorage for Node.js test environment
class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  get length(): number {
    return this.store.size;
  }
}

// Set up global localStorage mock for Node.js test environment
const localStorageMock = new LocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});
Object.defineProperty(global, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

// Set up global window mock
const windowMock = Object.assign(new EventTarget(), {
  localStorage: localStorageMock,
  location: { origin: 'http://localhost' },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: windowMock,
});
Object.defineProperty(global, 'window', {
  configurable: true,
  value: windowMock,
});

// Disable navigator.locks in the test environment so tests use storage-based acquisition
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'locks', {
    value: undefined,
    configurable: true,
  });
}

test('sync-lease module', async (t) => {
  await t.test('randomBackoffMs', async (t) => {
    await t.test('returns a value within expected range', () => {
      for (let i = 0; i < 100; i++) {
        const value = randomBackoffMs();
        assert(value >= SYNC_LOCK_BACKOFF_MIN_MS);
        assert(value <= SYNC_LOCK_BACKOFF_MAX_MS);
      }
    });

    await t.test(
      'maps injected random values to deterministic boundaries',
      () => {
        assert.strictEqual(
          randomBackoffMs(() => 0),
          SYNC_LOCK_BACKOFF_MIN_MS
        );
        assert.strictEqual(
          randomBackoffMs(() => 0.999999),
          SYNC_LOCK_BACKOFF_MAX_MS
        );
      }
    );
  });

  await t.test('randomVerifyDelayMs', async (t) => {
    await t.test('returns a value within expected range', () => {
      for (let i = 0; i < 100; i++) {
        const value = randomVerifyDelayMs();
        assert(value >= SYNC_LOCK_VERIFY_DELAY_MIN_MS);
        assert(value <= SYNC_LOCK_VERIFY_DELAY_MAX_MS);
      }
    });
  });

  await t.test('createSyncLeaseNonce', async (t) => {
    await t.test('creates unique nonces', () => {
      const nonces = new Set(
        Array.from({ length: 10 }, () => createSyncLeaseNonce())
      );
      assert.equal(nonces.size, 10);
    });

    await t.test('creates strings', () => {
      const nonce = createSyncLeaseNonce();
      assert.equal(typeof nonce, 'string');
      assert(nonce.length > 0);
    });
  });

  await t.test('getNextSyncLeaseEpoch', async (t) => {
    await t.test('returns increasing epochs', () => {
      const epoch1 = getNextSyncLeaseEpoch(100);
      const epoch2 = getNextSyncLeaseEpoch(epoch1);
      const epoch3 = getNextSyncLeaseEpoch(epoch2);

      assert(epoch1 > 100);
      assert(epoch2 > epoch1);
      assert(epoch3 > epoch2);
    });

    await t.test('ensures epoch is not less than current timestamp', () => {
      const before = Date.now();
      const epoch = getNextSyncLeaseEpoch(0);
      const after = Date.now();

      assert(epoch >= before);
      assert(epoch <= after + 1000); // small buffer
    });
  });

  await t.test('readSyncLease', async (t) => {
    beforeEach();

    await t.test('returns null when no lease exists', () => {
      assert.strictEqual(readSyncLease(), null);
    });

    await t.test('parses a valid lease from localStorage', () => {
      const lease: SyncLease = {
        owner: 'owner-1',
        expiresAt: Date.now() + 30000,
        nonce: 'nonce-123',
        epoch: 12345,
      };
      if (typeof global.localStorage !== 'undefined') {
        global.localStorage.setItem(
          'matmetrics_sync_lock_test',
          JSON.stringify(lease)
        );
        const read = readSyncLease();
        assert.deepEqual(read, lease);
      }
    });

    await t.test('ignores malformed persisted lease values', () => {
      if (typeof global.localStorage === 'undefined') {
        throw new Error('localStorage unavailable in test environment');
      }
      global.localStorage.setItem('matmetrics_sync_lock_test', '{not-json}');
      assert.equal(readSyncLease(), null);
    });

    afterEach();
  });

  await t.test('releaseSyncLease', async (t) => {
    await t.test(
      'does not remove persisted lease when local active lease is stale',
      () => {
        beforeEach();

        const tabALease = {
          mode: 'storage' as const,
          owner: 'owner-a',
          nonce: 'nonce-a',
          epoch: 10,
        };
        const tabBLease: SyncLease = {
          owner: 'owner-b',
          nonce: 'nonce-b',
          epoch: 11,
          expiresAt: Date.now() + 30_000,
        };

        setActiveSyncLease(tabALease);
        if (typeof localStorage === 'undefined') {
          throw new Error('localStorage unavailable in test environment');
        }
        localStorage.setItem(
          'matmetrics_sync_lock_test',
          JSON.stringify(tabBLease)
        );

        releaseSyncLease();

        assert.deepEqual(readSyncLease(), tabBLease);
        assert.equal(readSyncLease()?.owner, 'owner-b');
        afterEach();
      }
    );
  });
  await t.test('tryAcquireSyncLease', async (t) => {
    await t.test(
      'forces reclaim after stable observations of a live competing lease',
      async () => {
        beforeEach();
        const diagnostics: LeaseTakeoverDiagnosticPayload[] = [];
        initializeSyncLeaseModule({
          syncOwnerId: 'test-owner',
          syncLockTtlMs: 45000,
          getSyncLockStorageKey: () => 'matmetrics_sync_lock_test',
          isStorageEventForKey: (event, key) =>
            event.storageArea === global.localStorage && event.key === key,
          emitLeaseTakeoverDiagnostic: (payload) => diagnostics.push(payload),
        });

        const contender: SyncLease = {
          owner: 'contender-owner',
          expiresAt: 61_000,
          nonce: 'contender-nonce',
          epoch: 200,
        };
        if (typeof localStorage === 'undefined') {
          throw new Error('localStorage unavailable in test environment');
        }
        localStorage.setItem(
          'matmetrics_sync_lock_test',
          JSON.stringify(contender)
        );

        const delays = await withDeterministicLeaseTiming(async () => {
          const acquired = await tryAcquireSyncLease();
          assert.equal(acquired, true);
        });

        const persistedLease = readSyncLease();
        assert.equal(persistedLease?.owner, 'test-owner');
        assert(diagnostics.some((item) => item.reason === 'forced-reclaim'));
        assert.deepEqual(delays, [
          SYNC_LOCK_BACKOFF_MIN_MS,
          SYNC_LOCK_BACKOFF_MIN_MS,
          SYNC_LOCK_VERIFY_DELAY_MIN_MS,
        ]);
        afterEach();
      }
    );

    await t.test(
      'backs off without reclaiming while competing lease keeps changing',
      async () => {
        beforeEach();
        if (typeof localStorage === 'undefined') {
          throw new Error('localStorage unavailable in test environment');
        }

        let contenderEpoch = 300;
        const writeFreshContender = () => {
          const contender: SyncLease = {
            owner: 'contender-owner',
            expiresAt: 61_000,
            nonce: `fresh-contender-${contenderEpoch}`,
            epoch: contenderEpoch,
          };
          localStorage.setItem(
            'matmetrics_sync_lock_test',
            JSON.stringify(contender)
          );
          contenderEpoch += 1;
        };
        writeFreshContender();

        const delays = await withDeterministicLeaseTiming(
          async () => {
            const acquired = await tryAcquireSyncLease();
            assert.equal(acquired, false);
          },
          (ms) => {
            if (ms === SYNC_LOCK_BACKOFF_MIN_MS) {
              writeFreshContender();
            }
          }
        );

        assert.deepEqual(
          delays,
          Array.from({ length: 6 }, () => SYNC_LOCK_BACKOFF_MIN_MS)
        );
        assert.equal(readSyncLease()?.owner, 'contender-owner');
        afterEach();
      }
    );
  });
});

function beforeEach() {
  if (typeof global.localStorage !== 'undefined') {
    global.localStorage.clear();
  }
  setActiveSyncLease(null);
  initializeSyncLeaseModule({
    syncOwnerId: 'test-owner',
    syncLockTtlMs: 45000,
    getSyncLockStorageKey: () => 'matmetrics_sync_lock_test',
    isStorageEventForKey: (event, key) =>
      event.storageArea === global.localStorage && event.key === key,
    emitLeaseTakeoverDiagnostic: () => {},
  });
}

function afterEach() {
  if (typeof global.localStorage !== 'undefined') {
    global.localStorage.clear();
  }
  setActiveSyncLease(null);
}

async function withDeterministicLeaseTiming(
  run: () => Promise<void>,
  onDelay?: (ms: number) => void
): Promise<number[]> {
  const delays: number[] = [];
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalSetTimeout = globalThis.setTimeout;

  try {
    Date.now = () => 1_000;
    Math.random = () => 0;
    globalThis.setTimeout = ((
      handler: Parameters<typeof setTimeout>[0],
      timeout?: number,
      ...args: any[]
    ) => {
      const ms = timeout ?? 0;
      delays.push(ms);
      onDelay?.(ms);
      queueMicrotask(() => {
        if (typeof handler === 'function') {
          handler(...args);
        }
      });
      return originalSetTimeout(() => undefined, 0);
    }) as unknown as typeof setTimeout;

    await run();
    return delays;
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    globalThis.setTimeout = originalSetTimeout;
  }
}
