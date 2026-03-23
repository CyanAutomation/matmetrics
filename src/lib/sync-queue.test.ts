import assert from 'node:assert/strict';
import test from 'node:test';
import type { SyncOperation } from './sync-queue';
const syncQueueModule = require('./sync-queue');
const {
  clearQueue,
  getSyncQueueStorageKey,
  getQueue,
  queueOperation,
  removeOperationByIdentity,
  setQueue,
} = syncQueueModule;
import type { JudoSession } from './types';

class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
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
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = localStorageMock;

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
  localStorage.clear();
  if (initialQueue) {
    localStorage.setItem(
      getSyncQueueStorageKey(),
      JSON.stringify(initialQueue)
    );
  }
}

function removeOperationByIndexLegacy(index: number): void {
  const baseQueue = getQueue();
  const queue = [...baseQueue];
  queue.splice(index, 1);
  setQueue(queue, baseQueue);
}

test('queueOperation timestamps operations and preserves insertion order', () => {
  resetQueue();

  queueOperation({ type: 'CREATE', session: makeSession('session-1') });
  queueOperation({
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

test('setQueue preserves a newer concurrent operation with the same identity', () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentNewerOperation = createOp('session-1', 200);

  resetQueue([concurrentNewerOperation]);

  setQueue([baseOperation], [baseOperation]);

  assert.deepEqual(getQueue(), [concurrentNewerOperation]);
});

test('clearQueue keeps a newer concurrent operation instead of deleting it', () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentNewerOperation = createOp('session-1', 200);

  resetQueue([concurrentNewerOperation]);

  clearQueue([baseOperation]);

  assert.deepEqual(getQueue(), [concurrentNewerOperation]);
});

test('setQueue retains concurrent operations that share queuedAt with stale base snapshots', () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentSameQueuedAt: SyncOperation = {
    type: 'DELETE',
    id: 'session-2',
    queuedAt: 100,
  };

  resetQueue([baseOperation, concurrentSameQueuedAt]);

  setQueue([baseOperation], [baseOperation]);

  assert.deepEqual(getQueue(), [concurrentSameQueuedAt, baseOperation]);
});

test('concurrent create and update with identical queuedAt coalesce deterministically', () => {
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

  setQueue([baseUpdate], [baseUpdate]);

  assert.deepEqual(getQueue(), [
    {
      type: 'CREATE',
      session: { ...makeSession('session-1'), notes: 'from-base-tab' },
      queuedAt: 100,
    },
  ]);
});

test('clearQueue removes the persisted storage key when there is no concurrent work', () => {
  resetQueue([createOp('session-1', 100)]);

  clearQueue([createOp('session-1', 100)]);

  assert.equal(localStorage.getItem(getSyncQueueStorageKey()), null);
  assert.deepEqual(getQueue(), []);
});

test('clearQueue keeps concurrent operations when queuedAt matches stale base snapshot', () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentSameQueuedAt: SyncOperation = {
    type: 'UPDATE',
    session: { ...makeSession('session-2'), notes: 'concurrent' },
    queuedAt: 100,
  };

  resetQueue([baseOperation, concurrentSameQueuedAt]);

  clearQueue([baseOperation]);

  assert.deepEqual(getQueue(), [concurrentSameQueuedAt]);
});

test('malformed JSON is quarantined and cleared on first read', () => {
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

test('subsequent reads after malformed JSON return stable empty queue without repeated parse warnings', () => {
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

test('identity-based removal succeeds under concurrent writes where index-based removal fails', () => {
  const opA = createOp('session-a', 100);
  const opB = createOp('session-b', 200);
  const opC = createOp('session-c', 300);
  resetQueue([opA, opB, opC]);

  const staleSnapshot = getQueue();
  const staleIndexForB = 1;
  const staleTargetB = staleSnapshot[staleIndexForB];

  // Simulate a concurrent writer that removed opA while the caller still holds stale index data.
  setQueue([staleSnapshot[1], staleSnapshot[2]], staleSnapshot);

  // Legacy behavior removes by positional index and therefore deletes opC, not opB.
  removeOperationByIndexLegacy(staleIndexForB);
  assert.deepEqual(getQueue(), [opB]);

  // New behavior removes by stable identity key and correctly removes the intended opB.
  resetQueue([opB, opC]);
  removeOperationByIdentity(staleTargetB);
  assert.deepEqual(getQueue(), [opC]);
});

test('coalesces create then update into create with latest payload', () => {
  resetQueue();
  const created = makeSession('session-1');
  const updated = { ...created, notes: 'latest note' };

  setQueue(
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

test('coalesces create then delete into no-op', () => {
  resetQueue();

  setQueue(
    [
      { type: 'CREATE', session: makeSession('session-1'), queuedAt: 100 },
      { type: 'DELETE', id: 'session-1', queuedAt: 200 },
    ],
    []
  );

  assert.deepEqual(getQueue(), []);
});

test('coalesces update then delete into delete', () => {
  resetQueue();

  setQueue(
    [
      { type: 'UPDATE', session: makeSession('session-1'), queuedAt: 100 },
      { type: 'DELETE', id: 'session-1', queuedAt: 200 },
    ],
    []
  );

  assert.deepEqual(getQueue(), [
    { type: 'DELETE', id: 'session-1', queuedAt: 200 },
  ]);
});

test('coalesces delete then create into recreate create', () => {
  resetQueue();
  const recreated = { ...makeSession('session-1'), notes: 'recreated' };

  setQueue(
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

test('coalesces delete then create then update into create with latest payload', () => {
  resetQueue();
  const recreated = { ...makeSession('session-1'), notes: 'recreated' };
  const updatedAfterRecreate = {
    ...recreated,
    notes: 'updated after recreate',
  };

  setQueue(
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

test('coalesces delete then update into create to avoid missing-record updates', () => {
  resetQueue();
  const updatedAfterDelete = {
    ...makeSession('session-1'),
    notes: 'updated after delete',
  };

  setQueue(
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

test('getQueue keeps valid operations when persisted array has corrupt entries', () => {
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

test('getQueue clears storage and warns when all persisted entries are invalid', () => {
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
