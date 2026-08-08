import type { SyncLease } from './sync-lease-core';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toSyncLease = (value: unknown): SyncLease | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<SyncLease>;
  if (
    typeof parsed.owner !== 'string' ||
    !isFiniteNumber(parsed.expiresAt) ||
    typeof parsed.nonce !== 'string' ||
    !isFiniteNumber(parsed.epoch)
  ) {
    return null;
  }

  return {
    owner: parsed.owner,
    expiresAt: parsed.expiresAt,
    nonce: parsed.nonce,
    epoch: parsed.epoch,
  };
};

export function parseSyncLeaseValue(value: string | null): SyncLease | null {
  if (!value) return null;
  try {
    return toSyncLease(JSON.parse(value));
  } catch {
    return null;
  }
}

export function leaseClaimsMatch(
  candidate: SyncLease | null,
  expected: SyncLease
): boolean {
  return (
    candidate !== null &&
    leaseIdentityMatches(candidate, expected) &&
    candidate.expiresAt === expected.expiresAt
  );
}

export function leaseIdentityMatches(
  candidate: SyncLease | null,
  expected: Pick<SyncLease, 'owner' | 'nonce' | 'epoch'>
): boolean {
  return (
    candidate?.owner === expected.owner &&
    candidate.nonce === expected.nonce &&
    candidate.epoch === expected.epoch
  );
}
