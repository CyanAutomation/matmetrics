import type { SyncLease } from './sync-lease-core';
import {
  getLeaseSignature,
  updateLeaseObservation,
  type LeaseObservationState,
} from './sync-lease-attempt';

export type LeaseAcquisitionDecision = {
  attempt: boolean;
  observationState: LeaseObservationState;
  forcedReclaim: boolean;
};

export function evaluateLeaseAcquisition({
  observationState,
  observedLease,
  owner,
  allowForcedReclaim,
  reclaimRetryThreshold,
}: {
  observationState: LeaseObservationState;
  observedLease: SyncLease | null;
  owner: string;
  allowForcedReclaim: boolean;
  reclaimRetryThreshold: number;
}): LeaseAcquisitionDecision {
  const now = Date.now();
  const ownedByAnother =
    observedLease !== null && observedLease.owner !== owner;
  const expired = observedLease !== null && observedLease.expiresAt < now;
  const aliveCompetitor = ownedByAnother && !expired;
  const contenderSignature = getLeaseSignature(
    aliveCompetitor ? observedLease : null
  );
  const nextObservationState = updateLeaseObservation(
    observationState,
    contenderSignature
  );
  const forcedReclaim =
    allowForcedReclaim &&
    aliveCompetitor &&
    nextObservationState.observations >= reclaimRetryThreshold;

  return {
    attempt: !aliveCompetitor || forcedReclaim,
    observationState: nextObservationState,
    forcedReclaim,
  };
}

export function createLeaseClaim({
  owner,
  ttlMs,
  observedEpoch,
  createNonce,
  nextEpoch,
  now = Date.now(),
}: {
  owner: string;
  ttlMs: number;
  observedEpoch: number;
  createNonce: () => string;
  nextEpoch: (existingEpoch: number) => number;
  now?: number;
}): SyncLease {
  return {
    owner,
    expiresAt: now + ttlMs,
    nonce: createNonce(),
    epoch: nextEpoch(observedEpoch),
  };
}
