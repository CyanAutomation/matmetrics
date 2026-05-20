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
  clearQueue,
  getPendingOperationCount,
  hasPendingOperations,
  setQueue,
  getSyncQueueStorageKey,
  type SyncOperation,
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
import { getFirebaseAuth, isFirebaseConfigured } from './firebase-client';
import type { UserPreferences } from './types';
import { createTagService } from './tags/service';
import { initializeSyncLeaseModule } from './sync-lease';
import {
  markDirtyMutation,
  clearDirtyMutation,
  hydrateDirtyMutationsFromQueue,
  getOptimisticSessions,
  getDirtyMutations,
  clearAllDirtyMutations,
  resetMutationVersion,
  sessionsEqual,
  type DirtyMutation,
  type DirtyMutationInput,
} from './mutation-state';

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
let sessionCache: JudoSession[] | null = null;
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
let lastSuccessfulRemoteRefreshAt = 0;
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

type SyncLease = {
  owner: string;
  expiresAt: number;
  nonce: string;
  epoch: number;
};

const SYNC_LOCK_ACQUIRE_ATTEMPTS = 7;
const SYNC_LOCK_BACKOFF_MIN_MS = 6;
const SYNC_LOCK_BACKOFF_MAX_MS = 28;
const SYNC_LOCK_VERIFY_DELAY_MIN_MS = 1;
const SYNC_LOCK_VERIFY_DELAY_MAX_MS = 6;
const SYNC_LOCK_NAME = 'matmetrics-sync';

type ActiveSyncLease =
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

let activeSyncLease: ActiveSyncLease | null = null;
let localLeaseEpochCounter = 0;

type LeaseTakeoverReason = 'expired' | 'race-revalidate';

function emitLeaseTakeoverDiagnostic(payload: {
  reason: LeaseTakeoverReason;
  attempt: number;
  previousOwner: string | null;
  previousEpoch: number | null;
  previousExpiresAt: number | null;
  nextEpoch: number;
}): void {
  console.info('sync_lease_takeover', {
    event: 'sync_lease_takeover',
    at: new Date().toISOString(),
    ...payload,
  });
}

class SyncRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }

  const retryAt = Date.parse(headerValue);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - Date.now());
}

function commitLocalSessions(sessions: JudoSession[]): void {
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

function hasFreshRemoteRefresh(): boolean {
  if (!shouldThrottleGitHubRefresh()) {
    return false;
  }

  return Date.now() - lastSuccessfulRemoteRefreshAt < gitHubRefreshCooldownMs;
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
      typeof parsed.nonce !== 'string' ||
      !Number.isFinite(parsed.epoch)
    ) {
      localStorage.removeItem(getSyncLockStorageKey());
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

function randomVerifyDelayMs(): number {
  return (
    SYNC_LOCK_VERIFY_DELAY_MIN_MS +
    Math.floor(
      Math.random() *
        (SYNC_LOCK_VERIFY_DELAY_MAX_MS - SYNC_LOCK_VERIFY_DELAY_MIN_MS + 1)
    )
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getNextSyncLeaseEpoch(existingEpoch: number): number {
  const nowEpoch = Date.now();
  const nextEpoch = Math.max(
    existingEpoch + 1,
    localLeaseEpochCounter + 1,
    nowEpoch
  );
  localLeaseEpochCounter = nextEpoch;
  return nextEpoch;
}

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

async function tryAcquireSyncLease(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  if (await tryAcquireNavigatorLock()) {
    return true;
  }

  for (let attempt = 0; attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS; attempt += 1) {
    const now = Date.now();
    const observedLease = readSyncLease();
    const leaseIsOwnedAndAlive =
      observedLease &&
      observedLease.owner !== syncOwnerId &&
      observedLease.expiresAt >= now;
    if (leaseIsOwnedAndAlive) {
      if (attempt < SYNC_LOCK_ACQUIRE_ATTEMPTS - 1) {
        await sleep(randomBackoffMs());
      }
      continue;
    }

    const nextLease: SyncLease = {
      owner: syncOwnerId,
      expiresAt: now + syncLockTtlMs,
      nonce: createSyncLeaseNonce(),
      epoch: getNextSyncLeaseEpoch(observedLease?.epoch ?? 0),
    };
    if (observedLease && observedLease.owner !== syncOwnerId) {
      emitLeaseTakeoverDiagnostic({
        reason:
          observedLease.expiresAt < now
            ? 'expired'
            : 'race-revalidate',
        attempt,
        previousOwner: observedLease.owner,
        previousEpoch: observedLease.epoch,
        previousExpiresAt: observedLease.expiresAt,
        nextEpoch: nextLease.epoch,
      });
    }
    const syncLockStorageKey = getSyncLockStorageKey();
    let overwrittenByStorageEvent = false;
    const onStorage = (event: StorageEvent) => {
      if (!isStorageEventForKey(event, syncLockStorageKey)) {
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
    localStorage.setItem(syncLockStorageKey, JSON.stringify(nextLease));
    await sleep(randomVerifyDelayMs());

    const confirmedLease = readSyncLease();
    window.removeEventListener('storage', onStorage);
    if (
      !overwrittenByStorageEvent &&
      confirmedLease?.owner === syncOwnerId &&
      confirmedLease.expiresAt === nextLease.expiresAt &&
      confirmedLease.nonce === nextLease.nonce &&
      confirmedLease.epoch === nextLease.epoch
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

function renewSyncLease(): boolean {
  if (activeSyncLease?.mode === 'web-lock') {
    return true;
  }

  if (typeof window === 'undefined' || activeSyncLease?.mode !== 'storage') {
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

  localStorage.setItem(getSyncLockStorageKey(), JSON.stringify(nextLease));

  const confirmedLease = readSyncLease();
  return (
    confirmedLease?.owner === activeSyncLease.owner &&
    confirmedLease.expiresAt === nextLease.expiresAt &&
    confirmedLease.nonce === nextLease.nonce &&
    confirmedLease.epoch === nextLease.epoch
  );
}

function hasActiveSyncLeaseOwnership(): boolean {
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

function releaseSyncLease(): void {
  if (activeSyncLease?.mode === 'web-lock') {
    activeSyncLease.release();
    activeSyncLease = null;
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  const existingLease = readSyncLease();
  if (
    activeSyncLease?.mode === 'storage' &&
    existingLease?.owner === activeSyncLease.owner &&
    existingLease.nonce === activeSyncLease.nonce &&
    existingLease.epoch === activeSyncLease.epoch
  ) {
    localStorage.removeItem(getSyncLockStorageKey());
  }
  activeSyncLease = null;
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
    retryAfterMs
  );
}

async function reconcilePermanentFailure(): Promise<void> {
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
  retryOperation: () => void | Promise<void>,
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

  const result = retryOperation();
  if (result instanceof Promise) {
    return result.then(() => ({ status: 'queued' }));
  }
  return Promise.resolve({ status: 'queued' });
}

/**
 * Initialize storage: set up online/offline listeners and attempt migration
 */
export function initializeStorage(): void {
  if (typeof window === 'undefined') return;

  // Increment generation to invalidate any in‑flight refreshes from a prior auth/config context
  nextStorageGeneration();

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
export function getSessions(): JudoSession[] {
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
    clearDirtyMutation(session.id, version);
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
      clearDirtyMutation(session.id, version);
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        () => queueOperation({ type: 'CREATE', session, queuedAt: version }),
        session.id,
        version
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
  await queueOperation({ type: 'CREATE', session, queuedAt: version });
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
    clearDirtyMutation(session.id, version);
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
      clearDirtyMutation(session.id, version);
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        () => queueOperation({ type: 'UPDATE', session, queuedAt: version }),
        session.id,
        version
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
  await queueOperation({ type: 'UPDATE', session, queuedAt: version });
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
    clearDirtyMutation(id, version);
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
      clearDirtyMutation(id, version);
    } catch (error) {
      return handleMutationSyncFailure(
        error,
        () => queueOperation({ type: 'DELETE', id, queuedAt: version }),
        id,
        version
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
  await queueOperation({ type: 'DELETE', id, queuedAt: version });
  return { status: 'queued' };
}

const tagDomainService = createTagService({
  getSessions,
  updateSession,
});

/**
 * @deprecated Use tagService.listTags from src/lib/tags instead.
 */
function getAllTags(): string[] {
  return tagDomainService.listTags();
}

/**
 * @deprecated Use tagService.renameTag from src/lib/tags instead.
 */
async function renameTag(
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
async function deleteTag(tagName: string): Promise<void> {
  const result = await tagDomainService.deleteTag(tagName);
  if (result.conflicts.length > 0) {
    throw new Error(result.conflicts[0].message);
  }
}

/**
 * @deprecated Use tagService.mergeTags from src/lib/tags instead.
 */
async function mergeTags(
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

function saveTransformerPrompt(prompt: string): void {
  void prompt;
  console.warn(
    'saveTransformerPrompt is deprecated. Use the authenticated preference helpers instead.'
  );
}

function resetTransformerPrompt(): void {
  console.warn(
    'resetTransformerPrompt is deprecated. Use the authenticated preference helpers instead.'
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

function isGitHubMigrationDone(): boolean {
  return getGitHubSettings().migrationDone;
}

function saveGitHubConfig(config: GitHubConfig): void {
  void config;
  console.warn(
    'saveGitHubConfig is deprecated. Use the authenticated preference helpers instead.'
  );
}

function enableGitHub(): void {
  console.warn(
    'enableGitHub is deprecated. Use the authenticated preference helpers instead.'
  );
}

function disableGitHub(): void {
  console.warn(
    'disableGitHub is deprecated. Use the authenticated preference helpers instead.'
  );
}

function clearGitHubConfig(): void {
  console.warn(
    'clearGitHubConfig is deprecated. Use the authenticated preference helpers instead.'
  );
}

function setGitHubMigrationDone(): void {
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
  sessions: JudoSession[];
  issues: SessionFileIssue[];
} {
  const sessions: JudoSession[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.sessions)
      ? (payload as any).sessions
      : [];
  const issues: SessionFileIssue[] = Array.isArray((payload as any)?.issues)
    ? (payload as any).issues
    : [];
  return { sessions, issues };
}

/**
 * Reconcile dirty mutations against remote sessions.
 * Clears mutations that have been applied upstream.
 */
function reconcileDirtyMutations(sessions: JudoSession[]): void {
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

async function refreshSessionsFromAPI(options?: {
  force?: boolean;
}): Promise<void> {
  // Guard: when GitHub sync is enabled and Firebase is configured, skip refresh without Firebase auth.
  if (isGitHubEnabled() && getGitHubConfig() && isFirebaseConfigured()) {
    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser) {
        return;
      }
    } catch (_error) {
      return;
    }
  }
  if (typeof window === 'undefined' || !isOnline || isGuestMode()) return;
  const force = options?.force === true;
  if (inFlightRefresh) {
    if (force && !inFlightRefreshForce) {
      queuedForcedRefresh = true;
    }
    return inFlightRefresh;
  }
  if (!force && shouldThrottleGitHubRefresh() && hasFreshRemoteRefresh()) {
    return;
  }

  inFlightRefreshForce = force;
  inFlightRefresh = (async () => {
    const generation = storageGeneration;
    const seq = ++refreshSeq;

    try {
      const gitHubConfig = getGitHubConfig();
      const url = buildSessionListUrl(gitHubConfig, force);
      const headers = await getAuthHeaders();
      const res = await fetch(url.toString(), { headers });

      if (!res.ok) {
        console.warn(
          `Skipping cache refresh from /api/sessions/list due to non-OK status ${res.status}`
        );
        return;
      }

      const payload = await res.json();
      const { sessions, issues } = parseSessionListResponse(payload);

      if (!isStorageGenerationCurrent(generation)) {
        return;
      }
      if (seq < latestAppliedSeq) {
        return;
      }

      const mergedSessions = getOptimisticSessions(sessions);
      reconcileDirtyMutations(sessions);

      latestAppliedSeq = seq;
      lastSuccessfulRemoteRefreshAt = Date.now();
      sessionFileIssuesCache = issues;
      commitLocalSessions(mergedSessions);
      dispatchStorageSync(mergedSessions);
    } catch (error) {
      console.error('Error refreshing sessions from API', error);
    } finally {
      inFlightRefresh = null;
      const shouldRunQueuedForce = queuedForcedRefresh;
      queuedForcedRefresh = false;
      inFlightRefreshForce = false;

      if (
        shouldRunQueuedForce &&
        isStorageGenerationCurrent(generation) &&
        isOnline &&
        !isGuestMode()
      ) {
        void refreshSessionsFromAPI({ force: true });
      }
    }
  })();

  return inFlightRefresh;
}

/**
 * Prepare and start lease acquisition with heartbeat renewal.
 * Returns cleanup function to call when lease is no longer needed.
 */
async function prepareAndStartLease(): Promise<{
  acquired: boolean;
  clearHeartbeat: () => void;
}> {
  let leaseHeartbeat: ReturnType<typeof setInterval> | null = null;

  const leaseAcquired = await tryAcquireSyncLease();
  if (!leaseAcquired) {
    return { acquired: false, clearHeartbeat: () => {} };
  }

  const heartbeatIntervalMs = Math.min(
    Math.max(MIN_SYNC_LOCK_HEARTBEAT_MS, syncLockHeartbeatMs),
    Math.max(MIN_SYNC_LOCK_HEARTBEAT_MS, Math.floor(syncLockTtlMs / 2))
  );

  leaseHeartbeat = setInterval(() => {
    if (!renewSyncLease()) {
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

/**
 * Helper: Build the request body for a sync operation
 */
function buildOperationRequestBody(
  operation: SyncOperation,
  gitHubConfig: ReturnType<typeof getGitHubConfig>,
  gitHubEnabled: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  switch (operation.type) {
    case 'CREATE':
    case 'UPDATE':
      Object.assign(body, operation.session);
      break;
    case 'DELETE':
      // DELETE operations don't include body for session data
      break;
  }

  if (gitHubConfig && gitHubEnabled) {
    body.gitHubConfig = gitHubConfig;
  }

  return body;
}

/**
 * Helper: Get the API endpoint URL for a sync operation
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
 * Helper: Get the HTTP method for a sync operation
 */
function getOperationMethod(operation: SyncOperation): 'POST' | 'PUT' | 'DELETE' {
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
 * Helper: Extract session ID from a sync operation (needed for mutation tracking)
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

/**
 * Helper: Handle a successful sync operation
 */
function handleOperationSuccess(
  operation: SyncOperation,
  index: number,
  queue: SyncOperation[]
): void {
  const sessionId = getSessionIdFromOperation(operation);
  clearDirtyMutation(sessionId, operation.queuedAt);
}

/**
 * Helper: Handle sync operation errors (permanent vs retryable)
 */
async function handleOperationError(
  error: unknown,
  operation: SyncOperation,
  index: number,
  queue: SyncOperation[],
  generation: number,
  onAbort: (remainingOps: SyncOperation[]) => Promise<void>
): Promise<{ retryable: boolean; retryAfterMs: number | null }> {
  if (!(error instanceof SyncRequestError)) {
    // Non-SyncRequestError: retryable
    return { retryable: true, retryAfterMs: null };
  }

  // Handle permanent failures (mark as synced to avoid retry loop)
  if (!error.retryable) {
    const sessionId = getSessionIdFromOperation(operation);
    clearDirtyMutation(sessionId, operation.queuedAt);

    const remainingOperations = queue.filter((_, i) => i !== index);
    if (isStorageGenerationCurrent(generation)) {
      await setQueue(remainingOperations, queue);
      await reconcilePermanentFailure();
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
 * Returns true if processing should continue, false if lease was lost or error occurred.
 */
async function processSingleQueueOperation(
  operation: SyncOperation,
  index: number,
  queue: SyncOperation[],
  generation: number,
  gitHubConfig: ReturnType<typeof getGitHubConfig>,
  gitHubEnabled: boolean,
  onAbort: (remainingOps: SyncOperation[]) => Promise<void>
): Promise<{ success: boolean; shouldContinue: boolean }> {
  // Check lease ownership before operation
  if (!hasActiveSyncLeaseOwnership() || !renewSyncLease()) {
    await onAbort(queue.slice(index));
    return { success: false, shouldContinue: false };
  }

  try {
    // Build request
    const body = buildOperationRequestBody(operation, gitHubConfig, gitHubEnabled);
    const url = getOperationUrl(operation);
    const method = getOperationMethod(operation);

    const headers = await getAuthHeaders({
      'Content-Type': 'application/json',
    });

    // Send request
    await syncRequest(url, {
      method,
      headers,
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });

    // Verify lease still owned after operation
    if (!hasActiveSyncLeaseOwnership()) {
      await onAbort(queue.slice(index));
      return { success: false, shouldContinue: false };
    }

    // Mark mutation as synced
    handleOperationSuccess(operation, index, queue);

    return { success: true, shouldContinue: true };
  } catch (error) {
    console.error('Error syncing operation', error);

    const { retryable, retryAfterMs } = await handleOperationError(
      error,
      operation,
      index,
      queue,
      generation,
      onAbort
    );

    // Handle backoff for retryable errors with retry-after header
    if (retryable && retryAfterMs !== null && retryAfterMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    }

    // Stop syncing on error; queue remaining operations for retry
    if (retryable) {
      const remainingOperations = queue.slice(index);
      if (isStorageGenerationCurrent(generation)) {
        await setQueue(remainingOperations, queue);
      }
    }

    return { success: false, shouldContinue: false };
  }
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
    getSyncLockStorageKey,
    isStorageEventForKey,
  });

  inFlightSync = (async () => {
    const generation = storageGeneration;
    isSyncing = true;
    let leaseAcquired = false;

    try {
      // Acquire lease and setup heartbeat
      const lease = await prepareAndStartLease();
      leaseAcquired = lease.acquired;

      if (!leaseAcquired) {
        return;
      }

      const queue = getQueue();
      const gitHubConfig = getGitHubConfig();
      const gitHubEnabled = isGitHubEnabled();

      // Abort handler: clear heartbeat and update queue on lease loss
      const onAbort = async (remainingOps: SyncOperation[]) => {
        lease.clearHeartbeat();
        if (isStorageGenerationCurrent(generation)) {
          await setQueue(remainingOps, queue);
        }
      };

      // Process each operation in the queue
      for (const [index, operation] of queue.entries()) {
        const result = await processSingleQueueOperation(
          operation,
          index,
          queue,
          generation,
          gitHubConfig,
          gitHubEnabled,
          onAbort
        );

        if (!result.shouldContinue) {
          return;
        }
      }

      // All operations succeeded, clear queue and refresh
      if (!isStorageGenerationCurrent(generation)) {
        return;
      }
      await clearQueue(queue);

      // Refresh sessions from API to ensure cache is up-to-date
      if (!isStorageGenerationCurrent(generation)) {
        return;
      }
      if (shouldThrottleGitHubRefresh()) {
        scheduleRefresh();
      } else {
        await refreshSessionsFromAPI();
      }
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
  storageGeneration += 1;
  sessionCache = null;
  sessionFileIssuesCache = [];
  isOnline = typeof window !== 'undefined' ? navigator.onLine : true;
  isSyncing = false;
  inFlightSync = null;
  inFlightRefresh = null;
  inFlightRefreshForce = false;
  queuedForcedRefresh = false;
  clearScheduledRefresh();
  lastSuccessfulRemoteRefreshAt = 0;
  listenersInitialized = false;
  refreshSeq = 0;
  latestAppliedSeq = 0;
  storageGeneration = 0;
  resetMutationVersion();
  clearAllDirtyMutations();
  activeSyncLease = null;
  localLeaseEpochCounter = 0;
  syncLockTtlMs = DEFAULT_SYNC_LOCK_TTL_MS;
  syncLockHeartbeatMs = Math.min(
    DEFAULT_SYNC_LOCK_HEARTBEAT_MS,
    Math.max(MIN_SYNC_LOCK_HEARTBEAT_MS, Math.floor(syncLockTtlMs / 3))
  );

  // Reset sync-lease module timing to defaults
  initializeSyncLeaseModule({
    syncOwnerId,
    syncLockTtlMs,
    getSyncLockStorageKey,
    isStorageEventForKey,
  });

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
