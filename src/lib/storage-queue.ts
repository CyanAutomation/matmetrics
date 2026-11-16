// fallow-ignore-file unused-export
// Active exports used by storage.ts sync orchestration:
// - SyncRequestError: Custom error for sync failures (retryable vs. permanent)
// - parseRetryAfterMs(): Parse RFC 7231 Retry-After header
// - processSingleQueueOperation(): Core sync operation handler (139+ call sites in storage.ts)

/**
 * Queue Operation Processing Module
 * =================================
 *
 * Handles the core logic for processing individual sync operations from the mutation queue.
 * Extracted from storage.ts to reduce cognitive complexity and improve testability.
 *
 * Responsibilities:
 * - Building request bodies for CREATE/UPDATE/DELETE operations
 * - Routing operations to correct API endpoints
 * - Managing retry logic and backoff
 * - Coordinating with lease ownership and dirty mutation tracking
 */

import type { GitHubConfig } from './types';
import type { SessionSnapshot } from './keiko-session-revision';
import type { SyncOperation } from './sync-queue';
import type { SyncOperationIssue } from './sync-queue';
import { rememberVolatileSyncIssue } from './sync-queue';
import { keikoIfMatch } from './keiko-session-revision';
import { clearDirtyMutation, markDirtyMutationIssue } from './mutation-state';
import {
  hasActiveSyncLeaseOwnership as coreHasActiveSyncLeaseOwnership,
  renewSyncLease as coreRenewSyncLease,
} from './sync-lease';

/**
 * Custom error class for sync request failures.
 * Distinguishes between retryable errors (network, 5xx, rate limiting)
 * and permanent failures (4xx client errors).
 */
export class SyncRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs: number | null = null,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

/** Return a safe, typed recovery category for a permanent HTTP rejection. */
export function classifySyncOperationIssue(
  error: unknown
): SyncOperationIssue | null {
  if (!(error instanceof SyncRequestError) || error.retryable) return null;

  if ([404, 409, 412, 428].includes(error.status ?? -1)) {
    return { type: 'conflict', status: error.status as 404 | 409 | 412 | 428 };
  }
  if (error.status === 401 || error.status === 403) {
    return { type: 'authentication', status: error.status };
  }
  return {
    type: 'rejected',
    ...(typeof error.status === 'number' ? { status: error.status } : {}),
  };
}

/**
 * Parse Retry-After header into milliseconds.
 * Supports both delay-seconds and HTTP-date formats per RFC 7231.
 */
export function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }

  const retryAt = Date.parse(headerValue);
  if (!Number.isNaN(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return null;
}

/**
 * Build the request body for a sync operation.
 * Includes session data for CREATE/UPDATE, revision for DELETE,
 * and optionally GitHub configuration if enabled.
 */
function buildOperationRequestBody(
  operation: SyncOperation,
  gitHubConfig: GitHubConfig | null,
  gitHubEnabled: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  switch (operation.type) {
    case 'CREATE':
      Object.assign(body, operation.session);
      break;
    case 'UPDATE':
      {
        const { keikoRevision: _keikoRevision, ...session } = operation.session;
        Object.assign(body, session);
      }
      break;
    case 'DELETE':
      if (operation.revisionSha) {
        body.revisionSha = operation.revisionSha;
      }
      break;
  }

  if (gitHubConfig && gitHubEnabled) {
    body.gitHubConfig = gitHubConfig;
  }

  return body;
}

/**
 * Get the API endpoint URL for a sync operation.
 * Routing: CREATE → /api/sessions/create, UPDATE/DELETE → /api/sessions/:id
 */
function getOperationUrl(operation: SyncOperation): string {
  switch (operation.type) {
    case 'CREATE':
      return '/api/sessions/create';
    case 'UPDATE':
      return `/api/sessions/${operation.session.id}`;
    case 'DELETE':
      return `/api/sessions/${operation.id}`;
  }
}

/**
 * Get the HTTP method for a sync operation.
 * CREATE → POST, UPDATE → PUT, DELETE → DELETE
 */
function getOperationMethod(
  operation: SyncOperation
): 'POST' | 'PUT' | 'DELETE' {
  switch (operation.type) {
    case 'CREATE':
      return 'POST';
    case 'UPDATE':
      return 'PUT';
    case 'DELETE':
      return 'DELETE';
  }
}

/**
 * Extract session ID from a sync operation.
 * Needed for mutation tracking and dirty state management.
 */
function getSessionIdFromOperation(operation: SyncOperation): string {
  switch (operation.type) {
    case 'CREATE':
    case 'UPDATE':
      return operation.session.id;
    case 'DELETE':
      return operation.id;
  }
}

function getOperationIdentityKey(operation: SyncOperation): string {
  return `${operation.type}:${getSessionIdFromOperation(operation)}:${operation.queuedAt}`;
}

function retainExcludedOperations(
  remaining: SyncOperation[],
  activeQueue: SyncOperation[],
  baseQueue: SyncOperation[]
): SyncOperation[] {
  const activeKeys = new Set(activeQueue.map(getOperationIdentityKey));
  const excluded = baseQueue.filter(
    (queuedOperation) => !activeKeys.has(getOperationIdentityKey(queuedOperation))
  );
  return [...remaining, ...excluded];
}

/**
 * Handle a successful sync operation.
 * Clears the dirty mutation flag so optimistic updates are no longer tracked.
 */
function handleOperationSuccess(operation: SyncOperation): void {
  const sessionId = getSessionIdFromOperation(operation);
  clearDirtyMutation(sessionId, operation.queuedAt);
}

/**
 * Error handler for sync operation failures.
 * Classifies errors as permanent or retryable, extracts retry-after delays,
 * and prepares the queue state for retry/recovery.
 */
export async function handleOperationError(
  error: unknown,
  operation: SyncOperation,
  index: number,
  queue: SyncOperation[],
  generation: number,
  isStorageGenerationCurrent: (gen: number) => boolean,
  setQueue: (ops: SyncOperation[], current: SyncOperation[]) => Promise<void>,
  reconcilePermanentFailure: (
    operation: SyncOperation,
    issue: SyncOperationIssue
  ) => Promise<void>,
  baseQueue: SyncOperation[] = queue
): Promise<{ retryable: boolean; retryAfterMs: number | null }> {
  if (!(error instanceof SyncRequestError)) {
    // Non-SyncRequestError: assume network error, retryable
    return { retryable: true, retryAfterMs: null };
  }

  const syncIssue = classifySyncOperationIssue(error);
  if (syncIssue) {
    const failedOperation = { ...operation, syncIssue } as SyncOperation;
    const retainedOperations = retainExcludedOperations(
      [failedOperation, ...queue.slice(index + 1)],
      queue,
      baseQueue
    );
    if (isStorageGenerationCurrent(generation)) {
      const sessionId = getSessionIdFromOperation(operation);
      markDirtyMutationIssue(sessionId, operation.queuedAt, syncIssue);
      try {
        await setQueue(retainedOperations, baseQueue);
      } catch {
        // Keep this tab from retrying automatically if the issue marker could
        // not be written. The original queued payload remains in storage.
        rememberVolatileSyncIssue(failedOperation, syncIssue);
      }
      if (operation.type === 'DELETE') {
        await reconcilePermanentFailure(failedOperation, syncIssue);
      }
    }
    return { retryable: false, retryAfterMs: null };
  }

  // Retryable error with optional backoff
  return {
    retryable: true,
    retryAfterMs: error.retryAfterMs,
  };
}

/**
 * Process a single queue operation with lease ownership verification and error handling.
 *
 * Flow:
 * 1. Verify lease ownership before starting
 * 2. Build and send the operation request
 * 3. For CREATE/UPDATE: update revision SHAs in queued operations to prevent conflicts
 * 4. Verify lease still owned after operation
 * 5. Mark mutation as synced
 * 6. On error: classify error, apply backoff if retryable, update queue
 *
 * Returns:
 * - { success: true, shouldContinue: true } if operation succeeded and next should proceed
 * - { success: false, shouldContinue: false } if lease lost, generation changed, or error occurred
 */
export async function processSingleQueueOperation(
  operation: SyncOperation,
  index: number,
  queue: SyncOperation[],
  generation: number,
  gitHubConfig: GitHubConfig | null,
  gitHubEnabled: boolean,
  onAbort: (remainingOps: SyncOperation[]) => Promise<void>,
  // Helper functions injected for testability
  isStorageGenerationCurrent: (gen: number) => boolean,
  syncRequest: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>,
  parseMutationSession: (response: Response) => Promise<SessionSnapshot>,
  reconcileSuccessfulSession: (session: SessionSnapshot, version: number) => void,
  setQueue: (ops: SyncOperation[], current: SyncOperation[]) => Promise<void>,
  getAuthHeaders: (extras?: HeadersInit) => Promise<HeadersInit>,
  reconcilePermanentFailure: (
    operation: SyncOperation,
    issue: SyncOperationIssue
  ) => Promise<void>,
  baseQueue: SyncOperation[] = queue
): Promise<{
  success: boolean;
  shouldContinue: boolean;
  queue: SyncOperation[];
  permanentFailure: boolean;
}> {
  let nextQueue = queue;

  // Check lease ownership before operation
  if (
    !isStorageGenerationCurrent(generation) ||
    !coreHasActiveSyncLeaseOwnership() ||
    !coreRenewSyncLease()
  ) {
    await onAbort(queue.slice(index));
    return { success: false, shouldContinue: false, queue, permanentFailure: false };
  }

  try {
    // Build request
    const body = buildOperationRequestBody(
      operation,
      gitHubConfig,
      gitHubEnabled
    );
    const url = getOperationUrl(operation);
    const method = getOperationMethod(operation);

    const headers = new Headers(await getAuthHeaders({
      'Content-Type': 'application/json',
    }));
    const expectedRevision = operation.type === 'DELETE'
      ? operation.expectedRevision
      : operation.type === 'UPDATE'
        ? operation.expectedRevision ?? operation.session.keikoRevision
        : undefined;
    const ifMatch = keikoIfMatch(expectedRevision);
    if (ifMatch) headers.set('If-Match', ifMatch);

    if (!isStorageGenerationCurrent(generation)) {
      return { success: false, shouldContinue: false, queue, permanentFailure: false };
    }

    // Send request
    const response = await syncRequest(url, {
      method,
      headers,
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });

    if (operation.type === 'CREATE' || operation.type === 'UPDATE') {
      const serverSession = await parseMutationSession(response);
      reconcileSuccessfulSession(serverSession, operation.queuedAt);
      // Carry the server's new revision into later operations without changing
      // the queue snapshot used as the storage merge baseline.
      nextQueue = queue.map((queuedOperation, queuedIndex) => {
        if (queuedIndex <= index) return queuedOperation;
        if (
          (queuedOperation.type === 'CREATE' ||
            queuedOperation.type === 'UPDATE') &&
          queuedOperation.session.id === serverSession.id
        ) {
          if (queuedOperation.type === 'UPDATE') {
            return {
              ...queuedOperation,
              session: {
                ...queuedOperation.session,
                revisionSha: serverSession.revisionSha,
                ...(typeof serverSession.keikoRevision === 'number'
                  ? { keikoRevision: serverSession.keikoRevision }
                  : {}),
              },
              ...(typeof serverSession.keikoRevision === 'number'
                ? { expectedRevision: serverSession.keikoRevision }
                : {}),
            };
          }
          return {
            ...queuedOperation,
            session: {
              ...queuedOperation.session,
              revisionSha: serverSession.revisionSha,
            },
          };
        }
        if (
          queuedOperation.type === 'DELETE' &&
          queuedOperation.id === serverSession.id
        ) {
          return {
            ...queuedOperation,
            revisionSha: serverSession.revisionSha,
            ...(typeof serverSession.keikoRevision === 'number'
              ? { expectedRevision: serverSession.keikoRevision }
              : {}),
          };
        }
        return queuedOperation;
      });
    }

    // Verify lease still owned after operation
    if (
      !isStorageGenerationCurrent(generation) ||
      !coreHasActiveSyncLeaseOwnership()
    ) {
      await onAbort(nextQueue.slice(index));
      return { success: false, shouldContinue: false, queue: nextQueue, permanentFailure: false };
    }

    // Mark mutation as synced
    handleOperationSuccess(operation);

    return {
      success: true,
      shouldContinue: true,
      queue: nextQueue,
      permanentFailure: false,
    };
  } catch (error) {
    console.error('Error syncing operation', error);

    const { retryable, retryAfterMs } = await handleOperationError(
      error,
      operation,
      index,
      queue,
      generation,
      isStorageGenerationCurrent,
      setQueue,
      (failedOperation, issue) => reconcilePermanentFailure(failedOperation, issue),
      baseQueue
    );

    if (!isStorageGenerationCurrent(generation)) {
      return { success: false, shouldContinue: false, queue, permanentFailure: false };
    }

    // Handle backoff for retryable errors with retry-after header
    if (retryable && retryAfterMs !== null && retryAfterMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    }

    // Stop syncing on error; queue remaining operations for retry
    if (retryable) {
      const remainingOperations = retainExcludedOperations(
        queue.slice(index),
        queue,
        baseQueue
      );
      if (isStorageGenerationCurrent(generation)) {
        await setQueue(remainingOperations, baseQueue);
      }
    }

    return {
      success: false,
      shouldContinue: false,
      queue,
      permanentFailure: !retryable,
    };
  }
}
