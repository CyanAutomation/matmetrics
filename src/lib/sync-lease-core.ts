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

const SYNC_LOCK_ACQUIRE_ATTEMPTS = 7;
export const SYNC_LOCK_BACKOFF_MIN_MS = 6;
export const SYNC_LOCK_BACKOFF_MAX_MS = 28;
export const SYNC_LOCK_VERIFY_DELAY_MIN_MS = 1;
export const SYNC_LOCK_VERIFY_DELAY_MAX_MS = 6;
const SYNC_LOCK_NAME = 'matmetrics-sync';
const STALE_LEASE_RECLAIM_RETRY_THRESHOLD = 3;

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

export function setActiveSyncLease(lease: ActiveSyncLease | null): void {
  activeSyncLease = lease;
}

// ============================================================================
// Helper Functions (reduced cognitive complexity)
// ============================================================================

function sleep(ms: number): Promise<void> {
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
 * Monitor storage events for conflicts that might overwrite our lease claim.
 * Returns true if lease was overwritten by a storage event.
 */
function monitorStorageForLeaseConflict(
  syncLockStorageKey: string,
  nextLease: SyncLease
): {
  cleanup: () => void;
  isConflicted: () => boolean;
} {
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

  return {
    cleanup: () => {
      window.removeEventListener('storage', onStorage);
    },
    isConflicted: () => overwrittenByStorageEvent,
  };
}

/**
 * Evaluate whether to attempt lease acquisition based on contender stability.
 * Returns true if we should proceed with acquisition (either no contender or forced reclaim).
 */
function shouldAttemptLeaseAcquisition(
  contenderSignature: string | null,
  stableContenderSignature: string | null,
  stableContenderObservations: number,
  leaseOwnedByAnother: boolean,
  leaseExpired: boolean,
  leaseIsOwnedAndAlive: boolean
): { attempt: boolean; updatedStableSignature: string | null; updatedObservations: number } {
  // Track contender stability across observations
  let updatedSignature = stableContenderSignature;
  let updatedObservations = stableContenderObservations;

  if (contenderSignature && contenderSignature === stableContenderSignature) {
    updatedObservations += 1;
  } else if (contenderSignature) {
    updatedSignature = contenderSignature;
    updatedObservations = 1;
  } else {
    updatedSignature = null;
    updatedObservations = 0;
  }

  const forcedReclaimAttempt = shouldForceReclaim(
    leaseOwnedByAnother,
    leaseExpired,
    updatedObservations,
    leaseIsOwnedAndAlive
  );

  // If another process owns the lease and we're not forcing reclaim, back off
  const shouldBackOff = leaseIsOwnedAndAlive && !forcedReclaimAttempt;

  return {
    attempt: !shouldBackOff,
    updatedStableSignature: updatedSignature,
    updatedObservations: updatedObservations,
  };
}

/**
 * Attempt to acquire a sync lease using localStorage with retry logic
 * Reduces cognitive complexity by extracting core loop and validation logic
 */
/**
 * Acquire a sync lease using a retry loop with state machine fallback logic.
 *
 * ⚠️ COMPLEXITY NOTE (Phase 3 Refactoring Target, Low Priority):
 * This function (603 LOC, cognitive complexity 36) encodes a multi-stage fallback
 * strategy for distributed lock acquisition:
 *
 * STAGE 1: navigator.locks API (preferred for single-tab scenarios)
 * STAGE 2: localStorage with storage events (fallback for multi-tab)
 * STAGE 3: Direct acquisition + verification (final fallback)
 *
 * The retry loop (lines ~390–430) maintains state across iterations:
 * - stableContenderSignature: tracks contender identity across observations
 * - stableContenderObservations: counts consecutive identical contenders
 * - These trigger forced reclaim logic when contender is "stable" (3+ observations)
 *
 * REFACTORING OPPORTUNITIES (Lower Priority):
 * 1. Extract RetryAttemptState type:
 *    type RetryAttemptState = {
 *      attempt: number;
 *      stableContenderSignature?: string;
 *      stableContenderObservations: number;
 *      currentLeaseId?: string;
 *    }
 *
 * 2. Extract evaluateLeaseEligibility(observedLease, now):
 *    Returns { eligible, reason, shouldForceReclaim, backoffMs }
 *
 * 3. Extract attemptSingleLeaseAcquisition(leaseData):
 *    Returns { acquired, leaseId?, error? }
 *
 * 4. Flatten loop nesting by making retry strategy explicit
 *
 * Current complexity is acceptable because:
 * - Logic is already well-extracted into helpers (shouldAttemptLeaseAcquisition, etc.)
 * - Loop variables are used consistently (not mutated in 10+ places)
 * - Retry count is hardcoded (7 attempts); unlikely to change
 *
 * However, extracting would improve clarity for future maintainers.
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

  // RETRY LOOP STATE MACHINE (7 attempts with backoff and forced reclaim logic)
  // ─────────────────────────────────────────────────────────────────────────────
  // stableContenderSignature: identity of contender from previous iteration
  // stableContenderObservations: count of consecutive identical contenders
  // 
  // State transitions:
  // 1. If contender same as previous: increment observations
  // 2. If contender different: reset to new contender + reset observations to 1
  // 3. If no contender: clear signature + reset observations to 0
  // 4. If observations >= 3: attempt forced reclaim in next iteration
  // 
  // See shouldAttemptLeaseAcquisition() for decision logic.
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

    // Evaluate if we should attempt acquisition
    const leaseEval = shouldAttemptLeaseAcquisition(
      contenderSignature,
      stableContenderSignature,
      stableContenderObservations,
      leaseOwnedByAnother,
      leaseExpired,
      leaseIsOwnedAndAlive
    );

    stableContenderSignature = leaseEval.updatedStableSignature;
    stableContenderObservations = leaseEval.updatedObservations;

    // Back off if another process owns an alive lease
    if (!leaseEval.attempt) {
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
      const forcedReclaimAttempt = shouldForceReclaim(
        leaseOwnedByAnother,
        leaseExpired,
        stableContenderObservations,
        leaseIsOwnedAndAlive
      );

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
    const storageMonitor = monitorStorageForLeaseConflict(
      syncLockStorageKey,
      nextLease
    );

    // Check if a newer lease appeared after we started this iteration
    const lastObservedLease = readSyncLease();
    if (
      lastObservedLease &&
      lastObservedLease.owner !== syncOwnerId &&
      lastObservedLease.expiresAt >= Date.now() &&
      lastObservedLease.epoch > (observedLease?.epoch ?? -Infinity)
    ) {
      storageMonitor.cleanup();
      if (attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS - 1) {
        await sleep(randomBackoffMs());
      }
      continue;
    }

    // Try to claim the lease
    localStorage.setItem(syncLockStorageKey, JSON.stringify(nextLease));
    await sleep(randomVerifyDelayMs());

    // Verify our claim succeeded
    const confirmedLease = readSyncLease();
    storageMonitor.cleanup();

    if (
      validateLeaseClaim(confirmedLease, nextLease, storageMonitor.isConflicted())
    ) {
      activeSyncLease = {
        mode: 'storage',
        owner: nextLease.owner,
        nonce: nextLease.nonce,
        epoch: nextLease.epoch,
      };
      return true;
    }

    if (attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS - 1) {
      await sleep(randomBackoffMs());
    }
  }

  return false;
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
