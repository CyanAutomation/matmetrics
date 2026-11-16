'use client';

import {
  JudoSession,
  GitHubConfig,
  GitHubSettings,
  MutationResult,
  SessionFileIssue,
} from './types';
import {
  queueOperation,
  getQueue,
  getPendingOperationCount,
  getConflictOperationCount,
  getAuthenticationBlockedOperationCount,
  getRejectedOperationCount,
  getSyncQueueStorageError,
  resumeAuthenticationBlockedOperations,
  hasPendingOperations,
  setQueue,
  removeOperationByIdentity,
  getSyncQueueStorageKey,
  type SyncOperation,
  type SyncOperationIssue,
} from './sync-queue';
import {
  getActiveUserId,
  getScopedStorageKey,
  isGuestMode,
} from './client-identity';
import { getAuthHeaders } from './auth-session';
import {
  ensureGuestWorkspaceSeeded,
  markGuestWorkspaceCustom,
} from './guest-mode';
import {
  DEFAULT_GITHUB_SETTINGS,
  DEFAULT_TRANSFORMER_PROMPT,
  getCurrentPreferences,
  saveGitHubSettingsPreference,
} from './user-preferences';
import type { UserPreferences } from './types';
import { normalizeSessionList } from './session-normalization';
import { keikoIfMatch, type SessionSnapshot } from './keiko-session-revision';
import {
  initializeSyncLeaseModule,
  setActiveSyncLease,
  releaseSyncLease as coreReleaseSyncLease,
  renewSyncLease as coreRenewSyncLease,
  tryAcquireSyncLease as coreTryAcquireSyncLease,
} from './sync-lease';
import type { LeaseTakeoverDiagnosticPayload } from './sync-lease';
import {
  markDirtyMutation,
  markDirtyMutationIssue,
  clearAuthenticationMutationIssue,
  clearDirtyMutation,
  hydrateDirtyMutationsFromQueue,
  getOptimisticSessions,
  getDirtyMutations,
  clearAllDirtyMutations,
  resetMutationVersion,
  sessionsEqual,
} from './mutation-state';
import {
  SyncRequestError,
  classifySyncOperationIssue,
  processSingleQueueOperation,
  parseRetryAfterMs,
} from './storage-queue';

const STORAGE_KEY_BASE = 'matmetrics_sessions';
const SYNC_LOCK_KEY_BASE = 'matmetrics_sync_lock';
const DEFAULT_SYNC_LOCK_TTL_MS = 45_000;
const MIN_SYNC_LOCK_TTL_MS = 1_000;
const DEFAULT_SYNC_LOCK_HEARTBEAT_MS = 5_000;
const MIN_SYNC_LOCK_HEARTBEAT_MS = 1_000;
const DEFAULT_GITHUB_REFRESH_COOLDOWN_MS = 30_000;
const DEFAULT_GITHUB_REFRESH_DEBOUNCE_MS = 750;

function parseSyncLeaseTimingMs(
  value: string | undefined,
  fallback: number,
  min: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

let syncLockTtlMs = parseSyncLeaseTimingMs(
  process.env.NEXT_PUBLIC_SYNC_LOCK_TTL_MS,
  DEFAULT_SYNC_LOCK_TTL_MS,
  MIN_SYNC_LOCK_TTL_MS
);
let syncLockHeartbeatMs = parseSyncLeaseTimingMs(
  process.env.NEXT_PUBLIC_SYNC_LOCK_HEARTBEAT_MS,
  Math.min(
    DEFAULT_SYNC_LOCK_HEARTBEAT_MS,
    Math.max(MIN_SYNC_LOCK_HEARTBEAT_MS, Math.floor(syncLockTtlMs / 3))
  ),
  MIN_SYNC_LOCK_HEARTBEAT_MS
);
let gitHubRefreshCooldownMs = parseSyncLeaseTimingMs(
  process.env.NEXT_PUBLIC_GITHUB_REFRESH_COOLDOWN_MS,
  DEFAULT_GITHUB_REFRESH_COOLDOWN_MS,
  0
);
let gitHubRefreshDebounceMs = parseSyncLeaseTimingMs(
  process.env.NEXT_PUBLIC_GITHUB_REFRESH_DEBOUNCE_MS,
  DEFAULT_GITHUB_REFRESH_DEBOUNCE_MS,
  0
);

function getSessionsStorageKey(): string {
  return getScopedStorageKey(STORAGE_KEY_BASE);
}

function getSyncLockStorageKey(): string {
  return getScopedStorageKey(SYNC_LOCK_KEY_BASE);
}

function isStorageEventForKey(event: StorageEvent, key: string): boolean {
  return event.storageArea === localStorage && event.key === key;
}

// Internal state
let sessionCache: SessionSnapshot[] | null = null;
let sessionFileIssuesCache: SessionFileIssue[] = [];
let isOnline = typeof window !== 'undefined' ? navigator.onLine : true;
let isSyncing = false;
let inFlightSync: Promise<void> | null = null;
let listenersInitialized = false;
let refreshSeq = 0;
let latestAppliedSeq = 0;
let inFlightRefresh: Promise<void> | null = null;
let inFlightRefreshForce = false;
let queuedForcedRefresh = false;
let scheduledRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledRefreshAt = 0;
let scheduledRefreshForce = false;
interface SessionListRefreshMetadata {
  lastSuccessfulRemoteRefreshAt: number;
  etag: string | null;
}

const sessionListRefreshMetadata = new Map<
  string,
  SessionListRefreshMetadata
>();
let storageGeneration = 0;
const syncOwnerId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `sync-owner-${Math.random().toString(36).slice(2)}`;

type AuthenticatedUserIdResolver = () => string | null;
type PreferenceReader = () => UserPreferences;
type GitHubSettingsSaver = (
  uid: string,
  gitHub: GitHubSettings
) => Promise<void>;
type SessionRefreshAuthHeaders = () => Promise<HeadersInit>;

export type SessionListRefreshError = {
  status?: number;
};

class MissingSessionRefreshAuthError extends Error {
  constructor() {
    super('Authenticated session refresh requires a bearer token');
    this.name = 'MissingSessionRefreshAuthError';
  }
}

let resolveAuthenticatedUserId: AuthenticatedUserIdResolver = () => {
  return isGuestMode() ? null : getActiveUserId();
};

let readPreferences: PreferenceReader = () => getCurrentPreferences();
let persistGitHubSettingsPreference: GitHubSettingsSaver =
  saveGitHubSettingsPreference;
let getSessionRefreshAuthHeaders: SessionRefreshAuthHeaders = getAuthHeaders;
let sessionListRefreshError: SessionListRefreshError | null = null;

function emitLeaseTakeoverDiagnostic(
  payload: LeaseTakeoverDiagnosticPayload
): void {
  console.info('sync_lease_takeover', {
    event: 'sync_lease_takeover',
    at: new Date().toISOString(),
    ...payload,
  });
}

function commitLocalSessions(sessions: SessionSnapshot[]): void {
  sessionCache = sessions;
  updateLocalStorageCache(sessions);
}

function clearScheduledRefresh(): void {
  if (scheduledRefreshTimer) {
    clearTimeout(scheduledRefreshTimer);
    scheduledRefreshTimer = null;
  }
  scheduledRefreshAt = 0;
  scheduledRefreshForce = false;
}

function nextStorageGeneration(): number {
  storageGeneration += 1;
  return storageGeneration;
}

function isStorageGenerationCurrent(generation: number): boolean {
  return generation === storageGeneration;
}

function shouldThrottleGitHubRefresh(): boolean {
  return !!getGitHubConfig() && isGitHubEnabled();
}

function getSessionListContextKey(): string {
  const config = isGitHubEnabled() ? getGitHubConfig() : null;
  const source = config
    ? {
        type: 'github',
        owner: config.owner.trim().toLowerCase(),
        repo: config.repo.trim().toLowerCase(),
        branch: config.branch?.trim() || '',
      }
    : { type: 'local' };

  return JSON.stringify([getActiveUserId().trim(), source]);
}

function isSessionListContextCurrent(
  contextKey: string,
  userId: string
): boolean {
  return (
    getActiveUserId() === userId &&
    getSessionListContextKey() === contextKey
  );
}

function getSessionListRefreshSource(): 'github' | 'local' {
  return shouldThrottleGitHubRefresh() ? 'github' : 'local';
}

function getDiagnosticRequestId(response: Response): string | undefined {
  const requestId =
    response.headers.get('x-vercel-id') ??
    response.headers.get('x-request-id');
  return requestId && /^[a-zA-Z0-9:._-]{1,128}$/.test(requestId)
    ? requestId
    : undefined;
}

function getSessionListRefreshMetadata(
  contextKey = getSessionListContextKey()
): SessionListRefreshMetadata {
  return (
    sessionListRefreshMetadata.get(contextKey) ?? {
      lastSuccessfulRemoteRefreshAt: 0,
      etag: null,
    }
  );
}

function hasFreshRemoteRefresh(): boolean {
  if (!shouldThrottleGitHubRefresh()) {
    return false;
  }

  return (
    Date.now() -
      getSessionListRefreshMetadata().lastSuccessfulRemoteRefreshAt <
    gitHubRefreshCooldownMs
  );
}

function scheduleRefresh(options?: {
  force?: boolean;
  immediate?: boolean;
}): void {
  if (typeof window === 'undefined' || !isOnline || isGuestMode()) {
    return;
  }

  const force = options?.force === true;
  const immediate = options?.immediate === true;
  const shouldThrottle = shouldThrottleGitHubRefresh() && !force;

  const lastSuccessfulRemoteRefreshAt = getSessionListRefreshMetadata()
    .lastSuccessfulRemoteRefreshAt;
  const cooldownRemainingMs = shouldThrottle
    ? Math.max(
        0,
        lastSuccessfulRemoteRefreshAt + gitHubRefreshCooldownMs - Date.now()
      )
    : 0;
  const delayMs = immediate
    ? cooldownRemainingMs
    : Math.max(
        shouldThrottle ? gitHubRefreshDebounceMs : 0,
        cooldownRemainingMs
      );
  const nextRefreshAt = Date.now() + delayMs;

  if (scheduledRefreshTimer) {
    const existingIsStronger =
      scheduledRefreshAt <= nextRefreshAt && (scheduledRefreshForce || !force);
    if (existingIsStronger) {
      return;
    }

    clearScheduledRefresh();
  }

  scheduledRefreshAt = nextRefreshAt;
  scheduledRefreshForce = force;
  scheduledRefreshTimer = setTimeout(() => {
    clearScheduledRefresh();
    void refreshSessionsFromAPI({ force });
  }, delayMs);
}

function dispatchStorageSync(sessions: JudoSession[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('storageSync', {
      detail: { sessions, sessionFileIssues: sessionFileIssuesCache },
    })
  );
}

export function getSessionListRefreshError(): SessionListRefreshError | null {
  return sessionListRefreshError;
}

async function syncRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.ok) {
    return response;
  }

  const retryable =
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500;
  const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));

  throw new SyncRequestError(
    `Request failed with status ${response.status}`,
    retryable,
    retryAfterMs,
    response.status
  );
}

async function parseMutationSession(response: Response): Promise<SessionSnapshot> {
  const sessions = normalizeSessionList([await response.json()]);
  if (sessions.length !== 1) {
    throw new Error('Mutation response did not contain a valid session');
  }
  return sessions[0];
}

function reconcileSuccessfulSession(
  serverSession: SessionSnapshot,
  version: number
): void {
  const dirty = getDirtyMutations().get(serverSession.id);
  const current = sessionCache ?? getLocalStorageCache();
  const reconciled = current.map((cachedSession) => {
    if (cachedSession.id !== serverSession.id) {
      return cachedSession;
    }
    if (dirty && dirty.version !== version) {
      return {
        ...cachedSession,
        ...(serverSession.revisionSha
          ? { revisionSha: serverSession.revisionSha }
          : {}),
      };
    }
    return serverSession;
  });
  commitLocalSessions(reconciled);
  dispatchStorageSync(reconciled);
}

async function reconcilePermanentFailure(
  operation: SyncOperation,
  issue: SyncOperationIssue
): Promise<void> {
  if (operation.type === 'DELETE') {
    markDirtyMutationIssue(operation.id, operation.queuedAt, issue);
    if (!operation.session && isOnline && !isGuestMode()) {
      await refreshSessionsFromAPI({ force: true });
      return;
    }
    const current = sessionCache ?? getLocalStorageCache();
    const restored = operation.session &&
      !current.some((session) => session.id === operation.id)
      ? [operation.session, ...current]
      : current;
    const optimistic = getOptimisticSessions(restored);
    commitLocalSessions(optimistic);
    dispatchStorageSync(optimistic);
    return;
  }

  if (isOnline && !isGuestMode()) {
    await refreshSessionsFromAPI({ force: true });
    return;
  }

  const reconciled = getOptimisticSessions(getLocalStorageCache());
  commitLocalSessions(reconciled);
  dispatchStorageSync(reconciled);
}

function handleMutationSyncFailure(
  error: unknown,
  operation: SyncOperation,
  mutationId: string,
  version: number,
  previousSessions: SessionSnapshot[]
): Promise<MutationResult> {
  console.error('Error syncing mutation', error);
  const issue = classifySyncOperationIssue(error);
  const failedOperation = issue ? { ...operation, syncIssue: issue } : operation;

  return queueOperation(failedOperation)
    .then(async () => {
      if (issue) {
        markDirtyMutationIssue(mutationId, version, issue);
        if (operation.type === 'DELETE') {
          await reconcilePermanentFailure(failedOperation, issue);
        }
        throw error;
      }
      return { status: 'queued' as const };
    })
    .catch((queueError: unknown) => {
      if (queueError === error) throw error;
      clearDirtyMutation(mutationId, version);
      commitLocalSessions(previousSessions);
      dispatchStorageSync(previousSessions);
      throw queueError;
    });
}

async function persistOfflineMutation(
  operation: SyncOperation,
  mutationId: string,
  version: number,
  previousSessions: SessionSnapshot[]
): Promise<void> {
  try {
    await queueOperation(operation);
  } catch (error) {
    clearDirtyMutation(mutationId, version);
    commitLocalSessions(previousSessions);
    dispatchStorageSync(previousSessions);
    throw error;
  }
}

/**
 * Initialize storage: set up online/offline listeners and attempt migration
 */
export function initializeStorage(): void {
  if (typeof window === 'undefined') return;

  // Increment generation to invalidate any in‑flight refreshes from a prior auth/config context
  const generation = nextStorageGeneration();
  clearScheduledRefresh();
  inFlightRefresh = null;
  inFlightRefreshForce = false;
  queuedForcedRefresh = false;

  sessionCache = null;
  sessionListRefreshError = null;
  isSyncing = false;
  hydrateDirtyMutationsFromQueue();
  commitLocalSessions(getOptimisticSessions(getLocalStorageCache()));

  if (isGuestMode()) {
    ensureGuestWorkspaceSeeded();
  }

  // Set up online/offline detection exactly once
  if (!listenersInitialized) {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorageEvent);
    listenersInitialized = true;
  }

  // Try to sync if we have pending operations
  if (!isGuestMode() && isOnline) {
    void resumeAuthenticationBlockedOperations().then(() => {
      for (const operation of getQueue()) {
        if (operation.syncIssue) continue;
        const id = operation.type === 'DELETE' ? operation.id : operation.session.id;
        clearAuthenticationMutationIssue(id, operation.queuedAt);
      }
      const optimisticSessions = getOptimisticSessions(getLocalStorageCache());
      commitLocalSessions(optimisticSessions);
      dispatchStorageSync(optimisticSessions);
      if (isStorageGenerationCurrent(generation) && hasPendingOperations()) {
        return syncPendingOperations();
      }
      if (isStorageGenerationCurrent(generation) && shouldThrottleGitHubRefresh()) {
        scheduleRefresh({ immediate: true });
      }
    });
    return;
  }

  if (shouldThrottleGitHubRefresh()) {
    scheduleRefresh({ immediate: true });
  }
}

/**
 * Optional teardown for tests or unmount flows.
 */
export function teardownStorageListeners(): void {
  clearScheduledRefresh();

  if (typeof window === 'undefined' || !listenersInitialized) return;

  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('storage', handleStorageEvent);
  listenersInitialized = false;
}

/**
 * Get all sessions from API (online) or cache (offline)
 */
export function getSessions(): SessionSnapshot[] {
  if (typeof window === 'undefined') return [];
  const guestMode = isGuestMode();

  // If cache is populated, return it (even if online, we'll refresh in the background)
  if (sessionCache !== null) {
    if (isOnline && !guestMode && !shouldThrottleGitHubRefresh()) {
      void refreshSessionsFromAPI();
    }
    return sessionCache;
  }

  // Guests always use local data only.
  if (!isOnline || guestMode) {
    const cached = getLocalStorageCache();
    sessionCache = cached;
    return cached;
  }

  // Online and no cache: fetch from API synchronously isn't possible here
  // So load from cache if available, otherwise return empty and let the async refresh happen
  const cached = getLocalStorageCache();
  sessionCache = cached;

  if (shouldThrottleGitHubRefresh()) {
    if (!hasFreshRemoteRefresh()) {
      scheduleRefresh({ immediate: true });
    }
  } else {
    void refreshSessionsFromAPI();
  }

  return cached;
}

export function getSessionFileIssues(): SessionFileIssue[] {
  return [...sessionFileIssuesCache];
}

/**
 * Save a new session (online -> API, offline -> queue + cache)
 */
export async function saveSession(
  session: SessionSnapshot
): Promise<MutationResult> {
  if (typeof window === 'undefined') return { status: 'synced' };
  const guestMode = isGuestMode();
  const { keikoRevision: _keikoRevision, ...sessionToCreate } = session;
  const previousSessions = getOptimisticSessions(
    sessionCache ?? getLocalStorageCache()
  );
  const version = markDirtyMutation({ type: 'CREATE', session: sessionToCreate });

  // Update local cache immediately
  const nextSessions = getOptimisticSessions(previousSessions);
  commitLocalSessions(nextSessions);
  if (guestMode) {
    markGuestWorkspaceCustom();
    clearDirtyMutation(session.id, version);
    return { status: 'synced' };
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = { ...sessionToCreate };
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await syncRequest('/api/sessions/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
      const serverSession = await parseMutationSession(response);
      reconcileSuccessfulSession(serverSession, version);
      clearDirtyMutation(session.id, version);
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        { type: 'CREATE', session: sessionToCreate, queuedAt: version },
        session.id,
        version,
        previousSessions
      );
    }

    if (shouldThrottleGitHubRefresh()) {
      scheduleRefresh();
    } else {
      void refreshSessionsFromAPI();
    }
    return { status: 'synced' };
  }

  // Offline: queue the operation
  await persistOfflineMutation(
    { type: 'CREATE', session: sessionToCreate, queuedAt: version },
    session.id,
    version,
    previousSessions
  );
  return { status: 'queued' };
}

/**
 * Update an existing session (online -> API, offline -> queue + cache)
 */
export async function updateSession(
  session: SessionSnapshot
): Promise<MutationResult> {
  if (typeof window === 'undefined') return { status: 'synced' };
  const guestMode = isGuestMode();
  const previousSessions = getOptimisticSessions(
    sessionCache ?? getLocalStorageCache()
  );
  const previousSession = previousSessions.find(
    (cachedSession) => cachedSession.id === session.id
  );
  const version = markDirtyMutation({ type: 'UPDATE', session });

  // Update local cache immediately
  const base = getOptimisticSessions(previousSessions);
  const hasMatch = base.some((s) => s.id === session.id);
  const updated = hasMatch
    ? base.map((s) => (s.id === session.id ? session : s))
    : base;

  if (!hasMatch) {
    console.warn(
      `Session ${session.id} not found in cache. Skipping local update.`
    );
  }

  commitLocalSessions(updated);
  if (guestMode) {
    markGuestWorkspaceCustom();
    clearDirtyMutation(session.id, version);
    return { status: 'synced' };
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const { keikoRevision: _keikoRevision, ...sessionToUpdate } = session;
    const requestBody: any = { ...sessionToUpdate };
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    try {
      const headers = new Headers(await getAuthHeaders({
        'Content-Type': 'application/json',
      }));
      const ifMatch = keikoIfMatch(session.keikoRevision);
      if (ifMatch) headers.set('If-Match', ifMatch);
      const response = await syncRequest(`/api/sessions/${session.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(requestBody),
      });
      const serverSession = await parseMutationSession(response);
      reconcileSuccessfulSession(serverSession, version);
      clearDirtyMutation(session.id, version);
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        {
          type: 'UPDATE',
          session,
          ...(previousSession ? { previousSession } : {}),
          expectedRevision: session.keikoRevision,
          queuedAt: version,
        },
        session.id,
        version,
        previousSessions
      );
    }

    if (shouldThrottleGitHubRefresh()) {
      scheduleRefresh();
    } else {
      void refreshSessionsFromAPI();
    }
    return { status: 'synced' };
  }

  // Offline: queue the operation
  await persistOfflineMutation(
    {
      type: 'UPDATE',
      session,
      ...(previousSession ? { previousSession } : {}),
      expectedRevision: session.keikoRevision,
      queuedAt: version,
    },
    session.id,
    version,
    previousSessions
  );
  return { status: 'queued' };
}

/**
 * Delete a session (online -> API, offline -> queue + cache)
 */
export async function deleteSession(
  id: string,
  expectedKeikoRevision?: number
): Promise<MutationResult> {
  if (typeof window === 'undefined') return { status: 'synced' };
  const guestMode = isGuestMode();
  const cachedSessions = sessionCache ?? getLocalStorageCache();
  const previousSessions = getOptimisticSessions(cachedSessions);
  const previousSession = previousSessions.find((session) => session.id === id);
  const version = markDirtyMutation({
    type: 'DELETE',
    id,
    ...(previousSession ? { session: previousSession } : {}),
  });

  // Update local cache immediately
  const base = getOptimisticSessions(previousSessions);
  const revisionSha = previousSession?.revisionSha;
  const keikoRevision =
    expectedKeikoRevision ??
    (previousSession as SessionSnapshot | undefined)?.keikoRevision;
  const filtered = base.filter((s) => s.id !== id);
  commitLocalSessions(filtered);
  if (guestMode) {
    markGuestWorkspaceCustom();
    clearDirtyMutation(id, version);
    return { status: 'synced' };
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = {};
    if (revisionSha) {
      requestBody.revisionSha = revisionSha;
    }
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    try {
      const headers = new Headers(await getAuthHeaders({
        'Content-Type': 'application/json',
      }));
      const ifMatch = keikoIfMatch(keikoRevision);
      if (ifMatch) headers.set('If-Match', ifMatch);
      await syncRequest(`/api/sessions/${id}`, {
        method: 'DELETE',
        headers,
        body:
          Object.keys(requestBody).length > 0
            ? JSON.stringify(requestBody)
            : undefined,
      });
      clearDirtyMutation(id, version);
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        {
            type: 'DELETE',
            id,
            ...(previousSession ? { session: previousSession } : {}),
            revisionSha,
            expectedRevision: keikoRevision,
            queuedAt: version,
          },
        id,
        version,
        previousSessions
      );
    }

    if (shouldThrottleGitHubRefresh()) {
      scheduleRefresh();
    } else {
      void refreshSessionsFromAPI();
    }
    return { status: 'synced' };
  }

  // Offline: queue the operation
  await persistOfflineMutation(
    {
      type: 'DELETE',
      id,
      ...(previousSession ? { session: previousSession } : {}),
      revisionSha,
      expectedRevision: keikoRevision,
      queuedAt: version,
    },
    id,
    version,
    previousSessions
  );
  return { status: 'queued' };
}

// AI Transformer Prompt Persistence
export function getTransformerPrompt(): string {
  return (
    getCurrentPreferences().transformerPrompt || DEFAULT_TRANSFORMER_PROMPT
  );
}

// GitHub Settings Persistence
function getGitHubSettings(): GitHubSettings {
  return readPreferences().gitHub ?? { ...DEFAULT_GITHUB_SETTINGS };
}

function getGitHubConfig(): GitHubConfig | null {
  const settings = getGitHubSettings();
  return settings.config || null;
}

function isGitHubEnabled(): boolean {
  return getGitHubSettings().enabled;
}

export function setGitHubSyncStatus(
  status: 'idle' | 'syncing' | 'success' | 'error'
): void {
  const uid = resolveAuthenticatedUserId();
  if (!uid) {
    console.warn(
      'setGitHubSyncStatus skipped: no authenticated user available'
    );
    return;
  }

  const settings = getGitHubSettings();
  const nextSettings: GitHubSettings = {
    ...settings,
    syncStatus: status,
    lastSyncTime: new Date().toISOString(),
  };

  void persistGitHubSettingsPreference(uid, nextSettings).catch((error) => {
    console.error('Failed to persist GitHub sync status preference', error);
  });
}

export function getGitHubSyncStatus():
  'idle' | 'syncing' | 'success' | 'error' {
  return getGitHubSettings().syncStatus;
}

export function clearAllData(): void {
  if (typeof window === 'undefined') return;
  nextStorageGeneration();
  clearScheduledRefresh();
  updateLocalStorageCache([]);
  localStorage.removeItem(getSyncQueueStorageKey());
  localStorage.removeItem(getSyncLockStorageKey());
  sessionCache = [];
  clearAllDirtyMutations();
  dispatchStorageSync([]);
}

/**
 * Get sync status for UI indicator
 */
export function getSyncStatus(): {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  authenticationBlockedCount: number;
  rejectedCount: number;
  storageUnavailable: boolean;
} {
  if (isGuestMode()) {
    return {
      isOnline,
      isSyncing: false,
      pendingCount: 0,
      conflictCount: 0,
      authenticationBlockedCount: 0,
      rejectedCount: 0,
      storageUnavailable: false,
    };
  }

  return {
    isOnline,
    isSyncing,
    pendingCount: getPendingOperationCount(),
    conflictCount: getConflictOperationCount(),
    authenticationBlockedCount: getAuthenticationBlockedOperationCount(),
    rejectedCount: getRejectedOperationCount(),
    storageUnavailable: getSyncQueueStorageError() !== null,
  };
}

export function getMutationRecoveryQueue(): SyncOperation[] {
  return getQueue();
}

async function refreshSessionListBeforeLegacyDeleteDiscard(): Promise<void> {
  if (!isOnline || isGuestMode()) {
    throw new Error(
      'This older failed delete has no saved session snapshot. Reconnect and refresh sessions before discarding it; the operation remains in Recovery.'
    );
  }

  const generation = storageGeneration;
  const userId = getActiveUserId();
  const contextKey = getSessionListContextKey();

  await refreshSessionsFromAPI({ force: true });
  while (inFlightRefresh) {
    const refresh = inFlightRefresh;
    await refresh;
  }

  if (
    !isStorageGenerationCurrent(generation) ||
    getActiveUserId() !== userId ||
    getSessionListContextKey() !== contextKey
  ) {
    throw new Error(
      'The active account or session source changed. This recovery operation was kept.'
    );
  }
  if (!isOnline) {
    throw new Error(
      'MatMetrics went offline before sessions could be refreshed, so this older failed delete was kept in Recovery.'
    );
  }
  if (sessionListRefreshError) {
    throw new Error(
      'MatMetrics could not refresh sessions, so this older failed delete was kept in Recovery. Try again when signed in and online.'
    );
  }
}

export async function discardFailedMutation(
  operation: SyncOperation
): Promise<void> {
  if (!operation.syncIssue) {
    throw new Error('Only failed mutations can be discarded from recovery.');
  }

  if (
    operation.type === 'DELETE' &&
    !operation.session &&
    operation.syncIssue.status !== 404
  ) {
    await refreshSessionListBeforeLegacyDeleteDiscard();
  }

  await removeOperationByIdentity(operation);
  const sessionId = operation.type === 'DELETE' ? operation.id : operation.session.id;
  const dirtyMutation = getDirtyMutations().get(sessionId);
  if (dirtyMutation?.version === operation.queuedAt) {
    clearDirtyMutation(sessionId, operation.queuedAt);
    const current = sessionCache ?? getLocalStorageCache();
    let reconciled = current;

    if (operation.type === 'CREATE') {
      reconciled = current.filter((session) => session.id !== operation.session.id);
    } else if (operation.type === 'UPDATE' && operation.previousSession) {
      reconciled = current.some((session) => session.id === sessionId)
        ? current.map((session) =>
            session.id === sessionId ? operation.previousSession! : session
          )
        : [operation.previousSession, ...current];
    } else if (operation.type === 'DELETE') {
      reconciled = operation.syncIssue.status === 404
        ? current.filter((session) => session.id !== sessionId)
        : operation.session && !current.some((session) => session.id === sessionId)
          ? [operation.session, ...current]
          : current;
    }

    const optimistic = getOptimisticSessions(reconciled);
    commitLocalSessions(optimistic);
    dispatchStorageSync(optimistic);
  }

  if (isOnline && !isGuestMode()) {
    await refreshSessionsFromAPI({ force: true });
  }
}

export function retryCloudSync(): void {
  if (typeof window === 'undefined') return;
  void syncPendingOperations();
}

// ============================================================================
// Private helper functions
// ============================================================================

function getLocalStorageCache(): SessionSnapshot[] {
  try {
    const stored = localStorage.getItem(getSessionsStorageKey());
    return stored ? normalizeSessionList(JSON.parse(stored)) : [];
  } catch (e) {
    console.error('Failed to parse localStorage cache', e);
    return [];
  }
}

function updateLocalStorageCache(sessions: JudoSession[]): void {
  try {
    localStorage.setItem(getSessionsStorageKey(), JSON.stringify(sessions));
  } catch (e) {
    console.error('Failed to update localStorage cache', e);
  }
}

function handleOnline(): void {
  isOnline = true;

  if (isGuestMode()) {
    return;
  }

  // Sync pending operations when coming back online.
  // The sync flow already refreshes sessions after queue flush.
  if (hasPendingOperations()) {
    void syncPendingOperations();
    return;
  }

  if (shouldThrottleGitHubRefresh()) {
    scheduleRefresh();
  } else {
    void refreshSessionsFromAPI();
  }
}

function handleOffline(): void {
  isOnline = false;
}

function handleStorageEvent(event: StorageEvent): void {
  if (typeof window === 'undefined') return;

  if (isStorageEventForKey(event, getSessionsStorageKey())) {
    const latestSessions = getLocalStorageCache();
    const optimisticSessions = getOptimisticSessions(latestSessions);
    commitLocalSessions(optimisticSessions);
    dispatchStorageSync(optimisticSessions);
    return;
  }

  if (
    isStorageEventForKey(event, getSyncQueueStorageKey()) &&
    !isGuestMode() &&
    isOnline &&
    hasPendingOperations()
  ) {
    void syncPendingOperations();
  }
}

/**
 * Build the URL for fetching sessions from the API.
 * Includes GitHub configuration parameters if enabled.
 */
function buildSessionListUrl(
  gitHubConfig: ReturnType<typeof getGitHubConfig>,
  force: boolean
): URL {
  const url = new URL('/api/sessions/list', window.location.origin);
  if (gitHubConfig && isGitHubEnabled()) {
    url.searchParams.set('owner', gitHubConfig.owner);
    url.searchParams.set('repo', gitHubConfig.repo);
    if (gitHubConfig.branch) {
      url.searchParams.set('branch', gitHubConfig.branch);
    }
    if (force) {
      url.searchParams.set('force', '1');
    }
  }
  return url;
}

/**
 * Parse the API response and extract sessions and issues.
 */
function parseSessionListResponse(payload: unknown): {
  sessions: SessionSnapshot[];
  issues: SessionFileIssue[];
} {
  const sessions = normalizeSessionList(
    Array.isArray(payload)
      ? payload
      : Array.isArray((payload as any)?.sessions)
        ? (payload as any).sessions
        : []
  );
  const issues: SessionFileIssue[] = Array.isArray((payload as any)?.issues)
    ? (payload as any).issues
    : [];
  return { sessions, issues };
}

/**
 * Reconcile dirty mutations against remote sessions.
 * Clears mutations that have been applied upstream.
 */
function reconcileDirtyMutations(sessions: SessionSnapshot[]): void {
  for (const [id, mutation] of getDirtyMutations().entries()) {
    if (mutation.type === 'DELETE') {
      if (!sessions.some((session) => session.id === id)) {
        clearDirtyMutation(id);
      }
      continue;
    }

    const remoteSession = sessions.find((session) => session.id === id);
    if (remoteSession && sessionsEqual(remoteSession, mutation.session)) {
      clearDirtyMutation(id);
    }
  }
}

type SessionListRefreshContext = {
  requestUserId: string;
  contextKey: string;
  generation: number;
  seq: number;
  source: 'github' | 'local';
  force: boolean;
  startedAt: number;
  stage: 'auth_headers' | 'request' | 'parse_response';
};

function isSessionListRefreshCurrent(
  context: SessionListRefreshContext
): boolean {
  if (!isStorageGenerationCurrent(context.generation)) {
    console.debug('session_list_refresh_discarded', {
      event: 'session_list_refresh_discarded',
      requestSeq: context.seq,
      reason: 'storage_generation_changed',
    });
    return false;
  }
  if (!isSessionListContextCurrent(context.contextKey, context.requestUserId)) {
    console.debug('session_list_refresh_discarded', {
      event: 'session_list_refresh_discarded',
      requestSeq: context.seq,
      reason: 'session_context_changed',
    });
    return false;
  }
  return true;
}

function logSessionRefreshStarted(context: SessionListRefreshContext): void {
  console.debug('session_list_refresh_started', {
    event: 'session_list_refresh_started',
    requestSeq: context.seq,
    source: context.source,
    force: context.force,
  });
}

async function requestSessionList(
  context: SessionListRefreshContext
): Promise<{ response: Response; metadata: SessionListRefreshMetadata } | null> {
  const metadata = getSessionListRefreshMetadata(context.contextKey);
  const url = buildSessionListUrl(getGitHubConfig(), context.force);
  const headers = new Headers(await getSessionRefreshAuthHeaders());
  if (!isSessionListRefreshCurrent(context)) return null;
  if (!/^Bearer\s+\S+$/i.test(headers.get('Authorization')?.trim() ?? '')) {
    throw new MissingSessionRefreshAuthError();
  }
  if (!context.force && metadata.etag) {
    headers.set('If-None-Match', metadata.etag);
  }

  context.stage = 'request';
  const response = await fetch(url.toString(), { headers });
  if (!isSessionListRefreshCurrent(context)) return null;
  return { response, metadata };
}

function applyNotModifiedSessionList(
  context: SessionListRefreshContext,
  response: Response,
  metadata: SessionListRefreshMetadata
): void {
  sessionListRefreshError = null;
  sessionListRefreshMetadata.set(context.contextKey, {
    ...metadata,
    lastSuccessfulRemoteRefreshAt: Date.now(),
  });
  if (context.force) {
    console.info('session_list_refresh_completed', {
      event: 'session_list_refresh_completed',
      requestSeq: context.seq,
      source: context.source,
      force: context.force,
      status: response.status,
      durationMs: Date.now() - context.startedAt,
    });
  }
  dispatchStorageSync(sessionCache ?? getLocalStorageCache());
}

function logSessionRefreshHttpFailure(
  context: SessionListRefreshContext,
  response: Response
): void {
  const requestId = getDiagnosticRequestId(response);
  console.warn('session_list_refresh_http_failed', {
    event: 'session_list_refresh_http_failed',
    requestSeq: context.seq,
    source: context.source,
    force: context.force,
    stage: 'response',
    status: response.status,
    durationMs: Date.now() - context.startedAt,
    ...(requestId ? { requestId } : {}),
  });
}

async function applySuccessfulSessionList(
  context: SessionListRefreshContext,
  response: Response,
  metadata: SessionListRefreshMetadata
): Promise<void> {
  context.stage = 'parse_response';
  const payload = await response.json();
  const { sessions, issues } = parseSessionListResponse(payload);
  if (!isSessionListRefreshCurrent(context) || context.seq < latestAppliedSeq) {
    return;
  }

  sessionListRefreshError = null;
  sessionListRefreshMetadata.set(context.contextKey, {
    etag: response.headers.get('ETag') ?? metadata.etag,
    lastSuccessfulRemoteRefreshAt: Date.now(),
  });
  const mergedSessions = getOptimisticSessions(sessions);
  reconcileDirtyMutations(sessions);
  latestAppliedSeq = context.seq;
  sessionFileIssuesCache = issues;
  commitLocalSessions(mergedSessions);
  if (context.force) {
    const requestId = getDiagnosticRequestId(response);
    console.info('session_list_refresh_completed', {
      event: 'session_list_refresh_completed',
      requestSeq: context.seq,
      source: context.source,
      force: context.force,
      status: response.status,
      sessionCount: sessions.length,
      issueCount: issues.length,
      durationMs: Date.now() - context.startedAt,
      ...(requestId ? { requestId } : {}),
    });
  }
  dispatchStorageSync(mergedSessions);
}

async function applySessionListResponse(
  context: SessionListRefreshContext,
  response: Response,
  metadata: SessionListRefreshMetadata
): Promise<void> {
  if (response.status === 304) {
    applyNotModifiedSessionList(context, response, metadata);
    return;
  }
  if (!response.ok) {
    sessionListRefreshError = { status: response.status };
    logSessionRefreshHttpFailure(context, response);
    dispatchStorageSync(sessionCache ?? getLocalStorageCache());
    return;
  }
  await applySuccessfulSessionList(context, response, metadata);
}

async function applySessionListRefresh(
  context: SessionListRefreshContext
): Promise<void> {
  const result = await requestSessionList(context);
  if (result) {
    await applySessionListResponse(context, result.response, result.metadata);
  }
}

function getSessionRefreshFailureReason(
  error: unknown,
  stage: SessionListRefreshContext['stage']
): string {
  if (error instanceof MissingSessionRefreshAuthError) {
    return 'missing_bearer_token';
  }
  if (stage === 'auth_headers') return 'auth_header_generation_failed';
  if (stage === 'request') return 'network_request_failed';
  return 'invalid_response';
}

function handleSessionListRefreshFailure(
  context: SessionListRefreshContext,
  error: unknown
): void {
  if (!isSessionListRefreshCurrent(context)) return;
  sessionListRefreshError = {};
  console.error('session_list_refresh_failed', {
    event: 'session_list_refresh_failed',
    requestSeq: context.seq,
    source: context.source,
    force: context.force,
    stage: context.stage,
    reason: getSessionRefreshFailureReason(error, context.stage),
    errorName: error instanceof Error ? error.name : 'UnknownError',
    durationMs: Date.now() - context.startedAt,
  });
  dispatchStorageSync(sessionCache ?? getLocalStorageCache());
}

function finishSessionListRefresh(context: SessionListRefreshContext): void {
  if (!isStorageGenerationCurrent(context.generation)) return;

  isSyncing = false;
  const shouldRunQueuedForce = queuedForcedRefresh;
  queuedForcedRefresh = false;
  inFlightRefreshForce = false;
  if (isSessionListContextCurrent(context.contextKey, context.requestUserId)) {
    dispatchStorageSync(sessionCache ?? getLocalStorageCache());
  }
  inFlightRefresh = null;

  if (
    shouldRunQueuedForce &&
    isStorageGenerationCurrent(context.generation) &&
    isOnline &&
    !isGuestMode()
  ) {
    void refreshSessionsFromAPI({ force: true });
  }
}

async function executeSessionListRefresh(
  context: SessionListRefreshContext
): Promise<void> {
  try {
    await applySessionListRefresh(context);
  } catch (error) {
    handleSessionListRefreshFailure(context, error);
  } finally {
    finishSessionListRefresh(context);
  }
}

async function refreshSessionsFromAPI(options?: {
  force?: boolean;
}): Promise<void> {
  if (typeof window === 'undefined' || !isOnline || isGuestMode()) return;
  const force = options?.force === true;
  if (inFlightRefresh) {
    if (force && !inFlightRefreshForce) queuedForcedRefresh = true;
    return inFlightRefresh;
  }
  if (!force && shouldThrottleGitHubRefresh() && hasFreshRemoteRefresh()) {
    return;
  }

  const context: SessionListRefreshContext = {
    requestUserId: getActiveUserId(),
    contextKey: getSessionListContextKey(),
    generation: storageGeneration,
    seq: ++refreshSeq,
    source: getSessionListRefreshSource(),
    force,
    startedAt: Date.now(),
    stage: 'auth_headers',
  };
  logSessionRefreshStarted(context);

  // Install an in-flight guard before broadcasting. storageSync listeners read
  // sessions synchronously; without the guard, that read starts another refresh
  // which broadcasts again before its own promise is assigned.
  let resolveRefreshGate: (() => void) | undefined;
  let rejectRefreshGate: ((error: unknown) => void) | undefined;
  const refreshGate = new Promise<void>((resolve, reject) => {
    resolveRefreshGate = resolve;
    rejectRefreshGate = reject;
  });
  inFlightRefresh = refreshGate;
  inFlightRefreshForce = force;
  isSyncing = true;
  dispatchStorageSync(sessionCache ?? getLocalStorageCache());

  const refresh = executeSessionListRefresh(context);
  inFlightRefresh = refresh;
  void refresh.then(resolveRefreshGate, rejectRefreshGate);
  return refresh;
}

/**
 * Prepare and start lease acquisition with heartbeat renewal.
 * Returns cleanup function to call when lease is no longer needed.
 */
async function prepareAndStartLease(generation: number): Promise<{
  acquired: boolean;
  clearHeartbeat: () => void;
}> {
  let leaseHeartbeat: ReturnType<typeof setInterval> | null = null;

  const leaseAcquired = await coreTryAcquireSyncLease();
  if (!leaseAcquired) {
    return { acquired: false, clearHeartbeat: () => {} };
  }

  const heartbeatIntervalMs = Math.min(
    Math.max(MIN_SYNC_LOCK_HEARTBEAT_MS, syncLockHeartbeatMs),
    Math.max(MIN_SYNC_LOCK_HEARTBEAT_MS, Math.floor(syncLockTtlMs / 2))
  );

  leaseHeartbeat = setInterval(() => {
    if (!isStorageGenerationCurrent(generation) || !coreRenewSyncLease()) {
      if (leaseHeartbeat) {
        clearInterval(leaseHeartbeat);
        leaseHeartbeat = null;
      }
    }
  }, heartbeatIntervalMs);

  return {
    acquired: true,
    clearHeartbeat: () => {
      if (leaseHeartbeat) {
        clearInterval(leaseHeartbeat);
      }
    },
  };
}

async function syncPendingOperations(): Promise<void> {
  if (!isOnline || isGuestMode()) return;
  if (inFlightSync) {
    return inFlightSync;
  }

  // Ensure sync-lease module is properly initialized with current timing
  initializeSyncLeaseModule({
    syncOwnerId,
    syncLockTtlMs,
    allowForcedReclaim: false,
    getSyncLockStorageKey,
    isStorageEventForKey,
    emitLeaseTakeoverDiagnostic: emitLeaseTakeoverDiagnostic,
  });

  inFlightSync = (async () => {
    const generation = storageGeneration;
    isSyncing = true;
    let leaseAcquired = false;
    let shouldContinueWithIndependentOperations = false;
    let clearLeaseHeartbeat = () => {};

    try {
      // Acquire lease and setup heartbeat
      const lease = await prepareAndStartLease(generation);
      leaseAcquired = lease.acquired;
      clearLeaseHeartbeat = lease.clearHeartbeat;

      if (!leaseAcquired || !isStorageGenerationCurrent(generation)) {
        return;
      }

      const baseQueue = getQueue();
      const pausedSessionIds = new Set(
        baseQueue
          .filter((operation) => operation.syncIssue)
          .map((operation) =>
            operation.type === 'DELETE' ? operation.id : operation.session.id
          )
      );
      const activeQueueSnapshot = baseQueue.filter((operation) => {
        const sessionId =
          operation.type === 'DELETE' ? operation.id : operation.session.id;
        return !operation.syncIssue && !pausedSessionIds.has(sessionId);
      });
      const inactiveQueue = baseQueue.filter(
        (operation) => !activeQueueSnapshot.includes(operation)
      );
      let queue = activeQueueSnapshot;
      if (queue.length === 0) return;
      const gitHubConfig = getGitHubConfig();
      const gitHubEnabled = isGitHubEnabled();

      // Abort handler: clear heartbeat and update queue on lease loss
      const onAbort = async (remainingOps: SyncOperation[]) => {
        lease.clearHeartbeat();
        if (isStorageGenerationCurrent(generation)) {
          await setQueue([...remainingOps, ...inactiveQueue], baseQueue);
        }
      };

      // Process each operation in the queue
      for (let index = 0; index < queue.length; index += 1) {
        const operation = queue[index];
        const result = await processSingleQueueOperation(
          operation,
          index,
          queue,
          generation,
          gitHubConfig,
          gitHubEnabled,
          onAbort,
          // Injected dependencies for testability
          isStorageGenerationCurrent,
          syncRequest,
          parseMutationSession,
          reconcileSuccessfulSession,
          setQueue,
          getAuthHeaders,
          reconcilePermanentFailure,
          baseQueue
        );

        if (!result.shouldContinue) {
          shouldContinueWithIndependentOperations =
            result.permanentFailure &&
            isStorageGenerationCurrent(generation) &&
            hasPendingOperations();
          return;
        }
        queue = result.queue;
      }

      // All runnable operations succeeded. Keep failed and same-session
      // downstream operations in the queue for explicit recovery.
      if (!isStorageGenerationCurrent(generation)) {
        return;
      }
      await setQueue(inactiveQueue, baseQueue);

      // Refresh sessions from API to ensure cache is up-to-date
      if (!isStorageGenerationCurrent(generation)) {
        return;
      }
      await refreshSessionsFromAPI({ force: true });
    } finally {
      clearLeaseHeartbeat();
      if (leaseAcquired && isStorageGenerationCurrent(generation)) {
        coreReleaseSyncLease();
      }
      if (isStorageGenerationCurrent(generation)) {
        isSyncing = false;
        inFlightSync = null;
      }
      if (
        shouldContinueWithIndependentOperations &&
        isStorageGenerationCurrent(generation) &&
        isOnline &&
        !isGuestMode()
      ) {
        setTimeout(() => {
          if (isStorageGenerationCurrent(generation)) {
            void syncPendingOperations();
          }
        }, 0);
      }
    }
  })();

  return inFlightSync;
}

export function __resetStorageStateForTests(): void {
  storageGeneration += 1;
  sessionCache = null;
  sessionFileIssuesCache = [];
  sessionListRefreshError = null;
  isOnline = typeof window !== 'undefined' ? navigator.onLine : true;
  isSyncing = false;
  inFlightSync = null;
  inFlightRefresh = null;
  inFlightRefreshForce = false;
  queuedForcedRefresh = false;
  clearScheduledRefresh();
  sessionListRefreshMetadata.clear();
  listenersInitialized = false;
  refreshSeq = 0;
  latestAppliedSeq = 0;
  resetMutationVersion();
  clearAllDirtyMutations();
  setActiveSyncLease(null);
  syncLockTtlMs = DEFAULT_SYNC_LOCK_TTL_MS;
  syncLockHeartbeatMs = Math.min(
    DEFAULT_SYNC_LOCK_HEARTBEAT_MS,
    Math.max(MIN_SYNC_LOCK_HEARTBEAT_MS, Math.floor(syncLockTtlMs / 3))
  );

  // Reset sync-lease module timing to defaults
  initializeSyncLeaseModule({
    syncOwnerId,
    syncLockTtlMs,
    allowForcedReclaim: false,
    getSyncLockStorageKey,
    isStorageEventForKey,
  });

  resolveAuthenticatedUserId = () => {
    return isGuestMode() ? null : getActiveUserId();
  };
  readPreferences = () => getCurrentPreferences();
  persistGitHubSettingsPreference = saveGitHubSettingsPreference;
  getSessionRefreshAuthHeaders = getAuthHeaders;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(getSyncLockStorageKey());
  }
}

export function __setStorageDependencyOverridesForTests(overrides: {
  resolveAuthenticatedUserId?: AuthenticatedUserIdResolver;
  readPreferences?: PreferenceReader;
  persistGitHubSettingsPreference?: GitHubSettingsSaver;
  getSessionRefreshAuthHeaders?: SessionRefreshAuthHeaders;
}): void {
  if (overrides.resolveAuthenticatedUserId) {
    resolveAuthenticatedUserId = overrides.resolveAuthenticatedUserId;
  }

  if (overrides.readPreferences) {
    readPreferences = overrides.readPreferences;
  }

  if (overrides.persistGitHubSettingsPreference) {
    persistGitHubSettingsPreference = overrides.persistGitHubSettingsPreference;
  }

  if (overrides.getSessionRefreshAuthHeaders) {
    getSessionRefreshAuthHeaders = overrides.getSessionRefreshAuthHeaders;
  }
}

export function forceRefreshSessionList(): Promise<void> {
  return refreshSessionsFromAPI({ force: true });
}

export async function __tryAcquireSyncLeaseForTests(): Promise<boolean> {
  return coreTryAcquireSyncLease();
}

export function __renewSyncLeaseForTests(): boolean {
  return coreRenewSyncLease();
}

export function __setSyncLeaseTimingForTests(overrides: {
  ttlMs?: number;
  heartbeatMs?: number;
}): void {
  if (typeof overrides.ttlMs === 'number' && Number.isFinite(overrides.ttlMs)) {
    syncLockTtlMs = Math.max(MIN_SYNC_LOCK_TTL_MS, overrides.ttlMs);
  }

  if (
    typeof overrides.heartbeatMs === 'number' &&
    Number.isFinite(overrides.heartbeatMs)
  ) {
    syncLockHeartbeatMs = Math.max(
      MIN_SYNC_LOCK_HEARTBEAT_MS,
      overrides.heartbeatMs
    );
  }

  // Propagate timing overrides to sync-lease module
  initializeSyncLeaseModule({
    syncOwnerId,
    syncLockTtlMs,
    allowForcedReclaim: false,
    getSyncLockStorageKey,
    isStorageEventForKey,
  });
}

export function __setGitHubRefreshTimingForTests(overrides: {
  cooldownMs?: number;
  debounceMs?: number;
}): void {
  if (
    typeof overrides.cooldownMs === 'number' &&
    Number.isFinite(overrides.cooldownMs)
  ) {
    gitHubRefreshCooldownMs = Math.max(0, overrides.cooldownMs);
  }

  if (
    typeof overrides.debounceMs === 'number' &&
    Number.isFinite(overrides.debounceMs)
  ) {
    gitHubRefreshDebounceMs = Math.max(0, overrides.debounceMs);
  }
}
