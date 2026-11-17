import assert from 'node:assert/strict';
import test from 'node:test';
import { getRecoveryOperationLabel } from './mutation-recovery-presentation';
import type { SyncOperation } from './sync-queue';

const failedDelete: SyncOperation = {
  type: 'DELETE', id: 'legacy-session', expectedRevision: 12, queuedAt: 5,
  syncIssue: { type: 'conflict', status: 412 },
};

test('snapshot-less failed delete is labelled as unresolved and directs refresh', () => {
  const label = getRecoveryOperationLabel(failedDelete);
  assert.match(label, /Deletion is unresolved/);
  assert.match(label, /no saved session copy/);
  assert.match(label, /Refresh sessions before discarding/);
});

test('failed delete with a saved session keeps its actionable conflict label', () => {
  const withSnapshot: SyncOperation = {
    ...failedDelete,
    session: {
      id: 'legacy-session', date: '2026-01-01', techniques: [], effort: 3,
      category: 'Technical',
    },
  };
  assert.equal(getRecoveryOperationLabel(withSnapshot), 'Conflict needs review · HTTP 412');
});

test('a confirmed missing session is not described as an unresolved deletion', () => {
  const alreadyMissing: SyncOperation = {
    ...failedDelete,
    syncIssue: { type: 'conflict', status: 404 },
  };
  assert.equal(getRecoveryOperationLabel(alreadyMissing), 'Conflict needs review · HTTP 404');
});

test('idempotency key reuse is distinct from a pre-existing session ID', () => {
  const keyReuse: SyncOperation = {
    type: 'CREATE',
    session: {
      id: 'key-reuse', date: '2026-01-01', techniques: [], effort: 3,
      category: 'Technical',
    },
    idempotencyKey: crypto.randomUUID(),
    attempted: true,
    queuedAt: 15,
    syncIssue: { type: 'conflict', status: 409, code: 'idempotency_key_reuse' },
  };
  const sessionConflict: SyncOperation = {
    ...keyReuse,
    session: { ...keyReuse.session, id: 'session-id-conflict' },
    syncIssue: { type: 'conflict', status: 409, code: 'session_conflict' },
  };

  assert.match(getRecoveryOperationLabel(keyReuse), /different session details/);
  assert.match(getRecoveryOperationLabel(keyReuse), /will not retry.*new key/);
  assert.match(getRecoveryOperationLabel(sessionConflict), /already uses this ID/);
  assert.match(getRecoveryOperationLabel(sessionConflict), /not confirmed/);
});
