import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBackoffMs, randomVerifyDelayMs, createSyncLeaseNonce, getNextSyncLeaseEpoch, readSyncLease, initializeSyncLeaseModule, sleep, setActiveSyncLease, tryAcquireSyncLease, SYNC_LOCK_BACKOFF_MIN_MS, SYNC_LOCK_BACKOFF_MAX_MS, SYNC_LOCK_VERIFY_DELAY_MIN_MS, SYNC_LOCK_VERIFY_DELAY_MAX_MS, type LeaseTakeoverDiagnosticPayload, type SyncLease } from './sync-lease';

test('sync-lease module', async (t) => {
  await t.test('randomBackoffMs', async (t) => {
    await t.test('returns a value within expected range', () => {
      for (let i = 0; i < 100; i++) {
        const value = randomBackoffMs();
        assert(value >= SYNC_LOCK_BACKOFF_MIN_MS);
        assert(value <= SYNC_LOCK_BACKOFF_MAX_MS);
      }
    });

    await t.test('returns different values on multiple calls', () => {
      const values = new Set(
        Array.from({ length: 20 }, () => randomBackoffMs())
      );
      assert(values.size > 1);
    });
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
        global.localStorage.setItem('matmetrics_sync_lock_test', JSON.stringify(lease));
        const read = readSyncLease();
        assert.deepEqual(read, lease);
      }
    });

    afterEach();
  });

  await t.test('sleep', async () => {
    const before = Date.now();
    await sleep(50);
    const after = Date.now();
    assert(after - before >= 40);
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
          expiresAt: Date.now() + 60_000,
          nonce: 'contender-nonce',
          epoch: 200,
        };
        if (typeof localStorage === 'undefined') {
          throw new Error('localStorage unavailable in test environment');
        }
        localStorage.setItem('matmetrics_sync_lock_test', JSON.stringify(contender));

        const acquired = await tryAcquireSyncLease();
        assert.equal(acquired, true);

        const persistedLease = readSyncLease();
        assert.equal(persistedLease?.owner, 'test-owner');
        assert(diagnostics.some((item) => item.reason === 'forced-reclaim'));
        afterEach();
      }
    );

    await t.test('does not force reclaim a fresh lease before threshold', async () => {
      beforeEach();
      const contender: SyncLease = {
        owner: 'contender-owner',
        expiresAt: Date.now() + 60_000,
        nonce: 'fresh-contender',
        epoch: 300,
      };
      if (typeof localStorage === 'undefined') {
        throw new Error('localStorage unavailable in test environment');
      }
      localStorage.setItem('matmetrics_sync_lock_test', JSON.stringify(contender));

      const originalNow = Date.now;
      let acquired = false;
      try {
        Date.now = () => 1_000;
        acquired = await tryAcquireSyncLease();
      } finally {
        Date.now = originalNow;
      }

      assert.equal(acquired, false);
      assert.deepEqual(readSyncLease(), contender);
      afterEach();
    });
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
