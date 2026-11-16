import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleOperationError,
  processSingleQueueOperation,
  SyncRequestError,
} from './storage-queue';
import { setActiveSyncLease } from './sync-lease';
import type { SyncOperation } from './sync-queue';

const operation = {
  type: 'UPDATE',
  session: {
    id: 'offline-session',
    date: '2026-11-01',
    techniques: [],
    effort: 3,
    category: 'Technical',
    notes: 'captured offline',
    keikoRevision: 2,
  },
  expectedRevision: 2,
  queuedAt: 100,
} as SyncOperation;

test('successful mutations update downstream revisions without mutating the queue snapshot', async () => {
  const created: SyncOperation = {
    type: 'CREATE',
    session: {
      id: 'offline-session',
      date: '2026-11-01',
      techniques: [],
      effort: 3,
      category: 'Technical',
      notes: 'created offline',
    },
    queuedAt: 99,
  };
  const update: SyncOperation = {
    ...operation,
    queuedAt: 100,
  };
  const queue: SyncOperation[] = [created, update];
  const originalQueue = structuredClone(queue);
  const serverSession = {
    ...created.session,
    revisionSha: 'sha-after-create',
    keikoRevision: 7,
  };
  let requestIfMatch: string | null = null;
  let persistedQueue: SyncOperation[] = [];
  let persistedBaseQueue: SyncOperation[] | null = null;
  setActiveSyncLease({ mode: 'web-lock', release: () => {} });

  try {
    const result = await processSingleQueueOperation(
      queue[0],
      0,
      queue,
      1,
      null,
      false,
      async () => {},
      () => true,
      async (_input, init) => {
        requestIfMatch = new Headers(init?.headers).get('If-Match');
        return new Response('{}', { status: 200 });
      },
      async () => serverSession,
      () => {},
      async () => {},
      async () => ({}),
      async () => {}
    );

    assert.deepEqual(queue, originalQueue);
    assert.notEqual(result.queue, queue);
    assert.equal(result.queue[1]?.type, 'UPDATE');
    if (result.queue[1]?.type !== 'UPDATE') return;
    assert.equal(result.queue[1].expectedRevision, 7);
    assert.equal(result.queue[1].session.revisionSha, 'sha-after-create');

    await processSingleQueueOperation(
      result.queue[1],
      1,
      result.queue,
      1,
      null,
      false,
      async () => {},
      () => true,
      async (_input, init) => {
        requestIfMatch = new Headers(init?.headers).get('If-Match');
        throw new SyncRequestError('Request failed with status 412', false, null, 412);
      },
      async () => serverSession,
      () => {},
      async (next, base) => {
        persistedQueue = next;
        persistedBaseQueue = base;
      },
      async () => ({}),
      async () => {},
      queue
    );

    assert.equal(requestIfMatch, '"7"');
    assert.deepEqual(queue, originalQueue);
    assert.deepEqual(persistedBaseQueue, originalQueue);
    assert.equal(persistedQueue.length, 1);
    assert.deepEqual(persistedQueue[0]?.syncIssue, {
      type: 'conflict',
      status: 412,
    });
  } finally {
    setActiveSyncLease(null);
  }
});

test('a stale queued mutation is retained as a conflict and is not retried', async () => {
  let savedQueue: SyncOperation[] = [];
  let reconciled = false;
  const result = await handleOperationError(
    new SyncRequestError('Request failed with status 412', false, null, 412),
    operation,
    0,
    [operation],
    1,
    () => true,
    async (nextQueue) => { savedQueue = nextQueue; },
    async () => { reconciled = true; }
  );

  assert.equal(result.retryable, false);
  assert.deepEqual(savedQueue, [{
    ...operation,
    syncIssue: { type: 'conflict', status: 412 },
  }]);
  assert.equal(reconciled, false);
});

test('a stale queued deletion remains visible as a conflict', async () => {
  const deletion = {
    type: 'DELETE',
    id: 'offline-session',
    expectedRevision: 2,
    queuedAt: 101,
  } as SyncOperation;
  let savedQueue: SyncOperation[] = [];

  await handleOperationError(
    new SyncRequestError('Request failed with status 412', false, null, 412),
    deletion,
    0,
    [deletion],
    1,
    () => true,
    async (nextQueue) => { savedQueue = nextQueue; },
    async () => {}
  );

  assert.deepEqual(savedQueue, [{
    ...deletion,
    syncIssue: { type: 'conflict', status: 412 },
  }]);
});

test('a missing Keiko precondition is kept as a distinct queued conflict', async () => {
  let savedQueue: SyncOperation[] = [];
  await handleOperationError(
    new SyncRequestError('Request failed with status 428', false, null, 428),
    operation,
    0,
    [operation],
    1,
    () => true,
    async (nextQueue) => { savedQueue = nextQueue; },
    async () => {}
  );

  assert.deepEqual(savedQueue[0]?.syncIssue, {
    type: 'conflict',
    status: 428,
  });
  assert.equal(savedQueue[0]?.type === 'UPDATE' && savedQueue[0].expectedRevision, 2);
  assert.equal(savedQueue[0]?.type === 'UPDATE' && savedQueue[0].session.notes, 'captured offline');
});

test('authentication failures pause queued mutations without dropping their data', async () => {
  let savedQueue: SyncOperation[] = [];
  let reconciled = false;
  await handleOperationError(
    new SyncRequestError('Request failed with status 401', false, null, 401),
    operation,
    0,
    [operation],
    1,
    () => true,
    async (nextQueue) => { savedQueue = nextQueue; },
    async () => { reconciled = true; }
  );

  assert.deepEqual(savedQueue[0]?.syncIssue, {
    type: 'authentication',
    status: 401,
  });
  assert.equal(savedQueue[0]?.type === 'UPDATE' && savedQueue[0].session.notes, 'captured offline');
  assert.equal(reconciled, false);
});
