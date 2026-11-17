import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSessionCreate } from './session-create-request';

const payload = {
  date: '2026-11-01',
  techniques: ['Uchi mata'],
  effort: 3,
  category: 'Technical',
};

test('keyed Keiko create leaves a missing ID for the server to generate', () => {
  const prepared = prepareSessionCreate(payload, true);

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.session.id, 'pending-idempotency-session');
  assert.equal('id' in prepared.keikoBody, false);
  assert.deepEqual(prepared.keikoBody.techniques, ['Uchi mata']);
});

test('legacy create still generates a stable request ID before forwarding', () => {
  const prepared = prepareSessionCreate(payload, false);

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.ok(prepared.session.id);
  assert.equal(prepared.keikoBody.id, prepared.session.id);
});
