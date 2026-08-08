import type { SyncLease } from './sync-lease-core';

export function parseSyncLeaseValue(value: string | null): SyncLease | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SyncLease>;
    if (
      typeof parsed.owner !== 'string' ||
      !Number.isFinite(parsed.expiresAt) ||
      typeof parsed.nonce !== 'string' ||
      !Number.isFinite(parsed.epoch)
    ) {
      return null;
    }
    return {
      owner: parsed.owner,
      expiresAt: parsed.expiresAt as number,
      nonce: parsed.nonce,
      epoch: parsed.epoch as number,
    };
  } catch {
    return null;
  }
}

export function leaseClaimsMatch(
  candidate: SyncLease | null,
  expected: SyncLease
): boolean {
  return (
    candidate?.owner === expected.owner &&
    candidate.expiresAt === expected.expiresAt &&
    candidate.nonce === expected.nonce &&
    candidate.epoch === expected.epoch
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
