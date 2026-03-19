import { JudoSession } from './types';
import { getScopedStorageKey } from './client-identity';

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

export function getSyncQueueStorageKey(): string {
  return getScopedStorageKey(SYNC_QUEUE_KEY_BASE);
}

type SyncOperationPayload =
  | { type: 'CREATE'; session: JudoSession }
  | { type: 'UPDATE'; session: JudoSession }
  | { type: 'DELETE'; id: string };

export type SyncOperation = SyncOperationPayload & { queuedAt: number };

type SyncOperationInput = SyncOperationPayload | SyncOperation;

let lastQueuedAt = 0;

function getNextQueuedAt(): number {
  const now = Date.now();
  lastQueuedAt = Math.max(lastQueuedAt + 1, now);
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

function getOperationIdentity(operation: SyncOperationInput): string {
  if (operation.type === 'DELETE') {
    return `${operation.type}:${operation.id}`;
  }

  return `${operation.type}:${operation.session.id}`;
}

function hasQueuedAt(operation: SyncOperationInput): operation is SyncOperation {
  return 'queuedAt' in operation && Number.isFinite(operation.queuedAt);
}

function getOperationKey(operation: SyncOperationInput): string {
  const identity = getOperationIdentity(operation);
  return hasQueuedAt(operation)
    ? `${identity}:${operation.queuedAt}`
    : `${identity}:*`;
}

function dedupeOperations(operations: SyncOperationInput[]): SyncOperation[] {
  const byIdentity = new Map<string, SyncOperation>();

  for (const operation of operations) {
    const normalizedOperation = withQueuedAt(operation);
    const identity = getOperationIdentity(normalizedOperation);
    const existingOperation = byIdentity.get(identity);

    if (
      !existingOperation ||
      normalizedOperation.queuedAt >= existingOperation.queuedAt
    ) {
      byIdentity.set(identity, normalizedOperation);
    }
  }

  return Array.from(byIdentity.values());
}

function readQueueFromStorage(): SyncOperation[] {
  const stored = localStorage.getItem(getSyncQueueStorageKey());
  return stored ? dedupeOperations(JSON.parse(stored)) : [];
}

function writeQueueWithLatestMerge(
  nextQueue: SyncOperationInput[],
  baseQueue?: SyncOperationInput[]
): void {
  const latestQueue = readQueueFromStorage();
  const normalizedNextQueue = dedupeOperations(nextQueue);
  const normalizedBaseQueue = baseQueue
    ? dedupeOperations(baseQueue)
    : undefined;

  const mergedQueue = normalizedBaseQueue
    ? (() => {
        const baseLatestByIdentity = new Map<string, number>();

        for (const operation of normalizedBaseQueue) {
          const identity = getOperationIdentity(operation);
          const existingQueuedAt =
            baseLatestByIdentity.get(identity) ?? Number.NEGATIVE_INFINITY;
          if (operation.queuedAt > existingQueuedAt) {
            baseLatestByIdentity.set(identity, operation.queuedAt);
          }
        }

        const concurrentLatestOperations = latestQueue.filter((operation) => {
          const baseQueuedAt = baseLatestByIdentity.get(
            getOperationIdentity(operation)
          );
          return (
            baseQueuedAt === undefined || operation.queuedAt > baseQueuedAt
          );
        });

        return dedupeOperations([
          ...normalizedNextQueue,
          ...concurrentLatestOperations,
        ]);
      })()
    : normalizedNextQueue;

  if (mergedQueue.length === 0) {
    localStorage.removeItem(getSyncQueueStorageKey());
    return;
  }

  localStorage.setItem(getSyncQueueStorageKey(), JSON.stringify(mergedQueue));
}

/**
 * Add an operation to the sync queue (called when offline)
 */
export function queueOperation(operation: SyncOperationInput): void {
  if (typeof window === 'undefined') return;

  try {
    const baseQueue = getQueue();
    writeQueueWithLatestMerge([...baseQueue, operation], baseQueue);
  } catch (e) {
    console.error('Failed to queue operation', e);
  }
}

/**
 * Get all queued operations
 */
export function getQueue(): SyncOperation[] {
  if (typeof window === 'undefined') return [];

  try {
    return readQueueFromStorage();
  } catch (e) {
    console.error('Failed to parse sync queue', e);
    return [];
  }
}

/**
 * Replace queue contents atomically (used to persist remaining operations after partial sync)
 */
export function setQueue(
  operations: SyncOperationInput[],
  baseQueue?: SyncOperationInput[]
): void {
  if (typeof window === 'undefined') return;

  try {
    writeQueueWithLatestMerge(operations, baseQueue);
  } catch (e) {
    console.error('Failed to set sync queue', e);
  }
}

/**
 * Clear the entire sync queue (called after successful sync)
 */
export function clearQueue(baseQueue?: SyncOperationInput[]): void {
  if (typeof window === 'undefined') return;

  try {
    writeQueueWithLatestMerge([], baseQueue);
  } catch (e) {
    console.error('Failed to clear sync queue', e);
  }
}

/**
 * Remove queued operation(s) by stable identity key.
 *
 * - If `operation.queuedAt` is provided, removes the exact matching operation key.
 * - If `operation.queuedAt` is omitted, removes all operations for that identity.
 */
export function removeOperationByIdentity(operation: SyncOperationInput): void {
  if (typeof window === 'undefined') return;

  try {
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
  } catch (e) {
    console.error('Failed to remove operation from queue', e);
  }
}

/**
 * Check if there are any pending operations
 */
export function hasPendingOperations(): boolean {
  return getQueue().length > 0;
}

/**
 * Get the count of pending operations
 */
export function getPendingOperationCount(): number {
  return getQueue().length;
}
