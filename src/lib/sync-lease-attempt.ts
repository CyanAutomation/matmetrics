import type { SyncLease } from './sync-lease-core';

export type LeaseObservationState = {
  signature: string | null;
  observations: number;
};

export const getLeaseSignature = (lease: SyncLease | null): string | null =>
  lease
    ? `${lease.owner}:${lease.nonce}:${lease.epoch}:${lease.expiresAt}`
    : null;

export const updateLeaseObservation = (
  state: LeaseObservationState,
  contenderSignature: string | null
): LeaseObservationState => {
  if (!contenderSignature) return { signature: null, observations: 0 };
  if (contenderSignature === state.signature) {
    return { signature: state.signature, observations: state.observations + 1 };
  }
  return { signature: contenderSignature, observations: 1 };
};

export const isNewerLiveLease = (
  candidate: SyncLease | null,
  observed: SyncLease | null,
  now: number
): boolean =>
  candidate !== null &&
  observed !== null &&
  candidate.owner !== observed.owner &&
  candidate.expiresAt >= now &&
  candidate.epoch > observed.epoch;
