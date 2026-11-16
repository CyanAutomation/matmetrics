/**
 * Mutation State Management Module
 *
 * Handles dirty mutation tracking, optimistic updates, and state reconciliation
 * for offline-first session storage.
 *
 * Extracted from storage.ts to reduce cognitive complexity and enable independent testing.
 */

import { JudoSession } from './types';
import { getQueue, type SyncOperationIssue } from './sync-queue';

// ============================================================================
// Types
// ============================================================================

export type DirtyMutation =
  | {
      type: 'CREATE' | 'UPDATE';
      session: JudoSession;
      version: number;
      syncIssue?: SyncOperationIssue;
    }
  | {
      type: 'DELETE';
      id: string;
      version: number;
      session?: JudoSession;
      syncIssue?: SyncOperationIssue;
    };

export type DirtyMutationInput =
  | {
      type: 'CREATE' | 'UPDATE';
      session: JudoSession;
    }
  | {
      type: 'DELETE';
      id: string;
      session?: JudoSession;
    };

// ============================================================================
// State
// ============================================================================

const dirtyMutations = new Map<string, DirtyMutation>();
let mutationVersion = 0;

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the next mutation version number
 */
function nextMutationVersion(): number {
  mutationVersion += 1;
  return mutationVersion;
}

/**
 * Mark a mutation as dirty (pending sync)
 * Returns the version number assigned to this mutation
 */
export function markDirtyMutation(
  mutation: DirtyMutationInput,
  version = nextMutationVersion()
): number {
  mutationVersion = Math.max(mutationVersion, version);
  const id = mutation.type === 'DELETE' ? mutation.id : mutation.session.id;
  dirtyMutations.set(id, {
    ...mutation,
    version,
  } as DirtyMutation);
  return version;
}

/**
 * Clear a dirty mutation (mark as synced)
 * Only clears if version matches (if provided)
 */
export function clearDirtyMutation(id: string, version?: number): void {
  const existing = dirtyMutations.get(id);
  if (!existing) {
    return;
  }

  if (version !== undefined && existing.version !== version) {
    return;
  }

  dirtyMutations.delete(id);
}

export function markDirtyMutationIssue(
  id: string,
  version: number,
  syncIssue: SyncOperationIssue
): void {
  const existing = dirtyMutations.get(id);
  if (!existing || existing.version !== version) return;
  dirtyMutations.set(id, { ...existing, syncIssue });
}

export function clearAuthenticationMutationIssue(
  id: string,
  version: number
): void {
  const existing = dirtyMutations.get(id);
  if (
    !existing ||
    existing.version !== version ||
    existing.syncIssue?.type !== 'authentication'
  ) {
    return;
  }

  const { syncIssue: _syncIssue, ...resumed } = existing;
  dirtyMutations.set(id, resumed as DirtyMutation);
}

/**
 * Reload dirty mutations from the sync queue
 * This reconciles the mutation map with the persistent queue
 */
export function hydrateDirtyMutationsFromQueue(): void {
  dirtyMutations.clear();

  for (const operation of getQueue()) {
    if (operation.type === 'DELETE') {
      markDirtyMutation({
        type: 'DELETE',
        id: operation.id,
        ...(operation.session ? { session: operation.session } : {}),
      }, operation.queuedAt);
      if (operation.syncIssue) {
        markDirtyMutationIssue(operation.id, operation.queuedAt, operation.syncIssue);
      }
      continue;
    }

    markDirtyMutation(
      { type: operation.type, session: operation.session },
      operation.queuedAt
    );
    if (operation.syncIssue) {
      markDirtyMutationIssue(
        operation.session.id,
        operation.queuedAt,
        operation.syncIssue
      );
    }
  }
}

/**
 * Get all currently dirty mutations
 */
export function getDirtyMutations(): Map<string, DirtyMutation> {
  return new Map(dirtyMutations);
}

/**
 * Clear all dirty mutations
 * Typically called when initializing from scratch (e.g., on sign-out)
 */
export function clearAllDirtyMutations(): void {
  dirtyMutations.clear();
}

/**
 * Reset mutation version counter
 * Used for testing and state resets
 */
export function resetMutationVersion(): void {
  mutationVersion = 0;
}

// ============================================================================
// Optimistic Update Logic
// ============================================================================

/**
 * Compare two sessions for equality
 */
export function sessionsEqual(left: JudoSession, right: JudoSession): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Apply a single dirty mutation to a base sessions array
 * Returns the updated array
 */
function applyOptimisticMutation(
  baseSessions: JudoSession[],
  mutation: DirtyMutation
): JudoSession[] {
  if (mutation.type === 'DELETE') {
    if (mutation.syncIssue) {
      if (
        mutation.session &&
        !baseSessions.some((session) => session.id === mutation.id)
      ) {
        return [mutation.session, ...baseSessions];
      }
      return baseSessions;
    }
    return baseSessions.filter((session) => session.id !== mutation.id);
  }

  const existingIndex = baseSessions.findIndex(
    (session) => session.id === mutation.session.id
  );

  if (existingIndex === -1) {
    return [mutation.session, ...baseSessions];
  }

  return baseSessions.map((session, index) =>
    index === existingIndex ? mutation.session : session
  );
}

/**
 * Get all sessions with optimistic mutations applied
 * Mutations are applied in order of version to maintain consistency
 */
export function getOptimisticSessions(
  baseSessions: JudoSession[]
): JudoSession[] {
  return Array.from(dirtyMutations.values())
    .sort((left, right) => left.version - right.version)
    .reduce(applyOptimisticMutation, baseSessions);
}
