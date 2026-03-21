'use client';

import {
  JudoSession,
  GitHubConfig,
  GitHubSettings,
  MutationResult,
} from './types';
import {
  queueOperation,
  getQueue,
  clearQueue,
  getPendingOperationCount,
  hasPendingOperations,
  setQueue,
  getSyncQueueStorageKey,
} from './sync-queue';
import { getScopedStorageKey, isGuestMode } from './client-identity';
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
import { getFirebaseAuth } from './firebase-client';
import type { UserPreferences } from './types';
import { createTagService } from './tags/service';

const STORAGE_KEY_BASE = 'matmetrics_sessions';
const SYNC_LOCK_KEY_BASE = 'matmetrics_sync_lock';
const SYNC_LOCK_TTL_MS = 15_000;

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
let sessionCache: JudoSession[] | null = null;
let isOnline = typeof window !== 'undefined' ? navigator.onLine : true;
let isSyncing = false;
let inFlightSync: Promise<void> | null = null;
let listenersInitialized = false;
let refreshSeq = 0;
let latestAppliedSeq = 0;
let mutationVersion = 0;
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

let resolveAuthenticatedUserId: AuthenticatedUserIdResolver = () => {
  try {
    return getFirebaseAuth().currentUser?.uid ?? null;
  } catch (error) {
    console.error(
      'Failed to resolve authenticated user for sync status',
      error
    );
    return null;
  }
};

let readPreferences: PreferenceReader = () => getCurrentPreferences();
let persistGitHubSettingsPreference: GitHubSettingsSaver =
  saveGitHubSettingsPreference;

type DirtyMutation =
  | {
      type: 'CREATE' | 'UPDATE';
      session: JudoSession;
      version: number;
    }
  | {
      type: 'DELETE';
      id: string;
      version: number;
    };

type DirtyMutationInput =
  | {
      type: 'CREATE' | 'UPDATE';
      session: JudoSession;
    }
  | {
      type: 'DELETE';
      id: string;
    };

const dirtyMutations = new Map<string, DirtyMutation>();

type SyncLease = {
  owner: string;
  expiresAt: number;
  nonce: string;
};

const SYNC_LOCK_ACQUIRE_ATTEMPTS = 4;
const SYNC_LOCK_BACKOFF_MIN_MS = 4;
const SYNC_LOCK_BACKOFF_MAX_MS = 16;

class SyncRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

function nextMutationVersion(): number {
  mutationVersion += 1;
  return mutationVersion;
}

function markDirtyMutation(
  mutation: DirtyMutationInput,
  version = nextMutationVersion()
): number {
  const id = mutation.type === 'DELETE' ? mutation.id : mutation.session.id;
  dirtyMutations.set(id, {
    ...mutation,
    version,
  } as DirtyMutation);
  return version;
}

function clearDirtyMutation(id: string, version?: number): void {
  const existing = dirtyMutations.get(id);
  if (!existing) {
    return;
  }

  if (version !== undefined && existing.version !== version) {
    return;
  }

  dirtyMutations.delete(id);
}

function hydrateDirtyMutationsFromQueue(): void {
  dirtyMutations.clear();

  for (const operation of getQueue()) {
    if (operation.type === 'DELETE') {
      markDirtyMutation(
        { type: 'DELETE', id: operation.id },
        operation.queuedAt
      );
      continue;
    }

    markDirtyMutation(
      { type: operation.type, session: operation.session },
      operation.queuedAt
    );
  }
}

function sessionsEqual(left: JudoSession, right: JudoSession): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyOptimisticMutation(
  baseSessions: JudoSession[],
  mutation: DirtyMutation
): JudoSession[] {
  if (mutation.type === 'DELETE') {
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

function getOptimisticSessions(baseSessions: JudoSession[]): JudoSession[] {
  return Array.from(dirtyMutations.values())
    .sort((left, right) => left.version - right.version)
    .reduce(applyOptimisticMutation, baseSessions);
}

function commitLocalSessions(sessions: JudoSession[]): void {
  sessionCache = sessions;
  updateLocalStorageCache(sessions);
}

function readSyncLease(): SyncLease | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(getSyncLockStorageKey());
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<SyncLease>;
    if (
      typeof parsed.owner !== 'string' ||
      !Number.isFinite(parsed.expiresAt) ||
      typeof parsed.nonce !== 'string'
    ) {
      localStorage.removeItem(getSyncLockStorageKey());
      return null;
    }

    return {
      owner: parsed.owner,
      expiresAt: parsed.expiresAt as number,
      nonce: parsed.nonce,
    };
  } catch (error) {
    console.error('Failed to parse sync lease', error);
    localStorage.removeItem(getSyncLockStorageKey());
    return null;
  }
}

function createSyncLeaseNonce(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `sync-lease-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function randomBackoffMs(): number {
  return (
    SYNC_LOCK_BACKOFF_MIN_MS +
    Math.floor(
      Math.random() * (SYNC_LOCK_BACKOFF_MAX_MS - SYNC_LOCK_BACKOFF_MIN_MS + 1)
    )
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryAcquireSyncLease(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  for (let attempt = 0; attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS; attempt += 1) {
    const now = Date.now();
    const existingLease = readSyncLease();
    if (
      existingLease &&
      existingLease.owner !== syncOwnerId &&
      existingLease.expiresAt > now
    ) {
      if (attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS - 1) {
        await sleep(randomBackoffMs());
      }
      continue;
    }

    const nextLease: SyncLease = {
      owner: syncOwnerId,
      expiresAt: now + SYNC_LOCK_TTL_MS,
      nonce: createSyncLeaseNonce(),
    };

    localStorage.setItem(getSyncLockStorageKey(), JSON.stringify(nextLease));

    const confirmedLease = readSyncLease();
    if (
      confirmedLease?.owner === syncOwnerId &&
      confirmedLease.expiresAt === nextLease.expiresAt &&
      confirmedLease.nonce === nextLease.nonce
    ) {
      return true;
    }

    if (attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS - 1) {
      await sleep(randomBackoffMs());
    }
  }

  return false;
}

function renewSyncLease(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const existingLease = readSyncLease();
  if (existingLease?.owner !== syncOwnerId) {
    return false;
  }

  const nextLease: SyncLease = {
    owner: syncOwnerId,
    expiresAt: Date.now() + SYNC_LOCK_TTL_MS,
    nonce: existingLease.nonce,
  };

  localStorage.setItem(getSyncLockStorageKey(), JSON.stringify(nextLease));

  const confirmedLease = readSyncLease();
  return (
    confirmedLease?.owner === syncOwnerId &&
    confirmedLease.expiresAt === nextLease.expiresAt &&
    confirmedLease.nonce === nextLease.nonce
  );
}

function releaseSyncLease(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const existingLease = readSyncLease();
  if (existingLease?.owner === syncOwnerId) {
    localStorage.removeItem(getSyncLockStorageKey());
  }
}

function dispatchStorageSync(sessions: JudoSession[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('storageSync', { detail: { sessions } })
  );
}

async function syncRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.ok) {
    return response;
  }

  throw new SyncRequestError(
    `Request failed with status ${response.status}`,
    response.status >= 500
  );
}

async function reconcilePermanentFailure(): Promise<void> {
  if (isOnline && !isGuestMode()) {
    await refreshSessionsFromAPI();
    return;
  }

  const reconciled = getOptimisticSessions(getLocalStorageCache());
  commitLocalSessions(reconciled);
  dispatchStorageSync(reconciled);
}

function handleMutationSyncFailure(
  error: unknown,
  retryOperation: () => void,
  mutationId: string,
  version: number
): Promise<MutationResult> {
  console.error('Error syncing mutation', error);
  if (error instanceof SyncRequestError && !error.retryable) {
    clearDirtyMutation(mutationId, version);
    return reconcilePermanentFailure().then(() => {
      throw error;
    });
  }

  retryOperation();
  return Promise.resolve({ status: 'queued' });
}

/**
 * Initialize storage: set up online/offline listeners and attempt migration
 */
export function initializeStorage(): void {
  if (typeof window === 'undefined') return;

  sessionCache = null;
  isSyncing = false;
  hydrateDirtyMutationsFromQueue();

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
  if (!isGuestMode() && isOnline && hasPendingOperations()) {
    void syncPendingOperations();
  }
}

/**
 * Optional teardown for tests or unmount flows.
 */
export function teardownStorageListeners(): void {
  if (typeof window === 'undefined' || !listenersInitialized) return;

  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('storage', handleStorageEvent);
  listenersInitialized = false;
}

/**
 * Get all sessions from API (online) or cache (offline)
 */
export function getSessions(): JudoSession[] {
  if (typeof window === 'undefined') return [];
  const guestMode = isGuestMode();

  // If cache is populated, return it (even if online, we'll refresh in the background)
  if (sessionCache !== null) {
    // Refresh from API in the background if online
    if (isOnline && !guestMode) {
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

  // Refresh from API in background
  void refreshSessionsFromAPI();

  return cached;
}

/**
 * Save a new session (online -> API, offline -> queue + cache)
 */
export async function saveSession(
  session: JudoSession
): Promise<MutationResult> {
  if (typeof window === 'undefined') return { status: 'synced' };
  const guestMode = isGuestMode();
  const version = markDirtyMutation({ type: 'CREATE', session });

  // Update local cache immediately
  const nextSessions = getOptimisticSessions(
    sessionCache ?? getLocalStorageCache()
  );
  commitLocalSessions(nextSessions);
  if (guestMode) {
    markGuestWorkspaceCustom();
    return { status: 'synced' };
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = { ...session };
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      await syncRequest('/api/sessions/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        () => queueOperation({ type: 'CREATE', session }),
        session.id,
        version
      );
    }

    void refreshSessionsFromAPI();
    return { status: 'synced' };
  }

  // Offline: queue the operation
  queueOperation({ type: 'CREATE', session });
  return { status: 'queued' };
}

/**
 * Update an existing session (online -> API, offline -> queue + cache)
 */
export async function updateSession(
  session: JudoSession
): Promise<MutationResult> {
  if (typeof window === 'undefined') return { status: 'synced' };
  const guestMode = isGuestMode();
  const version = markDirtyMutation({ type: 'UPDATE', session });

  // Update local cache immediately
  const base = getOptimisticSessions(sessionCache ?? getLocalStorageCache());
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
    return { status: 'synced' };
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = { ...session };
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      await syncRequest(`/api/sessions/${session.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        () => queueOperation({ type: 'UPDATE', session }),
        session.id,
        version
      );
    }

    void refreshSessionsFromAPI();
    return { status: 'synced' };
  }

  // Offline: queue the operation
  queueOperation({ type: 'UPDATE', session });
  return { status: 'queued' };
}

/**
 * Delete a session (online -> API, offline -> queue + cache)
 */
export async function deleteSession(id: string): Promise<MutationResult> {
  if (typeof window === 'undefined') return { status: 'synced' };
  const guestMode = isGuestMode();
  const version = markDirtyMutation({ type: 'DELETE', id });

  // Update local cache immediately
  const base = getOptimisticSessions(sessionCache ?? getLocalStorageCache());
  const filtered = base.filter((s) => s.id !== id);
  commitLocalSessions(filtered);
  if (guestMode) {
    markGuestWorkspaceCustom();
    return { status: 'synced' };
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = {};
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      await syncRequest(`/api/sessions/${id}`, {
        method: 'DELETE',
        headers,
        body:
          Object.keys(requestBody).length > 0
            ? JSON.stringify(requestBody)
            : undefined,
      });
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        () => queueOperation({ type: 'DELETE', id }),
        id,
        version
      );
    }

    void refreshSessionsFromAPI();
    return { status: 'synced' };
  }

  // Offline: queue the operation
  queueOperation({ type: 'DELETE', id });
  return { status: 'queued' };
}

const tagDomainService = createTagService({
  getSessions,
  updateSession,
});

/**
 * @deprecated Use tagService.listTags from src/lib/tags instead.
 */
export function getAllTags(): string[] {
  return tagDomainService.listTags();
}

/**
 * @deprecated Use tagService.renameTag from src/lib/tags instead.
 */
export async function renameTag(
  oldName: string,
  newName: string
): Promise<void> {
  const result = await tagDomainService.renameTag(oldName, newName);
  if (result.conflicts.length > 0) {
    throw new Error(result.conflicts[0].message);
  }
}

/**
 * @deprecated Use tagService.deleteTag from src/lib/tags instead.
 */
export async function deleteTag(tagName: string): Promise<void> {
  const result = await tagDomainService.deleteTag(tagName);
  if (result.conflicts.length > 0) {
    throw new Error(result.conflicts[0].message);
  }
}

/**
 * @deprecated Use tagService.mergeTags from src/lib/tags instead.
 */
export async function mergeTags(
  sourceTag: string,
  targetTag: string
): Promise<void> {
  const result = await tagDomainService.mergeTags(sourceTag, targetTag);
  if (result.conflicts.length > 0) {
    throw new Error(result.conflicts[0].message);
  }
}

// AI Transformer Prompt Persistence
export function getTransformerPrompt(): string {
  return (
    getCurrentPreferences().transformerPrompt || DEFAULT_TRANSFORMER_PROMPT
  );
}

export function saveTransformerPrompt(prompt: string): void {
  void prompt;
  console.warn(
    'saveTransformerPrompt is deprecated. Use the authenticated preference helpers instead.'
  );
}

export function resetTransformerPrompt(): void {
  console.warn(
    'resetTransformerPrompt is deprecated. Use the authenticated preference helpers instead.'
  );
}

// GitHub Settings Persistence
export function getGitHubSettings(): GitHubSettings {
  return readPreferences().gitHub ?? { ...DEFAULT_GITHUB_SETTINGS };
}

export function getGitHubConfig(): GitHubConfig | null {
  const settings = getGitHubSettings();
  return settings.config || null;
}

export function isGitHubEnabled(): boolean {
  return getGitHubSettings().enabled;
}

export function isGitHubMigrationDone(): boolean {
  return getGitHubSettings().migrationDone;
}

export function saveGitHubConfig(config: GitHubConfig): void {
  void config;
  console.warn(
    'saveGitHubConfig is deprecated. Use the authenticated preference helpers instead.'
  );
}

export function enableGitHub(): void {
  console.warn(
    'enableGitHub is deprecated. Use the authenticated preference helpers instead.'
  );
}

export function disableGitHub(): void {
  console.warn(
    'disableGitHub is deprecated. Use the authenticated preference helpers instead.'
  );
}

export function clearGitHubConfig(): void {
  console.warn(
    'clearGitHubConfig is deprecated. Use the authenticated preference helpers instead.'
  );
}

export function setGitHubMigrationDone(): void {
  console.warn(
    'setGitHubMigrationDone is deprecated. Use the authenticated preference helpers instead.'
  );
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
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error' {
  return getGitHubSettings().syncStatus;
}

export function clearAllData(): void {
  if (typeof window === 'undefined') return;
  updateLocalStorageCache([]);
  localStorage.removeItem(getSyncQueueStorageKey());
  localStorage.removeItem(getSyncLockStorageKey());
  sessionCache = [];
  dirtyMutations.clear();
  dispatchStorageSync([]);
}

/**
 * Get sync status for UI indicator
 */
export function getSyncStatus(): {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
} {
  if (isGuestMode()) {
    return {
      isOnline,
      isSyncing: false,
      pendingCount: 0,
    };
  }

  return {
    isOnline,
    isSyncing,
    pendingCount: getPendingOperationCount(),
  };
}

export function retryCloudSync(): void {
  if (typeof window === 'undefined') return;
  void syncPendingOperations();
}

// ============================================================================
// Private helper functions
// ============================================================================

function getLocalStorageCache(): JudoSession[] {
  try {
    const stored = localStorage.getItem(getSessionsStorageKey());
    return stored ? JSON.parse(stored) : [];
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

  // No pending operations, so refresh immediately.
  void refreshSessionsFromAPI();
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

async function refreshSessionsFromAPI(): Promise<void> {
  if (typeof window === 'undefined' || !isOnline || isGuestMode()) return;

  const seq = ++refreshSeq;

  try {
    const gitHubConfig = getGitHubConfig();
    const url = new URL('/api/sessions/list', window.location.origin);
    if (gitHubConfig && isGitHubEnabled()) {
      url.searchParams.set('owner', gitHubConfig.owner);
      url.searchParams.set('repo', gitHubConfig.repo);
      if (gitHubConfig.branch) {
        url.searchParams.set('branch', gitHubConfig.branch);
      }
    }

    const headers = await getAuthHeaders();
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      console.warn(
        `Skipping cache refresh from /api/sessions/list due to non-OK status ${res.status}`
      );
      return;
    }

    const sessions: JudoSession[] = await res.json();
    if (seq < latestAppliedSeq) {
      return;
    }

    const mergedSessions = getOptimisticSessions(sessions);

    for (const [id, mutation] of dirtyMutations.entries()) {
      if (mutation.type === 'DELETE') {
        if (!sessions.some((session) => session.id === id)) {
          dirtyMutations.delete(id);
        }
        continue;
      }

      const remoteSession = sessions.find((session) => session.id === id);
      if (remoteSession && sessionsEqual(remoteSession, mutation.session)) {
        dirtyMutations.delete(id);
      }
    }

    latestAppliedSeq = seq;
    commitLocalSessions(mergedSessions);
    dispatchStorageSync(mergedSessions);
  } catch (error) {
    console.error('Error refreshing sessions from API', error);
  }
}

async function syncPendingOperations(): Promise<void> {
  if (!isOnline || isGuestMode()) return;
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = (async () => {
    isSyncing = true;
    let leaseAcquired = false;

    try {
      leaseAcquired = await tryAcquireSyncLease();
      if (!leaseAcquired) {
        return;
      }

      const queue = getQueue();
      const gitHubConfig = getGitHubConfig();
      const gitHubEnabled = isGitHubEnabled();
      for (const [index, operation] of queue.entries()) {
        if (!renewSyncLease()) {
          const remainingOperations = queue.slice(index);
          setQueue(remainingOperations, queue);
          return;
        }

        try {
          switch (operation.type) {
            case 'CREATE':
              const createBody: any = { ...operation.session };
              if (gitHubConfig && gitHubEnabled) {
                createBody.gitHubConfig = gitHubConfig;
              }
              const createHeaders = await getAuthHeaders({
                'Content-Type': 'application/json',
              });
              await syncRequest('/api/sessions/create', {
                method: 'POST',
                headers: createHeaders,
                body: JSON.stringify(createBody),
              });
              break;

            case 'UPDATE':
              const updateBody: any = { ...operation.session };
              if (gitHubConfig && gitHubEnabled) {
                updateBody.gitHubConfig = gitHubConfig;
              }
              const updateHeaders = await getAuthHeaders({
                'Content-Type': 'application/json',
              });
              await syncRequest(`/api/sessions/${operation.session.id}`, {
                method: 'PUT',
                headers: updateHeaders,
                body: JSON.stringify(updateBody),
              });
              break;

            case 'DELETE':
              const deleteBody: any = {};
              if (gitHubConfig && gitHubEnabled) {
                deleteBody.gitHubConfig = gitHubConfig;
              }
              const deleteHeaders = await getAuthHeaders({
                'Content-Type': 'application/json',
              });
              await syncRequest(`/api/sessions/${operation.id}`, {
                method: 'DELETE',
                headers: deleteHeaders,
                body:
                  Object.keys(deleteBody).length > 0
                    ? JSON.stringify(deleteBody)
                    : undefined,
              });
              break;
          }
        } catch (error) {
          console.error('Error syncing operation', error);
          if (error instanceof SyncRequestError && !error.retryable) {
            clearDirtyMutation(
              operation.type === 'DELETE'
                ? operation.id
                : operation.session.id,
              operation.queuedAt
            );
            const remainingOperations = queue.filter(
              (_, remainingIndex) => remainingIndex !== index
            );
            setQueue(remainingOperations, queue);
            await reconcilePermanentFailure();
            return;
          }

          // Stop syncing on first error; retries must include the failed operation to avoid data loss.
          const remainingOperations = queue.slice(index);
          setQueue(remainingOperations, queue);
          return;
        }
      }

      // If all operations succeeded, clear the queue
      clearQueue(queue);

      // Refresh sessions from API to ensure cache is up-to-date
      await refreshSessionsFromAPI();
    } finally {
      isSyncing = false;
      if (leaseAcquired) {
        releaseSyncLease();
      }
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

export function __resetStorageStateForTests(): void {
  sessionCache = null;
  isOnline = typeof window !== 'undefined' ? navigator.onLine : true;
  isSyncing = false;
  inFlightSync = null;
  listenersInitialized = false;
  refreshSeq = 0;
  latestAppliedSeq = 0;
  mutationVersion = 0;
  dirtyMutations.clear();
  resolveAuthenticatedUserId = () => {
    try {
      return getFirebaseAuth().currentUser?.uid ?? null;
    } catch {
      return null;
    }
  };
  readPreferences = () => getCurrentPreferences();
  persistGitHubSettingsPreference = saveGitHubSettingsPreference;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(getSyncLockStorageKey());
  }
}

export function __setStorageDependencyOverridesForTests(overrides: {
  resolveAuthenticatedUserId?: AuthenticatedUserIdResolver;
  readPreferences?: PreferenceReader;
  persistGitHubSettingsPreference?: GitHubSettingsSaver;
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
}

export async function __tryAcquireSyncLeaseForTests(): Promise<boolean> {
  return tryAcquireSyncLease();
}

export function __renewSyncLeaseForTests(): boolean {
  return renewSyncLease();
}
