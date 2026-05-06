/**
 * Sync Lease Management Module
 *
 * Handles distributed lock acquisition and renewal for concurrent sync operations
 * across browser tabs using localStorage and navigator.locks API.
 *
 * Cognitive complexity reduced by extracting core algorithms from storage.ts
 */

// ============================================================================
// Types
// ============================================================================

export type SyncLease = {
  owner: string;
  expiresAt: number;
  nonce: string;
  epoch: number;
};

export type ActiveSyncLease =
  | {
      mode: 'web-lock';
      release: () => void;
    }
  | {
      mode: 'storage';
      owner: string;
      nonce: string;
      epoch: number;
    };

export type LeaseTakeoverReason =
  | 'expired'
  | 'forced-reclaim'
  | 'race-revalidate';

// ============================================================================
// Constants
// ============================================================================

export const SYNC_LOCK_ACQUIRE_ATTEMPTS = 7;
export const SYNC_LOCK_BACKOFF_MIN_MS = 6;
export const SYNC_LOCK_BACKOFF_MAX_MS = 28;
export const SYNC_LOCK_VERIFY_DELAY_MIN_MS = 1;
export const SYNC_LOCK_VERIFY_DELAY_MAX_MS = 6;
export const SYNC_LOCK_NAME = 'matmetrics-sync';
export const STALE_LEASE_RECLAIM_RETRY_THRESHOLD = 3;

// ============================================================================
// Dependencies (injected)
// ============================================================================

let syncOwnerId = '';
let syncLockTtlMs = 45_000;
let getSyncLockStorageKeyFn: (() => string) | null = null;
let isStorageEventForKeyFn:
  | ((event: StorageEvent, key: string) => boolean)
  | null = null;
let emitDiagnosticFn:
  | ((payload: LeaseTakeoverDiagnosticPayload) => void)
  | null = null;

export function initializeSyncLeaseModule(options: {
  syncOwnerId: string;
  syncLockTtlMs: number;
  getSyncLockStorageKey: () => string;
  isStorageEventForKey: (event: StorageEvent, key: string) => boolean;
  emitLeaseTakeoverDiagnostic?: (
    payload: LeaseTakeoverDiagnosticPayload
  ) => void;
}): void {
  syncOwnerId = options.syncOwnerId;
  syncLockTtlMs = options.syncLockTtlMs;
  getSyncLockStorageKeyFn = options.getSyncLockStorageKey;
  isStorageEventForKeyFn = options.isStorageEventForKey;
  emitDiagnosticFn = options.emitLeaseTakeoverDiagnostic ?? (() => {});
}

export type LeaseTakeoverDiagnosticPayload = {
  reason: LeaseTakeoverReason;
  attempt: number;
  previousOwner: string | null;
  previousEpoch: number | null;
  previousExpiresAt: number | null;
  nextEpoch: number;
};

// ============================================================================
// State Management
// ============================================================================

let activeSyncLease: ActiveSyncLease | null = null;
let localLeaseEpochCounter = 0;

export function getActiveSyncLease(): ActiveSyncLease | null {
  return activeSyncLease;
}

export function setActiveSyncLease(lease: ActiveSyncLease | null): void {
  activeSyncLease = lease;
}

// ============================================================================
// Helper Functions (reduced cognitive complexity)
// ============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBackoffMs(
  randomSource: () => number = Math.random
): number {
  return (
    SYNC_LOCK_BACKOFF_MIN_MS +
    Math.floor(
      randomSource() * (SYNC_LOCK_BACKOFF_MAX_MS - SYNC_LOCK_BACKOFF_MIN_MS + 1)
    )
  );
}

export function randomVerifyDelayMs(): number {
  return (
    SYNC_LOCK_VERIFY_DELAY_MIN_MS +
    Math.floor(
      Math.random() *
        (SYNC_LOCK_VERIFY_DELAY_MAX_MS - SYNC_LOCK_VERIFY_DELAY_MIN_MS + 1)
    )
  );
}

export function createSyncLeaseNonce(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `sync-lease-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getNextSyncLeaseEpoch(existingEpoch: number): number {
  const nowEpoch = Date.now();
  const nextEpoch = Math.max(
    existingEpoch + 1,
    localLeaseEpochCounter + 1,
    nowEpoch
  );
  localLeaseEpochCounter = nextEpoch;
  return nextEpoch;
}

/**
 * Read the current sync lease from localStorage
 * Returns null if no lease exists or if parsing fails
 */
export function readSyncLease(): SyncLease | null {
  if (typeof window === 'undefined' || !getSyncLockStorageKeyFn) {
    return null;
  }

  try {
    const stored = localStorage.getItem(getSyncLockStorageKeyFn());
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<SyncLease>;
    if (
      typeof parsed.owner !== 'string' ||
      !Number.isFinite(parsed.expiresAt) ||
      typeof parsed.nonce !== 'string' ||
      !Number.isFinite(parsed.epoch)
    ) {
      localStorage.removeItem(getSyncLockStorageKeyFn());
      return null;
    }

    return {
      owner: parsed.owner,
      expiresAt: parsed.expiresAt as number,
      nonce: parsed.nonce,
      epoch: parsed.epoch as number,
    };
  } catch (error) {
    console.error('Failed to parse sync lease', error);
    if (getSyncLockStorageKeyFn) {
      localStorage.removeItem(getSyncLockStorageKeyFn());
    }
    return null;
  }
}

/**
 * Create a signature for identifying stable contenders
 */
function getContenderSignature(lease: SyncLease | null): string | null {
  if (!lease) return null;
  return `${lease.owner}:${lease.nonce}:${lease.epoch}:${lease.expiresAt}`;
}

function shouldForceReclaim(
  leaseOwnedByAnother: boolean,
  leaseExpired: boolean,
  stableObservations: number,
  leaseIsAlive: boolean
): boolean {
  return (
    leaseIsAlive && stableObservations >= STALE_LEASE_RECLAIM_RETRY_THRESHOLD
  );
}

/**
 * Validate that our lease claim was not overwritten by another process
 */
function validateLeaseClaim(
  confirmedLease: SyncLease | null,
  nextLease: SyncLease,
  overwrittenByStorageEvent: boolean
): boolean {
  return (
    !overwrittenByStorageEvent &&
    confirmedLease?.owner === nextLease.owner &&
    confirmedLease?.expiresAt === nextLease.expiresAt &&
    confirmedLease?.nonce === nextLease.nonce &&
    confirmedLease?.epoch === nextLease.epoch
  );
}

// ============================================================================
// Primary Functions
// ============================================================================

/**
 * Attempt to acquire a navigator.locks based lock (preferred for single-tab scenarios)
 */
async function tryAcquireNavigatorLock(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.locks?.request !== 'function'
  ) {
    return false;
  }

  let resolveAcquisition: ((acquired: boolean) => void) | null = null;
  const acquisition = new Promise<boolean>((resolve) => {
    resolveAcquisition = resolve;
  });
  let releaseLock: (() => void) | null = null;

  void navigator.locks.request(
    SYNC_LOCK_NAME,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        resolveAcquisition?.(false);
        return;
      }

      const holdLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      resolveAcquisition?.(true);
      await holdLock;
    }
  );

  const acquired = await acquisition;
  if (!acquired || !releaseLock) {
    return false;
  }

  activeSyncLease = {
    mode: 'web-lock',
    release: releaseLock,
  };
  return true;
}

/**
 * Attempt to acquire a sync lease using localStorage with retry logic
 * Reduces cognitive complexity by extracting core loop and validation logic
 */
export async function tryAcquireSyncLease(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !getSyncLockStorageKeyFn ||
    !isStorageEventForKeyFn ||
    !emitDiagnosticFn
  ) {
    return false;
  }

  if (await tryAcquireNavigatorLock()) {
    return true;
  }

  let stableContenderSignature: string | null = null;
  let stableContenderObservations = 0;

  for (let attempt = 0; attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS; attempt += 1) {
    const now = Date.now();
    const observedLease = readSyncLease();
    const leaseOwnedByAnother =
      observedLease !== null && observedLease.owner !== syncOwnerId;
    const leaseExpired =
      observedLease !== null && observedLease.expiresAt < now;
    const leaseIsOwnedAndAlive = leaseOwnedByAnother && !leaseExpired;
    const contenderSignature = getContenderSignature(
      leaseOwnedByAnother ? observedLease : null
    );

    // Track contender stability across observations
    if (contenderSignature && contenderSignature === stableContenderSignature) {
      stableContenderObservations += 1;
      console.log(`[attempt ${attempt}] signature MATCHED (${contenderSignature})`);
    } else if (contenderSignature) {
      console.log(`[attempt ${attempt}] signature CHANGED: old=${stableContenderSignature}, new=${contenderSignature}`);
      stableContenderSignature = contenderSignature;
      stableContenderObservations = 1;
    } else {
      console.log(`[attempt ${attempt}] NO signature (no competing lease)`);
      stableContenderSignature = null;
      stableContenderObservations = 0;
    }

    const forcedReclaimAttempt = shouldForceReclaim(
      leaseOwnedByAnother,
      leaseExpired,
      stableContenderObservations,
      leaseIsOwnedAndAlive
    );

    console.log(`[attempt ${attempt}] stableObs=${stableContenderObservations}, forcedReclaim=${forcedReclaimAttempt}`);

    // If another process owns the lease and we're not forcing reclaim, back off
    if (leaseIsOwnedAndAlive && !forcedReclaimAttempt) {
      if (attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS - 1) {
        await sleep(randomBackoffMs());
      }
      continue;
    }

    // Prepare our lease claim
    const nextLease: SyncLease = {
      owner: syncOwnerId,
      expiresAt: now + syncLockTtlMs,
      nonce: createSyncLeaseNonce(),
      epoch: getNextSyncLeaseEpoch(observedLease?.epoch ?? 0),
    };

    // Emit diagnostic if taking over another process's lease
    if (observedLease && observedLease.owner !== syncOwnerId) {
      emitDiagnosticFn({
        reason:
          observedLease.expiresAt < now
            ? 'expired'
            : forcedReclaimAttempt
              ? 'forced-reclaim'
              : 'race-revalidate',
        attempt,
        previousOwner: observedLease.owner,
        previousEpoch: observedLease.epoch,
        previousExpiresAt: observedLease.expiresAt,
        nextEpoch: nextLease.epoch,
      });
    }

    // Monitor for storage events that might overwrite our claim
    const syncLockStorageKey = getSyncLockStorageKeyFn();
    let overwrittenByStorageEvent = false;
    const onStorage = (event: StorageEvent) => {
      if (!isStorageEventForKeyFn!(event, syncLockStorageKey)) {
        return;
      }

      const nextValue = event.newValue;
      if (!nextValue) {
        overwrittenByStorageEvent = true;
        return;
      }

      try {
        const parsed = JSON.parse(nextValue) as Partial<SyncLease>;
        if (
          parsed.owner !== nextLease.owner ||
          parsed.nonce !== nextLease.nonce ||
          parsed.epoch !== nextLease.epoch
        ) {
          overwrittenByStorageEvent = true;
        }
      } catch {
        overwrittenByStorageEvent = true;
      }
    };

    window.addEventListener('storage', onStorage);

    // Check if a newer lease appeared after we started this iteration
    const lastObservedLease = readSyncLease();
    if (
      lastObservedLease &&
      lastObservedLease.owner !== syncOwnerId &&
      lastObservedLease.expiresAt >= Date.now() &&
      lastObservedLease.epoch > (observedLease?.epoch ?? -Infinity)
    ) {
      window.removeEventListener('storage', onStorage);
      if (attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS - 1) {
        await sleep(randomBackoffMs());
      }
      continue;
    }

    // Try to claim the lease
    console.log(`[attempt ${attempt}] writing lease with owner=${syncOwnerId}`);
    localStorage.setItem(syncLockStorageKey, JSON.stringify(nextLease));
    await sleep(randomVerifyDelayMs());

    // Verify our claim succeeded
    const confirmedLease = readSyncLease();
    console.log(`[attempt ${attempt}] confirmed: owner=${confirmedLease?.owner}, overwritten=${overwrittenByStorageEvent}`);
    window.removeEventListener('storage', onStorage);

    if (
      validateLeaseClaim(confirmedLease, nextLease, overwrittenByStorageEvent)
    ) {
      console.log(`[attempt ${attempt}] validation PASSED, returning true`);
      activeSyncLease = {
        mode: 'storage',
        owner: nextLease.owner,
        nonce: nextLease.nonce,
        epoch: nextLease.epoch,
      };
      return true;
    }
    console.log(`[attempt ${attempt}] validation FAILED`);

    if (attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS - 1) {
      await sleep(randomBackoffMs());
    }
  }

  return false;
}

/**
 * Renew an existing sync lease
 */
export function renewSyncLease(): boolean {
  if (typeof window === 'undefined' || !getSyncLockStorageKeyFn) {
    return false;
  }

  if (activeSyncLease?.mode === 'web-lock') {
    return true;
  }

  if (activeSyncLease?.mode !== 'storage') {
    return false;
  }

  const existingLease = readSyncLease();
  if (
    existingLease?.owner !== activeSyncLease.owner ||
    existingLease.nonce !== activeSyncLease.nonce ||
    existingLease.epoch !== activeSyncLease.epoch
  ) {
    return false;
  }

  const nextLease: SyncLease = {
    owner: activeSyncLease.owner,
    expiresAt: Date.now() + syncLockTtlMs,
    nonce: activeSyncLease.nonce,
    epoch: activeSyncLease.epoch,
  };

  localStorage.setItem(getSyncLockStorageKeyFn(), JSON.stringify(nextLease));

  const confirmedLease = readSyncLease();
  return (
    confirmedLease?.owner === activeSyncLease.owner &&
    confirmedLease?.expiresAt === nextLease.expiresAt &&
    confirmedLease?.nonce === nextLease.nonce &&
    confirmedLease?.epoch === activeSyncLease.epoch
  );
}

/**
 * Check if we currently own an active sync lease
 */
export function hasActiveSyncLeaseOwnership(): boolean {
  if (activeSyncLease?.mode === 'web-lock') {
    return true;
  }

  if (activeSyncLease?.mode !== 'storage') {
    return false;
  }

  const lease = readSyncLease();
  return (
    lease?.owner === activeSyncLease.owner &&
    lease?.nonce === activeSyncLease.nonce &&
    lease?.epoch === activeSyncLease.epoch &&
    typeof lease.expiresAt === 'number' &&
    lease.expiresAt > Date.now()
  );
}

/**
 * Release the current sync lease
 */
export function releaseSyncLease(): void {
  if (activeSyncLease?.mode === 'web-lock') {
    activeSyncLease.release();
    activeSyncLease = null;
    return;
  }

  if (typeof window === 'undefined' || !getSyncLockStorageKeyFn) {
    activeSyncLease = null;
    return;
  }

  if (activeSyncLease?.mode === 'storage') {
    const persistedLease = readSyncLease();
    const ownsPersistedLease =
      persistedLease?.owner === activeSyncLease.owner &&
      persistedLease?.nonce === activeSyncLease.nonce &&
      persistedLease?.epoch === activeSyncLease.epoch;

    if (ownsPersistedLease) {
      localStorage.removeItem(getSyncLockStorageKeyFn());
    }
  }

  activeSyncLease = null;
}
