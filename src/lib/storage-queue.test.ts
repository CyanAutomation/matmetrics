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

test('queued creates replay with their persisted idempotency key', async () => {
  const idempotencyKey = crypto.randomUUID();
  const createOperation: SyncOperation = {
    type: 'CREATE',
    session: {
      id: 'idempotent-create',
      date: '2026-11-01',
      techniques: ['Uchi mata'],
      effort: 3,
      category: 'Technical',
    },
    idempotencyKey,
    queuedAt: 50,
  };
  let requestHeaders = new Headers();
  let persistedQueue: SyncOperation[] = [];
  const serverSession = {
    ...createOperation.session,
    keikoRevision: 1,
    revisionSha: 'create-etag',
  };
  setActiveSyncLease({ mode: 'web-lock', release: () => {} });

  try {
    await processSingleQueueOperation(
      createOperation,
      0,
      [createOperation],
      1,
      null,
      false,
      async () => {},
      () => true,
      async (_input, init) => {
        requestHeaders = new Headers(init?.headers);
        return new Response('{}', { status: 201 });
      },
      async () => serverSession,
      () => {},
      async () => {},
      async () => ({}),
      async () => {},
      [createOperation],
      () => persistedQueue,
      async (queued) => {
        const marked = { ...queued, attempted: true };
        persistedQueue = [marked];
        return marked;
      }
    );

    assert.equal(requestHeaders.get('Idempotency-Key'), idempotencyKey);
    assert.equal(persistedQueue[0]?.type, 'CREATE');
    if (persistedQueue[0]?.type === 'CREATE') assert.equal(persistedQueue[0].attempted, true);
  } finally {
    setActiveSyncLease(null);
  }
});

test('a later edit queued during create replay gets the returned Keiko revision', async () => {
  const idempotencyKey = crypto.randomUUID();
  const created: SyncOperation = {
    type: 'CREATE',
    session: {
      id: 'inflight-create-edit',
      date: '2026-11-01',
      techniques: [],
      effort: 3,
      category: 'Technical',
    },
    idempotencyKey,
    queuedAt: 100,
  };
  const markedCreate: SyncOperation = { ...created, attempted: true };
  const laterUpdate: SyncOperation = {
    type: 'UPDATE',
    session: { ...created.session, notes: 'edited during replay' },
    queuedAt: 101,
  };
  const serverSession = {
    ...created.session,
    keikoRevision: 1,
    revisionSha: 'create-etag',
  };
  setActiveSyncLease({ mode: 'web-lock', release: () => {} });

  try {
    const result = await processSingleQueueOperation(
      created,
      0,
      [created],
      1,
      null,
      false,
      async () => {},
      () => true,
      async () => new Response('{}', { status: 201 }),
      async () => serverSession,
      () => {},
      async () => {},
      async () => ({}),
      async () => {},
      [created],
      () => [markedCreate, laterUpdate],
      async () => markedCreate
    );

    assert.equal(result.queue.length, 2);
    const nextUpdate = result.queue[1];
    assert.equal(nextUpdate?.type, 'UPDATE');
    if (nextUpdate?.type === 'UPDATE') {
      assert.equal(nextUpdate.expectedRevision, 1);
      assert.equal(nextUpdate.session.keikoRevision, 1);
      assert.equal(nextUpdate.session.revisionSha, 'create-etag');
    }
    assert.equal(result.baseQueue?.length, 2);
  } finally {
    setActiveSyncLease(null);
  }
});

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
      async () => {},
      queue,
      () => queue,
      async (queued) => queued
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
      queue,
      () => queue,
      async (queued) => queued
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

test('forbidden responses remain authentication-related pauses', async () => {
  let savedQueue: SyncOperation[] = [];
  await handleOperationError(
    new SyncRequestError('Request failed with status 403', false, null, 403),
    operation,
    0,
    [operation],
    1,
    () => true,
    async (nextQueue) => { savedQueue = nextQueue; },
    async () => {}
  );

  assert.deepEqual(savedQueue[0]?.syncIssue, {
    type: 'authentication',
    status: 403,
  });
});

for (const { status, issue } of [
  { status: 400, issue: { type: 'rejected', status: 400 } },
  { status: 409, issue: { type: 'conflict', status: 409 } },
  { status: 422, issue: { type: 'rejected', status: 422 } },
  { status: 499, issue: { type: 'rejected', status: 499 } },
] as const) {
  test(`permanent HTTP ${status} failures retain the original operation for recovery`, async () => {
    const later: SyncOperation = {
      type: 'CREATE',
      session: {
        id: 'later-session',
        date: '2026-11-01',
        techniques: [],
        effort: 3,
        category: 'Technical',
      },
      queuedAt: 200,
    };
    const queue = [operation, later];
    const baseQueue = structuredClone(queue);
    let savedQueue: SyncOperation[] = [];

    const result = await handleOperationError(
      new SyncRequestError(`Request failed with status ${status}`, false, null, status),
      operation,
      0,
      queue,
      1,
      () => true,
      async (nextQueue) => { savedQueue = nextQueue; },
      async () => {},
      baseQueue
    );

    assert.equal(result.retryable, false);
    assert.deepEqual(savedQueue, [
      { ...operation, syncIssue: issue },
      later,
    ]);
    assert.deepEqual(queue, baseQueue);
    assert.equal(savedQueue[0]?.type === 'UPDATE' && savedQueue[0].session.notes, 'captured offline');
    assert.equal(savedQueue[0]?.queuedAt, operation.queuedAt);
    assert.equal(savedQueue[0]?.type === 'UPDATE' && savedQueue[0].expectedRevision, 2);
  });
}

for (const status of [408, 429, 500, 503]) {
  test(`HTTP ${status} remains retryable`, async () => {
    let queueWrites = 0;
    const result = await handleOperationError(
      new SyncRequestError(`Request failed with status ${status}`, true, null, status),
      operation,
      0,
      [operation],
      1,
      () => true,
      async () => { queueWrites += 1; },
      async () => {}
    );

    assert.equal(result.retryable, true);
    assert.equal(queueWrites, 0);
  });
}

test('network interruptions remain retryable', async () => {
  const result = await handleOperationError(
    new TypeError('network interrupted'),
    operation,
    0,
    [operation],
    1,
    () => true,
    async () => {},
    async () => {}
  );

  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterMs, null);
});
