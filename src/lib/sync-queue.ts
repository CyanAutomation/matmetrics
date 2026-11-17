import { JudoSession } from './types';
import type { SessionSnapshot } from './keiko-session-revision';
import { getActiveUserId, getScopedStorageKey } from './client-identity';
import { isValidIdempotencyKey } from './keiko-api/idempotency';

/**
 * Shared localStorage key for offline sync operations.
 *
 * Multi-tab behavior:
 * - Every write re-reads this key immediately before commit to reduce stale-tab overwrites.
 * - Writes de-duplicate operations by identity so retries do not grow duplicates indefinitely.
 * - Callers that sync using a stale snapshot can pass that snapshot as `baseQueue` so writes retain
 *   operations added by other tabs while still removing/rewriting the expected items.
 */
const SYNC_QUEUE_KEY_BASE = 'matmetrics_sync_queue';
const SYNC_QUEUE_QUARANTINE_KEY_SUFFIX = '__corrupt_backup';
const SYNC_QUEUE_LOCK_KEY_BASE = 'matmetrics_sync_queue_lock';
const SYNC_QUEUE_LOCK_NAME = 'matmetrics-sync-queue';
const DEFAULT_SYNC_QUEUE_LEASE_TTL_MS = 5000;
let syncQueueLeaseTtlMs = DEFAULT_SYNC_QUEUE_LEASE_TTL_MS;
let getLeaseTime = Date.now;
let scheduleLeaseRenewal = (
  callback: () => void,
  intervalMs: number
): ReturnType<typeof setInterval> => setInterval(callback, intervalMs);
let cancelLeaseRenewal = (timer: ReturnType<typeof setInterval>): void => {
  clearInterval(timer);
};
const SYNC_QUEUE_LOCK_ACQUIRE_ATTEMPTS = 7;
const SYNC_QUEUE_LOCK_BACKOFF_MIN_MS = 4;
const SYNC_QUEUE_LOCK_BACKOFF_MAX_MS = 20;
const SYNC_QUEUE_LOCK_VERIFY_DELAY_MIN_MS = 1;
const SYNC_QUEUE_LOCK_VERIFY_DELAY_MAX_MS = 5;
const SYNC_QUEUE_WEB_LOCK_ACQUIRE_TIMEOUT_MS = 1500;

export function getSyncQueueStorageKey(): string {
  return getScopedStorageKey(SYNC_QUEUE_KEY_BASE);
}

function getSyncQueueLockStorageKey(): string {
  return getScopedStorageKey(SYNC_QUEUE_LOCK_KEY_BASE);
}

function getSyncQueueQuarantineStorageKey(): string {
  return `${getSyncQueueStorageKey()}${SYNC_QUEUE_QUARANTINE_KEY_SUFFIX}`;
}

function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || 'Error';
  }

  return typeof error;
}

function getVolatileIssueKey(operation: SyncOperationInput): string {
  return `${getSyncQueueStorageKey()}:${getOperationKey(operation)}`;
}

function clearVolatileQueueIssues(operations: SyncOperationInput[]): void {
  for (const operation of operations) {
    volatileQueueIssues.delete(getVolatileIssueKey(operation));
  }
}

function assertExpectedQueueUser(expectedUserId?: string): void {
  if (expectedUserId !== undefined && getActiveUserId() !== expectedUserId) {
    throw new Error('The active account changed before the queue write completed');
  }
}

function quarantineQueueContents(rawQueue: string): void {
  const primaryKey = getSyncQueueQuarantineStorageKey();
  const existingPrimary = localStorage.getItem(primaryKey);
  if (existingPrimary === rawQueue) return;

  let quarantineKey = primaryKey;
  if (existingPrimary !== null) {
    quarantineKey = `${primaryKey}_${Date.now()}`;
    let suffix = 1;
    while (localStorage.getItem(quarantineKey) !== null) {
      quarantineKey = `${primaryKey}_${Date.now()}_${suffix}`;
      suffix += 1;
    }
  }

  localStorage.setItem(quarantineKey, rawQueue);
}

const SAFE_SYNC_ERROR_CODES = new Set([
  'idempotency_key_reuse',
  'session_conflict',
  'revision_conflict',
  'revision_mismatch',
  'precondition_required',
  'idempotency_not_supported',
  'idempotency_key_required',
  'idempotency_unavailable',
]);

export function isSafeSyncErrorCode(value: unknown): value is string {
  return typeof value === 'string' && SAFE_SYNC_ERROR_CODES.has(value);
}

export type SyncOperationIssue =
  | { type: 'conflict'; status: 404 | 409 | 412 | 428; code?: string }
  | { type: 'authentication'; status: 401 | 403; code?: string }
  | { type: 'rejected'; status?: number; code?: string };

type SyncOperationPayload =
  | {
      type: 'CREATE';
      session: JudoSession;
      idempotencyKey?: string;
      attempted?: boolean;
    }
  | {
      type: 'UPDATE';
      session: SessionSnapshot;
      previousSession?: SessionSnapshot;
      expectedRevision?: number;
    }
  | {
      type: 'DELETE';
      id: string;
      session?: SessionSnapshot;
      revisionSha?: string;
      expectedRevision?: number;
    };

export type SyncOperation = SyncOperationPayload & {
  queuedAt: number;
  syncIssue?: SyncOperationIssue;
};

export type SyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount?: number;
  authenticationBlockedCount?: number;
  rejectedCount?: number;
  storageUnavailable?: boolean;
};

type SyncOperationInput = SyncOperationPayload | SyncOperation;

const LAST_QUEUED_AT_KEY_BASE = 'matmetrics_last_queued_at';

let lastQueuedAt: number = (() => {
  if (typeof window !== 'undefined') {
    const key = getScopedStorageKey(LAST_QUEUED_AT_KEY_BASE);
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return 0;
})();

let queueStorageError: string | null = null;
const volatileQueueIssues = new Map<string, SyncOperationIssue>();

export class SyncQueuePersistenceError extends Error {
  constructor() {
    super('Unable to save the session recovery queue in this browser.');
    this.name = 'SyncQueuePersistenceError';
  }
}

function persistLastQueuedAt(): void {
  if (typeof window === 'undefined') return;
  const key = getScopedStorageKey(LAST_QUEUED_AT_KEY_BASE);
  localStorage.setItem(key, String(lastQueuedAt));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidSyncOperationInput(
  value: unknown
): value is SyncOperationInput {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  const hasValidQueuedAt =
    value.queuedAt === undefined ||
    (typeof value.queuedAt === 'number' && Number.isFinite(value.queuedAt));
  if (!hasValidQueuedAt) {
    return false;
  }

  if (
    value.expectedRevision !== undefined &&
    (typeof value.expectedRevision !== 'number' ||
      !Number.isSafeInteger(value.expectedRevision) ||
      value.expectedRevision < 1)
  ) {
    return false;
  }

  if (value.syncIssue !== undefined) {
    if (!isRecord(value.syncIssue) || typeof value.syncIssue.type !== 'string') {
      return false;
    }
    const { type, status, code } = value.syncIssue;
    if (code !== undefined && !isSafeSyncErrorCode(code)) return false;
    if (
      !(
        (type === 'conflict' && [404, 409, 412, 428].includes(status as number)) ||
        (type === 'authentication' && [401, 403].includes(status as number)) ||
        (type === 'rejected' &&
          (status === undefined ||
            (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599)))
      )
    ) {
      return false;
    }
  }

  if (value.type === 'DELETE') {
    return (
      typeof value.id === 'string' &&
      (value.session === undefined ||
        (isRecord(value.session) && typeof value.session.id === 'string')) &&
      (value.revisionSha === undefined || typeof value.revisionSha === 'string')
    );
  }

  if (value.type === 'CREATE' || value.type === 'UPDATE') {
    if (value.type === 'CREATE' && (
      (value.idempotencyKey !== undefined && !isValidIdempotencyKey(value.idempotencyKey)) ||
      (value.attempted !== undefined && typeof value.attempted !== 'boolean')
    )) {
      return false;
    }
    return (
      isRecord(value.session) &&
      typeof value.session.id === 'string' &&
      (value.type !== 'UPDATE' ||
        value.previousSession === undefined ||
        (isRecord(value.previousSession) && typeof value.previousSession.id === 'string'))
    );
  }

  return false;
}

function getNextQueuedAt(): number {
  const inMemoryLastQueuedAt = lastQueuedAt;
  let persistedLastQueuedAt = 0;

  if (typeof window !== 'undefined') {
    const key = getScopedStorageKey(LAST_QUEUED_AT_KEY_BASE);
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed > 0) {
        persistedLastQueuedAt = parsed;
      }
    }
  }

  const now = Date.now();
  lastQueuedAt = Math.max(
    inMemoryLastQueuedAt + 1,
    persistedLastQueuedAt + 1,
    now
  );
  persistLastQueuedAt();
  return lastQueuedAt;
}

function withQueuedAt(operation: SyncOperationInput): SyncOperation {
  return {
    ...operation,
    queuedAt:
      'queuedAt' in operation && Number.isFinite(operation.queuedAt)
        ? operation.queuedAt
        : getNextQueuedAt(),
  };
}

function getOperationSessionId(operation: SyncOperationInput): string {
  return operation.type === 'DELETE' ? operation.id : operation.session.id;
}

function getOperationIdentity(operation: SyncOperationInput): string {
  if (operation.type === 'DELETE') {
    return `${operation.type}:${operation.id}`;
  }

  return `${operation.type}:${operation.session.id}`;
}

function hasQueuedAt(
  operation: SyncOperationInput
): operation is SyncOperation {
  return 'queuedAt' in operation && Number.isFinite(operation.queuedAt);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );

  return `{${entries
    .map(
      ([key, entryValue]) =>
        `${JSON.stringify(key)}:${stableStringify(entryValue)}`
    )
    .join(',')}}`;
}

function getOperationPayloadKey(operation: SyncOperationInput): string {
  if (operation.type === 'DELETE') {
    return `DELETE:${operation.id}:${operation.revisionSha ?? ''}:${operation.expectedRevision ?? ''}:${operation.session ? stableStringify(operation.session) : ''}`;
  }

  if (operation.type === 'CREATE') {
    return `CREATE:${stableStringify(operation.session)}:${operation.idempotencyKey ?? ''}`;
  }

  return `${operation.type}:${stableStringify(operation.session)}:${operation.expectedRevision ?? ''}:${operation.previousSession ? stableStringify(operation.previousSession) : ''}`;
}

function getOperationKey(operation: SyncOperationInput): string {
  const identity = getOperationIdentity(operation);
  const payloadKey = getOperationPayloadKey(operation);

  return hasQueuedAt(operation)
    ? `${identity}:${operation.queuedAt}:${payloadKey}`
    : `${identity}:*:${payloadKey}`;
}

function compareOperations(left: SyncOperation, right: SyncOperation): number {
  const queuedAtDelta = left.queuedAt - right.queuedAt;
  if (queuedAtDelta !== 0) {
    return queuedAtDelta;
  }

  return getOperationPayloadKey(left).localeCompare(
    getOperationPayloadKey(right)
  );
}

/**
 * Group operations by session ID, normalizing timestamps.
 * Returns a Map of session ID to operation arrays.
 */
function groupOperationsBySession(
  operations: SyncOperationInput[]
): Map<string, SyncOperation[]> {
  const groupedBySession = new Map<string, SyncOperation[]>();

  for (const operation of operations) {
    const normalizedOperation = withQueuedAt(operation);
    const sessionId = getOperationSessionId(normalizedOperation);
    const existingGroup = groupedBySession.get(sessionId) ?? [];
    existingGroup.push(normalizedOperation);
    groupedBySession.set(sessionId, existingGroup);
  }

  return groupedBySession;
}

/**
 * Merge consecutive operations for a single session into a reduced operation.
 * Implements state machine logic: CREATE+UPDATE=CREATE, UPDATE+DELETE=DELETE, etc.
 * Returns the reduced operation, or undefined if the net result is deletion.
 */
function mergeConsecutiveOperations(
  sortedOperations: SyncOperation[]
): SyncOperation | undefined {
  let reducedOperation: SyncOperation | undefined;

  for (const operation of sortedOperations) {
    if (!reducedOperation) {
      reducedOperation = operation;
      continue;
    }

    if (reducedOperation.type === 'CREATE') {
      if (operation.type === 'UPDATE') {
        reducedOperation = {
          type: 'CREATE',
          session: operation.session,
          queuedAt: reducedOperation.queuedAt,
          ...(reducedOperation.type === 'CREATE' && reducedOperation.idempotencyKey
            ? { idempotencyKey: reducedOperation.idempotencyKey }
            : {}),
          ...(reducedOperation.type === 'CREATE' && reducedOperation.attempted !== undefined
            ? { attempted: reducedOperation.attempted }
            : {}),
        };
        continue;
      }

      if (operation.type === 'DELETE') {
        reducedOperation = undefined;
        continue;
      }

      reducedOperation = {
        type: 'CREATE',
        session: operation.session,
        queuedAt: operation.queuedAt,
        ...(reducedOperation.type === 'CREATE' && reducedOperation.idempotencyKey
          ? { idempotencyKey: reducedOperation.idempotencyKey }
          : {}),
        ...(reducedOperation.type === 'CREATE' && reducedOperation.attempted !== undefined
          ? { attempted: reducedOperation.attempted }
          : {}),
      };
      continue;
    }

    if (reducedOperation.type === 'UPDATE') {
      if (operation.type === 'DELETE') {
        reducedOperation = {
          ...operation,
          session: reducedOperation.session ?? operation.session,
          expectedRevision:
            reducedOperation.expectedRevision ?? operation.expectedRevision,
          ...(reducedOperation.syncIssue &&
          operation.expectedRevision === reducedOperation.expectedRevision
            ? { syncIssue: reducedOperation.syncIssue }
            : {}),
        };
        continue;
      }

      // UPDATE followed by UPDATE or CREATE (edge case: treat as UPDATE with latest data)
      if (operation.type === 'UPDATE' || operation.type === 'CREATE') {
        const expectedRevision =
          reducedOperation.expectedRevision ??
          (operation.type === 'UPDATE' ? operation.expectedRevision : undefined);
        const keepsIssue =
          reducedOperation.syncIssue &&
          (operation.type !== 'UPDATE' ||
            operation.expectedRevision === reducedOperation.expectedRevision);
        reducedOperation = {
          type: 'UPDATE',
          session: operation.session,
          ...(reducedOperation.type === 'UPDATE' && reducedOperation.previousSession
            ? { previousSession: reducedOperation.previousSession }
            : operation.type === 'UPDATE' && operation.previousSession
              ? { previousSession: operation.previousSession }
              : {}),
          ...(expectedRevision === undefined ? {} : { expectedRevision }),
          queuedAt: operation.queuedAt,
          ...(keepsIssue ? { syncIssue: reducedOperation.syncIssue } : {}),
        };
        continue;
      }
    } else {
      // DELETE followed by CREATE is a true recreate and must replay as CREATE.
      if (operation.type === 'CREATE') {
        reducedOperation = {
          type: 'CREATE',
          session: operation.session,
          queuedAt: operation.queuedAt,
        };
        continue;
      }

      // DELETE followed by UPDATE should avoid a guaranteed 404 path for missing records.
      // Treat as CREATE so replay remains safe when the delete has already applied remotely.
      if (operation.type === 'UPDATE') {
        reducedOperation = {
          type: 'CREATE',
          session: operation.session,
          queuedAt: operation.queuedAt,
        };
        continue;
      }

      // DELETE followed by DELETE: keep the first DELETE (earliest timestamp)
      // Both deletes are equivalent, but preserve the original operation timing
      // and fill in a captured session snapshot when migrating an older entry.
      if (!reducedOperation.session && operation.session) {
        reducedOperation = { ...reducedOperation, session: operation.session };
      }
      continue;
    }
  }

  return reducedOperation;
}

function dedupeOperations(operations: SyncOperationInput[]): SyncOperation[] {
  // Group operations by session ID
  const groupedBySession = groupOperationsBySession(operations);
  const reducedOperations: SyncOperation[] = [];

  // Reduce each session's operations to a single operation (or deletion)
  for (const operationsForSession of groupedBySession.values()) {
    const sortedOperations = [...operationsForSession].sort(compareOperations);
    let pendingSegment: SyncOperation[] = [];
    const flushPendingSegment = () => {
      const reducedOperation = mergeConsecutiveOperations(pendingSegment);
      if (reducedOperation) reducedOperations.push(reducedOperation);
      pendingSegment = [];
    };

    for (const operation of sortedOperations) {
      if (operation.syncIssue || (operation.type === 'CREATE' && operation.attempted === true)) {
        flushPendingSegment();
        reducedOperations.push(operation);
      } else {
        pendingSegment.push(operation);
      }
    }
    flushPendingSegment();
  }

  return reducedOperations.sort(compareOperations);
}

type QueueWriteLease = {
  owner: string;
  expiresAt: number;
  nonce: string;
  epoch: number;
};

type QueueLeaseScheduler = {
  schedule(callback: () => void, intervalMs: number): unknown;
  cancel(timer: unknown): void;
};

type QueueLeaseDependencies = {
  now?: () => number;
  scheduler?: QueueLeaseScheduler;
};

type ActiveQueueLease =
  | { mode: 'web-lock'; release: () => void }
  | { mode: 'storage'; owner: string; nonce: string; epoch: number };

const queueOwnerId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `queue-owner-${Math.random().toString(36).slice(2)}`;
let activeQueueLease: ActiveQueueLease | null = null;
let queueLeaseEpochCounter = 0;

function createQueueLeaseNonce(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `queue-lease-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readQueueLease(): QueueWriteLease | null {
  const stored = localStorage.getItem(getSyncQueueLockStorageKey());
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<QueueWriteLease>;
    if (
      typeof parsed.owner !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      !Number.isFinite(parsed.expiresAt) ||
      !Number.isFinite(parsed.epoch)
    ) {
      localStorage.removeItem(getSyncQueueLockStorageKey());
      return null;
    }
    return parsed as QueueWriteLease;
  } catch {
    localStorage.removeItem(getSyncQueueLockStorageKey());
    return null;
  }
}

function releaseQueueLease(): void {
  if (activeQueueLease?.mode === 'web-lock') {
    activeQueueLease.release();
    activeQueueLease = null;
    return;
  }
  if (activeQueueLease?.mode === 'storage') {
    const lease = readQueueLease();
    if (
      lease &&
      lease.owner === activeQueueLease.owner &&
      lease.nonce === activeQueueLease.nonce &&
      lease.epoch === activeQueueLease.epoch
    ) {
      localStorage.removeItem(getSyncQueueLockStorageKey());
    }
  }
  activeQueueLease = null;
}

function getActiveStorageQueueLease(): ActiveQueueLease & {
  mode: 'storage';
} {
  if (!activeQueueLease || activeQueueLease.mode !== 'storage') {
    throw new Error('No active storage lease');
  }

  return activeQueueLease;
}

function ensureActiveStorageLeaseOwnership(
  now: () => number = getLeaseTime
): void {
  if (!activeQueueLease || activeQueueLease.mode !== 'storage') {
    return;
  }

  const lease = readQueueLease();
  if (
    !lease ||
    lease.owner !== activeQueueLease.owner ||
    lease.nonce !== activeQueueLease.nonce ||
    lease.epoch !== activeQueueLease.epoch ||
    lease.expiresAt <= now()
  ) {
    throw new Error('Storage lease is no longer owned by current tab');
  }
}

function renewActiveStorageQueueLease(now: () => number = getLeaseTime): void {
  const storageLease = getActiveStorageQueueLease();
  ensureActiveStorageLeaseOwnership(now);
  const renewedLease: QueueWriteLease = {
    owner: storageLease.owner,
    nonce: storageLease.nonce,
    epoch: storageLease.epoch,
    expiresAt: now() + syncQueueLeaseTtlMs,
  };
  localStorage.setItem(
    getSyncQueueLockStorageKey(),
    JSON.stringify(renewedLease)
  );
  ensureActiveStorageLeaseOwnership(now);
}

async function tryAcquireNavigatorQueueLock(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.locks?.request !== 'function'
  )
    return false;
  let settled = false;
  let resolveAcquisition: ((v: boolean) => void) | null = null;
  const acquisition = new Promise<boolean>((resolve) => {
    resolveAcquisition = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  });
  let releaseLock: (() => void) | null = null;
  void navigator.locks
    .request(SYNC_QUEUE_LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        resolveAcquisition?.(false);
        return;
      }
      const hold = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      resolveAcquisition?.(true);
      await hold;
    })
    .catch(() => {
      resolveAcquisition?.(false);
    });
  const timeout = setTimeout(() => {
    resolveAcquisition?.(false);
  }, SYNC_QUEUE_WEB_LOCK_ACQUIRE_TIMEOUT_MS);
  const acquired = await acquisition;
  clearTimeout(timeout);
  if (!acquired || !releaseLock) return false;
  activeQueueLease = { mode: 'web-lock', release: releaseLock };
  return true;
}

async function acquireQueueWriteLease(
  now: () => number = getLeaseTime
): Promise<boolean> {
  if (await tryAcquireNavigatorQueueLock()) return true;
  for (
    let attempt = 0;
    attempt < SYNC_QUEUE_LOCK_ACQUIRE_ATTEMPTS;
    attempt += 1
  ) {
    const currentTime = now();
    const existingLease = readQueueLease();
    if (
      existingLease &&
      existingLease.owner !== queueOwnerId &&
      existingLease.expiresAt > currentTime
    ) {
      await sleep(
        randomBetween(
          SYNC_QUEUE_LOCK_BACKOFF_MIN_MS,
          SYNC_QUEUE_LOCK_BACKOFF_MAX_MS
        )
      );
      continue;
    }
    const nextLease: QueueWriteLease = {
      owner: queueOwnerId,
      expiresAt: currentTime + syncQueueLeaseTtlMs,
      nonce: createQueueLeaseNonce(),
      epoch: Math.max(
        (existingLease?.epoch ?? 0) + 1,
        queueLeaseEpochCounter + 1,
        now()
      ),
    };
    queueLeaseEpochCounter = nextLease.epoch;
    localStorage.setItem(
      getSyncQueueLockStorageKey(),
      JSON.stringify(nextLease)
    );
    await sleep(
      randomBetween(
        SYNC_QUEUE_LOCK_VERIFY_DELAY_MIN_MS,
        SYNC_QUEUE_LOCK_VERIFY_DELAY_MAX_MS
      )
    );
    const confirmed = readQueueLease();
    if (
      confirmed &&
      confirmed.owner === nextLease.owner &&
      confirmed.nonce === nextLease.nonce &&
      confirmed.epoch === nextLease.epoch
    ) {
      activeQueueLease = {
        mode: 'storage',
        owner: nextLease.owner,
        nonce: nextLease.nonce,
        epoch: nextLease.epoch,
      };
      return true;
    }
    await sleep(
      randomBetween(
        SYNC_QUEUE_LOCK_BACKOFF_MIN_MS,
        SYNC_QUEUE_LOCK_BACKOFF_MAX_MS
      )
    );
  }
  return false;
}

async function withQueueWriteLease(
  action: () => void | Promise<void>,
  dependencies: QueueLeaseDependencies = {}
): Promise<void> {
  const now = dependencies.now ?? getLeaseTime;
  const scheduler = dependencies.scheduler ?? {
    schedule: scheduleLeaseRenewal,
    cancel: cancelLeaseRenewal,
  };
  const acquired = await acquireQueueWriteLease(now);
  if (!acquired) {
    throw new Error('Failed to acquire sync queue write lease');
  }
  let heartbeatTimer: unknown | null = null;
  if (activeQueueLease?.mode === 'storage') {
    heartbeatTimer = scheduler.schedule(
      () => {
        try {
          renewActiveStorageQueueLease(now);
        } catch {
          // Action path will fail on next lease verification before commit.
        }
      },
      Math.max(25, Math.floor(syncQueueLeaseTtlMs / 3))
    );
  }
  try {
    await action();
  } finally {
    if (heartbeatTimer) {
      scheduler.cancel(heartbeatTimer);
    }
    releaseQueueLease();
  }
}

function readQueueFromStorage(): SyncOperation[] {
  const stored = localStorage.getItem(getSyncQueueStorageKey());
  if (!stored) {
    return [];
  }

  const parsed = JSON.parse(stored) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Sync queue storage must be a JSON array');
  }

  const validOperations = parsed.filter(isValidSyncOperationInput);
  if (validOperations.length !== parsed.length) {
    queueStorageError = 'corrupt';
    quarantineQueueContents(stored);
  }

  if (validOperations.length === 0 && parsed.length > 0) {
    localStorage.removeItem(getSyncQueueStorageKey());
    console.warn('Sync queue storage contained only invalid entries', {
      key: getSyncQueueStorageKey(),
      totalEntries: parsed.length,
      validEntries: 0,
    });
    return [];
  }

  return dedupeOperations(validOperations);
}

function writeQueueWithLatestMerge(
  nextQueue: SyncOperationInput[],
  baseQueue?: SyncOperationInput[]
): void {
  ensureActiveStorageLeaseOwnership();
  const latestQueue = readQueueFromStorage();
  const normalizedNextQueue = dedupeOperations(nextQueue);
  const normalizedBaseQueue = baseQueue
    ? dedupeOperations(baseQueue)
    : undefined;

  const mergedQueue = normalizedBaseQueue
    ? (() => {
        const baseOperationKeys = new Set(
          normalizedBaseQueue.map((operation) => getOperationKey(operation))
        );
        const nextOperationKeys = new Set(
          normalizedNextQueue.map((operation) => getOperationKey(operation))
        );
        const nextLatestOperationByIdentity = new Map<string, SyncOperation>();

        for (const operation of normalizedNextQueue) {
          const identity = getOperationIdentity(operation);
          const existingOperation = nextLatestOperationByIdentity.get(identity);
          if (
            existingOperation === undefined ||
            compareOperations(operation, existingOperation) > 0
          ) {
            nextLatestOperationByIdentity.set(identity, operation);
          }
        }

        const concurrentLatestOperations = latestQueue.filter((operation) => {
          const operationKey = getOperationKey(operation);
          if (baseOperationKeys.has(operationKey)) {
            return false;
          }

          if (nextOperationKeys.has(operationKey)) {
            return false;
          }

          const operationIdentity = getOperationIdentity(operation);
          const nextLatestOperation =
            nextLatestOperationByIdentity.get(operationIdentity);
          if (nextLatestOperation === undefined) {
            return true;
          }

          return compareOperations(operation, nextLatestOperation) >= 0;
        });

        return dedupeOperations([
          ...normalizedNextQueue,
          ...concurrentLatestOperations,
        ]);
      })()
    : normalizedNextQueue;

  if (mergedQueue.length === 0) {
    ensureActiveStorageLeaseOwnership();
    localStorage.removeItem(getSyncQueueStorageKey());
    return;
  }

  ensureActiveStorageLeaseOwnership();
  localStorage.setItem(getSyncQueueStorageKey(), JSON.stringify(mergedQueue));
  // The lease is checked immediately before this synchronous write. A check
  // after the commit could report failure after the data is already persisted,
  // and attempting rollback could erase a concurrent tab's newer queue.
}

export const __testInternals = {
  withQueueWriteLease,
  readQueueLease,
  writeQueueWithLatestMerge,
  acquireCompetingStorageLease(owner: string): QueueWriteLease {
    const existingLease = readQueueLease();
    const now = getLeaseTime();
    if (existingLease && existingLease.expiresAt > now) {
      throw new Error('Storage lease is still active');
    }
    const lease: QueueWriteLease = {
      owner,
      nonce: createQueueLeaseNonce(),
      epoch: Math.max(
        (existingLease?.epoch ?? 0) + 1,
        queueLeaseEpochCounter + 1,
        now
      ),
      expiresAt: now + syncQueueLeaseTtlMs,
    };
    queueLeaseEpochCounter = lease.epoch;
    localStorage.setItem(getSyncQueueLockStorageKey(), JSON.stringify(lease));
    return lease;
  },
  setLeaseClockForTests(now: () => number): void {
    getLeaseTime = now;
  },
  disableLeaseRenewalForTests(): void {
    scheduleLeaseRenewal = () => 0 as unknown as ReturnType<typeof setInterval>;
    cancelLeaseRenewal = () => {};
  },
  setLeaseTtlForTests(ttlMs: number): void {
    syncQueueLeaseTtlMs = ttlMs;
  },
  resetLeaseTtlForTests(): void {
    syncQueueLeaseTtlMs = DEFAULT_SYNC_QUEUE_LEASE_TTL_MS;
    getLeaseTime = Date.now;
    scheduleLeaseRenewal = (callback, intervalMs) =>
      setInterval(callback, intervalMs);
    cancelLeaseRenewal = (timer) => clearInterval(timer);
  },
  resetQueueStorageStateForTests(): void {
    queueStorageError = null;
    volatileQueueIssues.clear();
  },
};

/**
 * Add an operation to the sync queue (called when offline)
 */
export async function queueOperation(
  operation: SyncOperationInput,
  expectedUserId?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await withQueueWriteLease(() => {
      assertExpectedQueueUser(expectedUserId);
      const baseQueue = getQueue();
      writeQueueWithLatestMerge([...baseQueue, operation], baseQueue);
      clearVolatileQueueIssues([...baseQueue, operation]);
    });
    queueStorageError = null;
  } catch (error) {
    queueStorageError = getErrorType(error);
    console.error('Failed to queue operation', { errorType: queueStorageError });
    throw new SyncQueuePersistenceError();
  }
}

/**
 * Get all queued operations
 */
export function getQueue(): SyncOperation[] {
  if (typeof window === 'undefined') return [];

  const queueStorageKey = getSyncQueueStorageKey();

  try {
    const queue = readQueueFromStorage();
    return queue.map((operation) => {
      const volatileIssue = volatileQueueIssues.get(getVolatileIssueKey(operation));
      return operation.syncIssue || !volatileIssue
        ? operation
        : { ...operation, syncIssue: volatileIssue };
    });
  } catch (error) {
    queueStorageError = getErrorType(error);
    try {
      const rawStoredQueue = localStorage.getItem(queueStorageKey);

      if (rawStoredQueue !== null) {
        quarantineQueueContents(rawStoredQueue);
        localStorage.removeItem(queueStorageKey);
      }

      console.warn('Sync queue storage parse failure', {
        key: queueStorageKey,
        errorType: queueStorageError,
        quarantined: rawStoredQueue !== null,
        quarantineKey: getSyncQueueQuarantineStorageKey(),
      });
    } catch (recoveryError) {
      queueStorageError = getErrorType(recoveryError);
    }
    return [];
  }
}

export function getSyncQueueStorageError(): string | null {
  return queueStorageError;
}

export function rememberVolatileSyncIssue(
  operation: SyncOperationInput,
  issue: SyncOperationIssue
): void {
  volatileQueueIssues.set(getVolatileIssueKey(operation), issue);
}

/**
 * Replace queue contents atomically (used to persist remaining operations after partial sync)
 */
export async function setQueue(
  operations: SyncOperationInput[],
  baseQueue?: SyncOperationInput[],
  expectedUserId?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await withQueueWriteLease(() => {
      assertExpectedQueueUser(expectedUserId);
      writeQueueWithLatestMerge(operations, baseQueue);
      clearVolatileQueueIssues(operations);
    });
    queueStorageError = null;
  } catch (error) {
    queueStorageError = getErrorType(error);
    console.error('Failed to set sync queue', { errorType: queueStorageError });
    throw new SyncQueuePersistenceError();
  }
}

/** Apply a transformation to the latest queue while holding the cross-tab write lease. */
export async function updateQueue(
  transform: (queue: SyncOperation[]) => SyncOperationInput[],
  expectedUserId?: string
): Promise<SyncOperation[]> {
  if (typeof window === 'undefined') return [];

  let updatedQueue: SyncOperation[] = [];
  try {
    await withQueueWriteLease(() => {
      assertExpectedQueueUser(expectedUserId);
      const currentQueue = readQueueFromStorage();
      const nextQueue = transform(currentQueue);
      writeQueueWithLatestMerge(nextQueue, currentQueue);
      clearVolatileQueueIssues(nextQueue);
      updatedQueue = readQueueFromStorage();
    });
    queueStorageError = null;
  } catch (error) {
    queueStorageError = getErrorType(error);
    console.error('Failed to update sync queue', { errorType: queueStorageError });
    throw new SyncQueuePersistenceError();
  }
  return updatedQueue;
}

/** Atomically freeze the latest unattempted CREATE payload before its first send. */
export async function markCreateOperationAttempted(
  operation: Extract<SyncOperation, { type: 'CREATE' }>,
  expectedUserId?: string
): Promise<Extract<SyncOperation, { type: 'CREATE' }>> {
  if (typeof window === 'undefined') {
    throw new SyncQueuePersistenceError();
  }

  let markedOperation: Extract<SyncOperation, { type: 'CREATE' }> | undefined;
  try {
    await withQueueWriteLease(() => {
      assertExpectedQueueUser(expectedUserId);
      const latestQueue = readQueueFromStorage();
      const index = latestQueue.findIndex((queuedOperation) =>
        queuedOperation.type === 'CREATE' &&
        queuedOperation.session.id === operation.session.id &&
        queuedOperation.queuedAt === operation.queuedAt
      );
      if (index < 0) throw new Error('Queued create was not found');

      const latestOperation = latestQueue[index];
      if (latestOperation?.type !== 'CREATE') {
        throw new Error('Queued create is invalid');
      }
      markedOperation = latestOperation.attempted === true
        ? latestOperation
        : { ...latestOperation, attempted: true };
      if (latestOperation.attempted !== true) {
        const nextQueue = [...latestQueue];
        nextQueue[index] = markedOperation;
        writeQueueWithLatestMerge(nextQueue, latestQueue);
      }
    });
    queueStorageError = null;
  } catch (error) {
    queueStorageError = getErrorType(error);
    console.error('Failed to freeze queued create', { errorType: queueStorageError });
    throw new SyncQueuePersistenceError();
  }

  if (!markedOperation) throw new SyncQueuePersistenceError();
  return markedOperation;
}

/**
 * Clear the entire sync queue (called after successful sync)
 */
export async function clearQueue(
  baseQueue?: SyncOperationInput[]
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await withQueueWriteLease(() => {
      writeQueueWithLatestMerge([], baseQueue);
      if (baseQueue) clearVolatileQueueIssues(baseQueue);
    });
    queueStorageError = null;
  } catch (error) {
    queueStorageError = getErrorType(error);
    console.error('Failed to clear sync queue', { errorType: queueStorageError });
    throw new SyncQueuePersistenceError();
  }
}

/**
 * Remove queued operation(s) by stable identity key.
 *
 * - If `operation.queuedAt` is provided, removes the exact matching operation key.
 * - If `operation.queuedAt` is omitted, removes all operations for that identity.
 */
export async function removeOperationByIdentity(
  operation: SyncOperationInput
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await withQueueWriteLease(() => {
      const baseQueue = getQueue();
      const targetKey = getOperationKey(operation);
      const queue = hasQueuedAt(operation)
        ? baseQueue.filter(
            (queuedOperation) => getOperationKey(queuedOperation) !== targetKey
          )
        : baseQueue.filter(
            (queuedOperation) =>
              getOperationIdentity(queuedOperation) !==
              getOperationIdentity(operation)
          );

      writeQueueWithLatestMerge(queue, baseQueue);
      volatileQueueIssues.delete(getVolatileIssueKey(operation));
    });
    queueStorageError = null;
  } catch (error) {
    queueStorageError = getErrorType(error);
    console.error('Failed to remove operation from queue', { errorType: queueStorageError });
    throw new SyncQueuePersistenceError();
  }
}

/**
 * Check if there are any pending operations
 */
export function hasPendingOperations(): boolean {
  return getEligiblePendingOperations(getQueue()).length > 0;
}

/** Return pending operations that are not blocked by an earlier failed operation
 * for the same session. This is shared by the queue runner and recovery UI.
 */
export function getEligiblePendingOperations(
  operations: readonly SyncOperation[]
): SyncOperation[] {
  const pausedSessions = new Set(
    operations.filter((operation) => operation.syncIssue).map(getOperationSessionId)
  );
  return operations.filter(
    (operation) =>
      !operation.syncIssue && !pausedSessions.has(getOperationSessionId(operation))
  );
}

/**
 * Get the count of pending operations
 */
export function getPendingOperationCount(): number {
  return getEligiblePendingOperations(getQueue()).length;
}

export function getConflictOperationCount(): number {
  return getQueue().filter((operation) => operation.syncIssue?.type === 'conflict').length;
}

export function getAuthenticationBlockedOperationCount(): number {
  return getQueue().filter((operation) => operation.syncIssue?.type === 'authentication').length;
}

export function getRejectedOperationCount(): number {
  return getQueue().filter((operation) => operation.syncIssue?.type === 'rejected').length;
}
