import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLeaseClaim,
  evaluateLeaseAcquisition,
} from './sync-lease-acquisition';
import type { SyncLease } from './sync-lease-core';

const competitor = (expiresAt: number): SyncLease => ({
  owner: 'other-tab',
  expiresAt,
  nonce: 'nonce-other',
  epoch: 8,
});

test('evaluateLeaseAcquisition backs off until a live contender is stable', () => {
  const initial = { signature: null, observations: 0 };
  const liveCompetitor = competitor(Date.now() + 10_000);
  const first = evaluateLeaseAcquisition({
    observationState: initial,
    observedLease: liveCompetitor,
    owner: 'local-tab',
    allowForcedReclaim: true,
    reclaimRetryThreshold: 3,
  });

  assert.equal(first.attempt, false);
  assert.equal(first.forcedReclaim, false);
  assert.equal(first.observationState.observations, 1);

  const second = evaluateLeaseAcquisition({
    observationState: first.observationState,
    observedLease: liveCompetitor,
    owner: 'local-tab',
    allowForcedReclaim: true,
    reclaimRetryThreshold: 3,
  });
  const third = evaluateLeaseAcquisition({
    observationState: second.observationState,
    observedLease: liveCompetitor,
    owner: 'local-tab',
    allowForcedReclaim: true,
    reclaimRetryThreshold: 3,
  });

  assert.equal(third.attempt, true);
  assert.equal(third.forcedReclaim, true);
  assert.equal(third.observationState.observations, 3);
});

test('evaluateLeaseAcquisition allows missing and expired leases immediately', () => {
  const state = { signature: 'old', observations: 2 };
  for (const observedLease of [null, competitor(Date.now() - 1)]) {
    const decision = evaluateLeaseAcquisition({
      observationState: state,
      observedLease,
      owner: 'local-tab',
      allowForcedReclaim: false,
      reclaimRetryThreshold: 3,
    });
    assert.equal(decision.attempt, true);
    assert.equal(decision.forcedReclaim, false);
    assert.equal(decision.observationState.observations, 0);
  }
});

test('createLeaseClaim uses the supplied clock, nonce, and epoch strategy', () => {
  assert.deepEqual(
    createLeaseClaim({
      owner: 'local-tab',
      ttlMs: 45_000,
      observedEpoch: 8,
      createNonce: () => 'nonce-local',
      nextEpoch: (epoch) => epoch + 1,
      now: 1_000,
    }),
    {
      owner: 'local-tab',
      expiresAt: 46_000,
      nonce: 'nonce-local',
      epoch: 9,
    }
  );
});
