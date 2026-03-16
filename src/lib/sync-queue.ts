import { JudoSession } from './types';

/**
 * Shared localStorage key for offline sync operations.
 *
 * Multi-tab behavior:
 * - Every write re-reads this key immediately before commit to reduce stale-tab overwrites.
 * - Writes de-duplicate operations by identity so retries do not grow duplicates indefinitely.
 * - Callers that sync using a stale snapshot can pass that snapshot as `baseQueue` so writes retain
 *   operations added by other tabs while still removing/rewriting the expected items.
 */
export const SYNC_QUEUE_KEY = 'matmetrics_sync_queue';

export type SyncOperation =
  | { type: 'CREATE'; session: JudoSession }
  | { type: 'UPDATE'; session: JudoSession }
  | { type: 'DELETE'; id: string };

function getOperationIdentity(operation: SyncOperation): string {
  if (operation.type === 'DELETE') {
    return `${operation.type}:${operation.id}`;
  }

  return `${operation.type}:${operation.session.id}`;
}

function dedupeOperations(operations: SyncOperation[]): SyncOperation[] {
  const byIdentity = new Map<string, SyncOperation>();

  for (const operation of operations) {
    byIdentity.set(getOperationIdentity(operation), operation);
  }

  return Array.from(byIdentity.values());
}

function readQueueFromStorage(): SyncOperation[] {
  const stored = localStorage.getItem(SYNC_QUEUE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function writeQueueWithLatestMerge(nextQueue: SyncOperation[], baseQueue?: SyncOperation[]): void {
  const latestQueue = readQueueFromStorage();

  const mergedQueue = baseQueue
    ? (() => {
      const baseIdentities = new Set(baseQueue.map(getOperationIdentity));
      return dedupeOperations([
        ...nextQueue,
        ...latestQueue.filter(operation => !baseIdentities.has(getOperationIdentity(operation))),
      ]);
    })()
    : dedupeOperations(nextQueue);

  if (mergedQueue.length === 0) {
    localStorage.removeItem(SYNC_QUEUE_KEY);
    return;
  }

  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(mergedQueue));
}

/**
 * Add an operation to the sync queue (called when offline)
 */
export function queueOperation(operation: SyncOperation): void {
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
export function setQueue(operations: SyncOperation[], baseQueue?: SyncOperation[]): void {
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
export function clearQueue(baseQueue?: SyncOperation[]): void {
  if (typeof window === 'undefined') return;

  try {
    writeQueueWithLatestMerge([], baseQueue);
  } catch (e) {
    console.error('Failed to clear sync queue', e);
  }
}

/**
 * Remove a specific operation from the queue by index
 * (useful for removing operations as they're successfully synced)
 */
export function removeOperation(index: number): void {
  if (typeof window === 'undefined') return;

  try {
    const baseQueue = getQueue();
    const queue = [...baseQueue];
    queue.splice(index, 1);
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
