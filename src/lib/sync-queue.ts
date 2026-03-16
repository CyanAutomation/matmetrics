import { JudoSession } from './types';

const SYNC_QUEUE_KEY = 'matmetrics_sync_queue';

export type SyncOperation =
  | { type: 'CREATE'; session: JudoSession }
  | { type: 'UPDATE'; session: JudoSession }
  | { type: 'DELETE'; id: string };

/**
 * Add an operation to the sync queue (called when offline)
 */
export function queueOperation(operation: SyncOperation): void {
  if (typeof window === 'undefined') return;

  try {
    const queue = getQueue();
    queue.push(operation);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
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
    const stored = localStorage.getItem(SYNC_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to parse sync queue', e);
    return [];
  }
}

/**
 * Clear the entire sync queue (called after successful sync)
 */
export function clearQueue(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(SYNC_QUEUE_KEY);
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
    const queue = getQueue();
    queue.splice(index, 1);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
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
