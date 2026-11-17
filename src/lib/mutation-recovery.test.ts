import assert from 'node:assert/strict';
import test from 'node:test';
import type { SyncOperation } from './sync-queue';
import { buildMutationRecoveryExport } from './mutation-recovery';

test('recovery export includes session data and safe mutation metadata only', () => {
  const update = {
    type: 'UPDATE',
    session: {
      id: 'session-recovery',
      date: '2026-11-10',
      techniques: ['Uchi mata'],
      effort: 3,
      category: 'Technical',
      notes: 'captured edit',
      keikoRevision: 7,
      revisionSha: 'private-repository-revision',
      accessToken: 'must-not-export',
    },
    previousSession: {
      id: 'session-recovery',
      date: '2026-11-09',
      techniques: [],
      effort: 2,
      category: 'Randori',
    },
    expectedRevision: 7,
    queuedAt: 1234,
    syncIssue: { type: 'rejected', status: 422 },
  } as unknown as SyncOperation;

  const result = buildMutationRecoveryExport([update], '2026-11-16T12:00:00.000Z');
  const operation = result.operations[0];

  assert.equal(result.format, 'matmetrics-session-mutation-recovery');
  assert.equal(result.version, 1);
  assert.equal(result.exportedAt, '2026-11-16T12:00:00.000Z');
  assert.equal(operation?.operationId, 'UPDATE:session-recovery:1234');
  assert.equal(operation?.operationType, 'UPDATE');
  assert.equal(operation?.sessionId, 'session-recovery');
  assert.equal(operation?.expectedRevision, 7);
  assert.deepEqual(operation?.issueCategory, { category: 'rejected', status: 422 });
  assert.equal(operation?.payload?.notes, 'captured edit');
  assert.equal(operation?.previousSession?.date, '2026-11-09');
  assert.equal('keikoRevision' in (operation?.payload ?? {}), false);
  assert.equal('revisionSha' in (operation?.payload ?? {}), false);
  assert.equal('accessToken' in (operation?.payload ?? {}), false);
  assert.equal(JSON.stringify(result).includes('must-not-export'), false);
});

test('delete recovery export records the deletion intent and captured session', () => {
  const deletion: SyncOperation = {
    type: 'DELETE',
    id: 'session-delete',
    session: {
      id: 'session-delete',
      date: '2026-11-11',
      techniques: ['O soto gari'],
      effort: 4,
      category: 'Technical',
    },
    expectedRevision: 2,
    queuedAt: 5678,
    syncIssue: { type: 'conflict', status: 412 },
  };

  const operation = buildMutationRecoveryExport([deletion]).operations[0];

  assert.equal(operation?.operationType, 'DELETE');
  assert.equal(operation?.sessionId, 'session-delete');
  assert.equal(operation?.expectedRevision, 2);
  assert.equal(operation?.payload?.date, '2026-11-11');
  assert.deepEqual(operation?.issueCategory, { category: 'conflict', status: 412 });
});

test('create recovery export preserves the idempotency key and attempted state', () => {
  const create: SyncOperation = {
    type: 'CREATE',
    session: {
      id: 'session-keyed-recovery',
      date: '2026-11-11',
      techniques: [],
      effort: 3,
      category: 'Technical',
    },
    idempotencyKey: 'create-key-123',
    attempted: true,
    queuedAt: 9876,
  };

  const operation = buildMutationRecoveryExport([create]).operations[0];

  assert.equal(operation?.idempotencyKey, 'create-key-123');
  assert.equal(operation?.attempted, true);
});
