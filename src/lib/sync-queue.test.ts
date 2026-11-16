import assert from 'node:assert/strict';
import test from 'node:test';
import { getScopedStorageKey } from './client-identity';
import type { SyncOperation } from './sync-queue';

let failQueueStorageWrites = false;

class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (failQueueStorageWrites && key === syncQueueModule.getSyncQueueStorageKey()) {
      const error = new Error('quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  clear(): void {
    this.store.clear();
  }
}

const localStorageMock = new LocalStorageMock();
// Ensure the same localStorage instance is used everywhere
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});
Object.defineProperty(global, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});
(globalThis as any).window = globalThis;
// Disable navigator.locks so that storage-based locking is used for tests
// (navigator.locks is available in Node.js but may cause race conditions in tests)
if (typeof globalThis.navigator !== 'undefined') {
  try {
    Object.defineProperty(globalThis.navigator, 'locks', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  } catch {
    // If we can't override navigator.locks, the getter returns an object
    // We need to ensure tryAcquireNavigatorQueueLock returns false
  }
}

// NOW require the sync-queue module AFTER localStorage is set up
const syncQueueModule = require('./sync-queue');
const {
  __testInternals,
  clearQueue,
  getSyncQueueStorageKey,
  getQueue,
  getPendingOperationCount,
  getConflictOperationCount,
  getAuthenticationBlockedOperationCount,
  getRejectedOperationCount,
  getSyncQueueStorageError,
  hasPendingOperations,
  resumeAuthenticationBlockedOperations,
  queueOperation,
  removeOperationByIdentity,
  setQueue,
  SyncQueuePersistenceError,
} = syncQueueModule;
import type { JudoSession } from './types';

function makeSession(id: string): JudoSession {
  return {
    id,
    date: '2026-01-01',
    duration: 60,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: [],
  };
}

function createOp(id: string, queuedAt: number): SyncOperation {
  return {
    type: 'UPDATE',
    session: makeSession(id),
    queuedAt,
  };
}

function resetQueue(initialQueue?: SyncOperation[]): void {
  failQueueStorageWrites = false;
  localStorage.clear();
  __testInternals.resetQueueStorageStateForTests();
  if (initialQueue) {
    localStorage.setItem(
      getSyncQueueStorageKey(),
      JSON.stringify(initialQueue)
    );
  }
}

async function removeOperationByIndexLegacy(index: number): Promise<void> {
  const baseQueue = getQueue();
  const queue = [...baseQueue];
  queue.splice(index, 1);
  await setQueue(queue, baseQueue);
}

function getLastQueuedAtStorageKey(): string {
  return getScopedStorageKey('matmetrics_last_queued_at');
}

test.afterEach(() => {
  failQueueStorageWrites = false;
  __testInternals.resetLeaseTtlForTests();
  __testInternals.resetQueueStorageStateForTests();
});

test('queueOperation timestamps operations and preserves insertion order', async () => {
  resetQueue();

  await queueOperation({ type: 'CREATE', session: makeSession('session-1') });
  await queueOperation({
    type: 'UPDATE',
    session: { ...makeSession('session-1'), notes: 'updated' },
  });

  const queue = getQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].type, 'CREATE');
  if (queue[0].type === 'CREATE') {
    assert.equal(queue[0].session.notes, 'updated');
  }
  assert.ok(
    queue.every((operation: SyncOperation) =>
      Number.isFinite(operation.queuedAt)
    )
  );
});

test('queued conflict and authentication issues are separately counted and auth can resume', async () => {
  const conflict = {
    type: 'UPDATE',
    session: makeSession('session-conflict'),
    queuedAt: 100,
    syncIssue: { type: 'conflict', status: 412 },
  } satisfies Extract<SyncOperation, { type: 'UPDATE' }>;
  const authenticationBlocked = {
    type: 'UPDATE',
    session: makeSession('session-auth-blocked'),
    queuedAt: 101,
    syncIssue: { type: 'authentication', status: 401 },
  } satisfies Extract<SyncOperation, { type: 'UPDATE' }>;
  resetQueue([conflict, authenticationBlocked]);

  assert.equal(getPendingOperationCount(), 0);
  assert.equal(getConflictOperationCount(), 1);
  assert.equal(getAuthenticationBlockedOperationCount(), 1);
  assert.equal(hasPendingOperations(), false);

  await resumeAuthenticationBlockedOperations();

  assert.deepEqual(getQueue(), [
    conflict,
    { type: 'UPDATE', session: authenticationBlocked.session, queuedAt: 101 },
  ]);
  assert.equal(getPendingOperationCount(), 1);
  assert.equal(getConflictOperationCount(), 1);
  assert.equal(getAuthenticationBlockedOperationCount(), 0);
  assert.equal(hasPendingOperations(), true);
});

test('queueOperation uses persisted last queuedAt to recover from stale in-memory state', async () => {
  resetQueue();
  await queueOperation({ type: 'CREATE', session: makeSession('session-1') });
  const firstOperationQueuedAt = getQueue()[0].queuedAt;

  const lastQueuedAtKey = getLastQueuedAtStorageKey();
  localStorage.setItem(
    lastQueuedAtKey,
    String(firstOperationQueuedAt + 10_000)
  );

  await queueOperation({ type: 'CREATE', session: makeSession('session-2') });

  const queue = getQueue();
  assert.equal(queue.length, 2);
  assert.equal(queue[1].queuedAt, firstOperationQueuedAt + 10_001);
  assert.equal(
    localStorage.getItem(lastQueuedAtKey),
    String(queue[1].queuedAt)
  );
});

test('queueOperation remains strictly monotonic across interleaved two-tab writes', async () => {
  resetQueue();
  const lastQueuedAtKey = getLastQueuedAtStorageKey();

  await queueOperation({ type: 'CREATE', session: makeSession('session-1') });
  const firstQueuedAt = getQueue()[0].queuedAt;

  const tabBQueuedAt = firstQueuedAt + 100;
  localStorage.setItem(lastQueuedAtKey, String(tabBQueuedAt));

  await queueOperation({ type: 'CREATE', session: makeSession('session-2') });
  const queueAfterTabASecondWrite = getQueue();
  const secondQueuedAt = queueAfterTabASecondWrite[1].queuedAt;
  assert.equal(secondQueuedAt, tabBQueuedAt + 1);

  const tabBNextQueuedAt = secondQueuedAt + 50;
  localStorage.setItem(lastQueuedAtKey, String(tabBNextQueuedAt));

  await queueOperation({ type: 'CREATE', session: makeSession('session-3') });
  const queue = getQueue();
  const thirdQueuedAt = queue[2].queuedAt;

  assert.equal(thirdQueuedAt, tabBNextQueuedAt + 1);
  assert.ok(firstQueuedAt < secondQueuedAt);
  assert.ok(secondQueuedAt < thirdQueuedAt);
});

test('setQueue preserves a newer concurrent operation with the same identity', async () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentNewerOperation = createOp('session-1', 200);

  resetQueue([concurrentNewerOperation]);

  await setQueue([baseOperation], [baseOperation]);

  assert.deepEqual(getQueue(), [concurrentNewerOperation]);
});

test('clearQueue keeps a newer concurrent operation instead of deleting it', async () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentNewerOperation = createOp('session-1', 200);

  resetQueue([concurrentNewerOperation]);

  await clearQueue([baseOperation]);

  assert.deepEqual(getQueue(), [concurrentNewerOperation]);
});

test('setQueue retains concurrent operations that share queuedAt with stale base snapshots', async () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentSameQueuedAt: SyncOperation = {
    type: 'DELETE',
    id: 'session-2',
    queuedAt: 100,
  };

  resetQueue([baseOperation, concurrentSameQueuedAt]);

  await setQueue([baseOperation], [baseOperation]);

  assert.deepEqual(getQueue(), [concurrentSameQueuedAt, baseOperation]);
});

test('concurrent create and update with identical queuedAt coalesce deterministically', async () => {
  const baseUpdate: SyncOperation = {
    type: 'UPDATE',
    session: { ...makeSession('session-1'), notes: 'from-base-tab' },
    queuedAt: 100,
  };
  const concurrentCreate: SyncOperation = {
    type: 'CREATE',
    session: { ...makeSession('session-1'), notes: 'from-concurrent-tab' },
    queuedAt: 100,
  };

  resetQueue([concurrentCreate]);

  await setQueue([baseUpdate], [baseUpdate]);

  assert.deepEqual(getQueue(), [
    {
      type: 'CREATE',
      session: { ...makeSession('session-1'), notes: 'from-base-tab' },
      queuedAt: 100,
    },
  ]);
});

test('setQueue deterministically keeps one equal-timestamp concurrent update for the same identity', async () => {
  const baseUpdate: SyncOperation = {
    type: 'UPDATE',
    session: { ...makeSession('session-1'), notes: 'from-base-tab' },
    queuedAt: 100,
  };
  const concurrentUpdate: SyncOperation = {
    type: 'UPDATE',
    session: { ...makeSession('session-1'), notes: 'from-concurrent-tab' },
    queuedAt: 100,
  };

  resetQueue([concurrentUpdate]);

  await setQueue([baseUpdate], [baseUpdate]);

  assert.deepEqual(getQueue(), [concurrentUpdate]);
});

test('clearQueue removes the persisted storage key when there is no concurrent work', async () => {
  resetQueue([createOp('session-1', 100)]);

  await clearQueue([createOp('session-1', 100)]);

  assert.equal(localStorage.getItem(getSyncQueueStorageKey()), null);
  assert.deepEqual(getQueue(), []);
});

test('clearQueue keeps concurrent operations when queuedAt matches stale base snapshot', async () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentSameQueuedAt: SyncOperation = {
    type: 'UPDATE',
    session: { ...makeSession('session-2'), notes: 'concurrent' },
    queuedAt: 100,
  };

  resetQueue([baseOperation, concurrentSameQueuedAt]);

  await clearQueue([baseOperation]);

  assert.deepEqual(getQueue(), [concurrentSameQueuedAt]);
});

test('malformed JSON is quarantined and cleared on first read', async () => {
  resetQueue();
  const queueKey = getSyncQueueStorageKey();
  const quarantineKey = `${queueKey}__corrupt_backup`;
  const malformedPayload = '{"invalid":';
  localStorage.setItem(queueKey, malformedPayload);

  const warningCalls: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warningCalls.push(args);
  };

  try {
    assert.deepEqual(getQueue(), []);

    assert.equal(localStorage.getItem(queueKey), null);
    assert.equal(localStorage.getItem(quarantineKey), malformedPayload);
    assert.equal(warningCalls.length, 1);

    const warningContext = warningCalls[0][1] as {
      key: string;
      errorType: string;
      quarantined: boolean;
      quarantineKey: string;
    };
    assert.equal(warningContext.key, queueKey);
    assert.equal(warningContext.errorType, 'SyntaxError');
    assert.equal(warningContext.quarantined, true);
    assert.equal(warningContext.quarantineKey, quarantineKey);
  } finally {
    console.warn = originalWarn;
  }
});

test('subsequent reads after malformed JSON return stable empty queue without repeated parse warnings', async () => {
  resetQueue();
  const queueKey = getSyncQueueStorageKey();
  localStorage.setItem(queueKey, '{bad json');

  let warningCount = 0;
  const originalWarn = console.warn;
  console.warn = () => {
    warningCount += 1;
  };

  try {
    assert.deepEqual(getQueue(), []);
    assert.deepEqual(getQueue(), []);
    assert.equal(warningCount, 1);
    assert.equal(localStorage.getItem(queueKey), null);
  } finally {
    console.warn = originalWarn;
  }
});

test('storage lease heartbeat renews during long-running critical section', async () => {
  resetQueue();
  __testInternals.setLeaseTtlForTests(150);
  let now = 1_000;
  let heartbeat: (() => void) | undefined;
  let renewalInterval: number | undefined;
  let criticalSectionStarted: (() => void) | undefined;
  const criticalSectionStart = new Promise<void>((resolve) => {
    criticalSectionStarted = resolve;
  });
  let finishCriticalSection: (() => void) | undefined;
  const criticalSectionFinished = new Promise<void>((resolve) => {
    finishCriticalSection = resolve;
  });
  let initialLease:
    ReturnType<typeof __testInternals.readQueueLease> | undefined;

  const leasePromise = __testInternals.withQueueWriteLease(
    async () => {
      initialLease = __testInternals.readQueueLease();
      criticalSectionStarted?.();
      await criticalSectionFinished;
    },
    {
      now: () => now,
      scheduler: {
        schedule(callback: () => void, intervalMs: number): object {
          heartbeat = callback;
          renewalInterval = intervalMs;
          return {};
        },
        cancel(): void {},
      },
    }
  );

  await criticalSectionStart;
  assert.ok(initialLease);
  assert.equal(renewalInterval, 50);
  assert.ok(renewalInterval);
  assert.ok(heartbeat);
  now += renewalInterval;
  heartbeat();

  const renewedLease = __testInternals.readQueueLease();
  assert.ok(renewedLease);
  assert.equal(renewedLease.owner, initialLease.owner);
  assert.equal(renewedLease.nonce, initialLease.nonce);
  assert.equal(renewedLease.epoch, initialLease.epoch);
  assert.equal(
    renewedLease.expiresAt,
    initialLease.expiresAt + renewalInterval
  );

  finishCriticalSection?.();
  await leasePromise;
});

test('stale owner commit is prevented after lease expiry and competing re-acquire', async () => {
  resetQueue();
  let now = 1_000;
  __testInternals.setLeaseTtlForTests(20);
  __testInternals.setLeaseClockForTests(() => now);
  __testInternals.disableLeaseRenewalForTests();

  await __testInternals.withQueueWriteLease(async () => {
    const ownerALease = __testInternals.readQueueLease();
    assert.ok(ownerALease);

    now = ownerALease.expiresAt + 1;
    const ownerBLease = __testInternals.acquireCompetingStorageLease('owner-b');

    assert.equal(ownerBLease.owner, 'owner-b');
    assert.notEqual(ownerBLease.owner, ownerALease.owner);
    assert.notEqual(ownerBLease.nonce, ownerALease.nonce);
    assert.ok(ownerBLease.epoch > ownerALease.epoch);
    assert.deepEqual(__testInternals.readQueueLease(), ownerBLease);
    assert.throws(
      () =>
        __testInternals.writeQueueWithLatestMerge([
          createOp('session-stale', now),
        ]),
      /Storage lease is no longer owned by current tab/
    );
    assert.deepEqual(getQueue(), []);
  });
});

test('a lease expiring after a synchronous queue commit does not report a failed save', async () => {
  resetQueue();
  let now = 1_000;
  __testInternals.setLeaseTtlForTests(20);
  __testInternals.setLeaseClockForTests(() => now);
  __testInternals.disableLeaseRenewalForTests();

  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    if (key === getSyncQueueStorageKey()) {
      now += 21;
    }
  };

  try {
    await queueOperation({
      type: 'CREATE',
      session: makeSession('session-committed-before-expiry'),
    });

    const [savedOperation] = getQueue();
    assert.ok(savedOperation);
    if (savedOperation.type === 'DELETE') {
      assert.fail('Expected the committed operation to be a create.');
    }
    assert.equal(savedOperation.session.id, 'session-committed-before-expiry');
    assert.equal(getSyncQueueStorageError(), null);
  } finally {
    localStorage.setItem = originalSetItem;
  }
});

test('identity-based removal succeeds under concurrent writes where index-based removal fails', async () => {
  const opA = createOp('session-a', 100);
  const opB = createOp('session-b', 200);
  const opC = createOp('session-c', 300);
  resetQueue([opA, opB, opC]);

  const staleSnapshot = getQueue();
  const staleIndexForB = 1;
  const staleTargetB = staleSnapshot[staleIndexForB];

  // Simulate a concurrent writer that removed opA while the caller still holds stale index data.
  await setQueue([staleSnapshot[1], staleSnapshot[2]], staleSnapshot);

  // Legacy behavior removes by positional index and therefore deletes opC, not opB.
  await removeOperationByIndexLegacy(staleIndexForB);
  assert.deepEqual(getQueue(), [opB]);

  // New behavior removes by stable identity key and correctly removes the intended opB.
  resetQueue([opB, opC]);
  await removeOperationByIdentity(staleTargetB);
  assert.deepEqual(getQueue(), [opC]);
});

test('coalesces create then update into create with latest payload', async () => {
  resetQueue();
  const created = makeSession('session-1');
  const updated = { ...created, notes: 'latest note' };

  await setQueue(
    [
      { type: 'CREATE', session: created, queuedAt: 100 },
      { type: 'UPDATE', session: updated, queuedAt: 200 },
    ],
    []
  );

  assert.deepEqual(getQueue(), [
    { type: 'CREATE', session: updated, queuedAt: 100 },
  ]);
});

test('coalesces create then delete into no-op', async () => {
  resetQueue();

  await setQueue(
    [
      { type: 'CREATE', session: makeSession('session-1'), queuedAt: 100 },
      { type: 'DELETE', id: 'session-1', queuedAt: 200 },
    ],
    []
  );

  assert.deepEqual(getQueue(), []);
});

test('coalesces update then delete into delete', async () => {
  resetQueue();

  await setQueue(
    [
      { type: 'UPDATE', session: makeSession('session-1'), queuedAt: 100 },
      { type: 'DELETE', id: 'session-1', queuedAt: 200 },
    ],
    []
  );

  assert.deepEqual(getQueue(), [
    {
      type: 'DELETE',
      id: 'session-1',
      session: makeSession('session-1'),
      queuedAt: 200,
    },
  ]);
});

test('coalescing local updates keeps the revision from the original read', async () => {
  resetQueue();

  await setQueue(
    [
      {
        type: 'UPDATE',
        session: { ...makeSession('session-versioned'), keikoRevision: 4 },
        expectedRevision: 4,
        queuedAt: 100,
      } as SyncOperation,
      {
        type: 'UPDATE',
        session: {
          ...makeSession('session-versioned'),
          notes: 'latest offline edit',
          keikoRevision: 7,
        },
        expectedRevision: 7,
        queuedAt: 200,
      } as SyncOperation,
    ],
    []
  );

  assert.deepEqual(getQueue(), [
    {
      type: 'UPDATE',
      session: {
        ...makeSession('session-versioned'),
        notes: 'latest offline edit',
        keikoRevision: 7,
      },
      expectedRevision: 4,
      queuedAt: 200,
    },
  ]);
});

test('coalescing an update then delete preserves the client revision', async () => {
  resetQueue();

  await setQueue(
    [
      { type: 'UPDATE', session: makeSession('session-1'), queuedAt: 100 },
      {
        type: 'DELETE',
        id: 'session-1',
        revisionSha: 'sha-observed-before-delete',
        queuedAt: 200,
      },
    ],
    []
  );

  assert.deepEqual(getQueue(), [
    {
      type: 'DELETE',
      id: 'session-1',
      session: makeSession('session-1'),
      revisionSha: 'sha-observed-before-delete',
      queuedAt: 200,
    },
  ]);
});

test('coalesces delete then create into recreate create', async () => {
  resetQueue();
  const recreated = { ...makeSession('session-1'), notes: 'recreated' };

  await setQueue(
    [
      { type: 'DELETE', id: 'session-1', queuedAt: 100 },
      { type: 'CREATE', session: recreated, queuedAt: 200 },
    ],
    []
  );

  assert.deepEqual(getQueue(), [
    { type: 'CREATE', session: recreated, queuedAt: 200 },
  ]);
});

test('coalesces delete then create then update into create with latest payload', async () => {
  resetQueue();
  const recreated = { ...makeSession('session-1'), notes: 'recreated' };
  const updatedAfterRecreate = {
    ...recreated,
    notes: 'updated after recreate',
  };

  await setQueue(
    [
      { type: 'DELETE', id: 'session-1', queuedAt: 100 },
      { type: 'CREATE', session: recreated, queuedAt: 200 },
      { type: 'UPDATE', session: updatedAfterRecreate, queuedAt: 300 },
    ],
    []
  );

  assert.deepEqual(getQueue(), [
    { type: 'CREATE', session: updatedAfterRecreate, queuedAt: 200 },
  ]);
});

test('coalesces delete then update into create to avoid missing-record updates', async () => {
  resetQueue();
  const updatedAfterDelete = {
    ...makeSession('session-1'),
    notes: 'updated after delete',
  };

  await setQueue(
    [
      { type: 'DELETE', id: 'session-1', queuedAt: 100 },
      { type: 'UPDATE', session: updatedAfterDelete, queuedAt: 200 },
    ],
    []
  );

  assert.deepEqual(getQueue(), [
    { type: 'CREATE', session: updatedAfterDelete, queuedAt: 200 },
  ]);
});

test('getQueue keeps valid operations when persisted array has corrupt entries', async () => {
  const validOperation = createOp('session-valid', 100);
  localStorage.clear();
  localStorage.setItem(
    getSyncQueueStorageKey(),
    JSON.stringify([
      validOperation,
      null,
      { type: 'DELETE' },
      { type: 'UPDATE', session: {} },
      { type: 'DELETE', id: 123 },
    ])
  );

  assert.deepEqual(getQueue(), [validOperation]);
});

test('getQueue clears storage and warns when all persisted entries are invalid', async () => {
  localStorage.clear();
  localStorage.setItem(
    getSyncQueueStorageKey(),
    JSON.stringify([null, { type: 'DELETE' }, { type: 'UPDATE', session: {} }])
  );
  const warnCalls: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  try {
    assert.deepEqual(getQueue(), []);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(localStorage.getItem(getSyncQueueStorageKey()), null);
  assert.equal(warnCalls.length, 1);
  assert.equal(
    warnCalls[0][0],
    'Sync queue storage contained only invalid entries'
  );
  assert.deepEqual(warnCalls[0][1], {
    key: getSyncQueueStorageKey(),
    totalEntries: 3,
    validEntries: 0,
  });
});

test('concurrent queueOperation calls do not drop operations across identities', async () => {
  resetQueue();

  await Promise.all([
    queueOperation({ type: 'CREATE', session: makeSession('session-1') }),
    queueOperation({ type: 'CREATE', session: makeSession('session-2') }),
    queueOperation({ type: 'CREATE', session: makeSession('session-3') }),
    queueOperation({ type: 'CREATE', session: makeSession('session-4') }),
  ]);

  const ids = getQueue().map((operation: SyncOperation) =>
    operation.type === 'DELETE' ? operation.id : operation.session.id
  );

  assert.deepEqual(ids.sort(), [
    'session-1',
    'session-2',
    'session-3',
    'session-4',
  ]);
});

test('concurrent mixed mutators retain union of writes under lease', async () => {
  resetQueue();

  await Promise.all([
    setQueue(
      [{ type: 'CREATE', session: makeSession('session-a'), queuedAt: 100 }],
      []
    ),
    queueOperation({ type: 'CREATE', session: makeSession('session-b') }),
  ]);

  const finalQueue = getQueue();
  const ids = finalQueue.map((operation: SyncOperation) =>
    operation.type === 'DELETE' ? operation.id : operation.session.id
  );

  assert.ok(ids.includes('session-a'));
  assert.ok(ids.includes('session-b'));
});

test('paused operations keep their payload and block later same-session work', async () => {
  const failed: SyncOperation = {
    type: 'UPDATE',
    session: { ...makeSession('session-paused'), notes: 'original rejected edit' },
    expectedRevision: 4,
    queuedAt: 10,
    syncIssue: { type: 'rejected', status: 422 },
  };
  const later: SyncOperation = {
    type: 'UPDATE',
    session: { ...makeSession('session-paused'), notes: 'later edit' },
    expectedRevision: 4,
    queuedAt: 20,
  };
  resetQueue([failed]);

  await queueOperation(later);

  assert.deepEqual(getQueue(), [failed, later]);
  assert.equal(getQueue()[0]?.type === 'UPDATE' && getQueue()[0].session.notes, 'original rejected edit');
  assert.equal(getPendingOperationCount(), 0);
  assert.equal(hasPendingOperations(), false);
});

test('authentication recovery leaves rejected operations paused', async () => {
  const auth: SyncOperation = {
    type: 'CREATE',
    session: makeSession('session-auth'),
    queuedAt: 10,
    syncIssue: { type: 'authentication', status: 401 },
  };
  const rejected: SyncOperation = {
    type: 'CREATE',
    session: makeSession('session-rejected'),
    queuedAt: 20,
    syncIssue: { type: 'rejected', status: 400 },
  };
  resetQueue([auth, rejected]);

  await resumeAuthenticationBlockedOperations();

  assert.equal(getQueue()[0]?.syncIssue, undefined);
  assert.deepEqual(getQueue()[1]?.syncIssue, { type: 'rejected', status: 400 });
  assert.equal(getRejectedOperationCount(), 1);
});

test('explicit removal deletes only the selected failed operation', async () => {
  const selected: SyncOperation = {
    type: 'CREATE',
    session: makeSession('session-discard-one'),
    queuedAt: 10,
    syncIssue: { type: 'rejected', status: 422 },
  };
  const retained: SyncOperation = {
    type: 'UPDATE',
    session: makeSession('session-discard-two'),
    expectedRevision: 3,
    queuedAt: 20,
    syncIssue: { type: 'conflict', status: 412 },
  };
  resetQueue([selected, retained]);

  await removeOperationByIdentity(selected);

  assert.deepEqual(getQueue(), [retained]);
});

test('quota failure does not replace a valid queue or claim persistence', async () => {
  const existing: SyncOperation = {
    type: 'CREATE',
    session: makeSession('session-kept-after-quota'),
    queuedAt: 10,
  };
  resetQueue([existing]);
  failQueueStorageWrites = true;

  await assert.rejects(
    queueOperation({ type: 'CREATE', session: makeSession('session-not-saved') }),
    SyncQueuePersistenceError
  );

  assert.deepEqual(getQueue(), [existing]);
  assert.equal(getSyncQueueStorageError(), 'QuotaExceededError');
});
