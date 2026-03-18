'use client';

import { JudoSession, GitHubConfig, GitHubSettings } from './types';
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
} from './user-preferences';

const STORAGE_KEY_BASE = 'matmetrics_sessions';

function getSessionsStorageKey(): string {
  return getScopedStorageKey(STORAGE_KEY_BASE);
}

function isStorageEventForKey(event: StorageEvent, key: string): boolean {
  return event.storageArea === localStorage && event.key === key;
}

// Internal state
let sessionCache: JudoSession[] | null = null;
let isOnline = typeof window !== 'undefined' ? navigator.onLine : true;
let isSyncing = false;
let listenersInitialized = false;
let refreshSeq = 0;
let latestAppliedSeq = 0;

/**
 * Initialize storage: set up online/offline listeners and attempt migration
 */
export function initializeStorage(): void {
  if (typeof window === 'undefined') return;

  sessionCache = null;
  isSyncing = false;

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
export function saveSession(session: JudoSession): void {
  if (typeof window === 'undefined') return;
  const guestMode = isGuestMode();

  // Update local cache immediately
  sessionCache = sessionCache ? [session, ...sessionCache] : [session];
  updateLocalStorageCache(sessionCache);
  if (guestMode) {
    markGuestWorkspaceCustom();
    return;
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = { ...session };
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    void (async () => {
      try {
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });
        const res = await fetch('/api/sessions/create', {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) throw new Error('Failed to save session');
      } catch (error) {
        console.error('Error saving session to API', error);
        queueOperation({ type: 'CREATE', session });
      }
    })();
  } else {
    // Offline: queue the operation
    queueOperation({ type: 'CREATE', session });
  }
}

/**
 * Update an existing session (online -> API, offline -> queue + cache)
 */
export function updateSession(session: JudoSession): void {
  if (typeof window === 'undefined') return;
  const guestMode = isGuestMode();

  // Update local cache immediately
  const base = sessionCache ?? getLocalStorageCache();
  const hasMatch = base.some((s) => s.id === session.id);
  const updated = hasMatch
    ? base.map((s) => (s.id === session.id ? session : s))
    : base;

  if (!hasMatch) {
    console.warn(
      `Session ${session.id} not found in cache. Skipping local update.`
    );
  }

  updateLocalStorageCache(updated);
  sessionCache = updated;
  if (guestMode) {
    markGuestWorkspaceCustom();
    return;
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = { ...session };
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    void (async () => {
      try {
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });
        const res = await fetch(`/api/sessions/${session.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) throw new Error('Failed to update session');
      } catch (error) {
        console.error('Error updating session on API', error);
        queueOperation({ type: 'UPDATE', session });
      }
    })();
  } else {
    // Offline: queue the operation
    queueOperation({ type: 'UPDATE', session });
  }
}

/**
 * Delete a session (online -> API, offline -> queue + cache)
 */
export function deleteSession(id: string): void {
  if (typeof window === 'undefined') return;
  const guestMode = isGuestMode();

  // Update local cache immediately
  const base = sessionCache ?? getLocalStorageCache();
  const filtered = base.filter((s) => s.id !== id);
  sessionCache = filtered;
  updateLocalStorageCache(filtered);
  if (guestMode) {
    markGuestWorkspaceCustom();
    return;
  }

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = {};
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    void (async () => {
      try {
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });
        const res = await fetch(`/api/sessions/${id}`, {
          method: 'DELETE',
          headers,
          body:
            Object.keys(requestBody).length > 0
              ? JSON.stringify(requestBody)
              : undefined,
        });

        if (!res.ok) throw new Error('Failed to delete session');
      } catch (error) {
        console.error('Error deleting session on API', error);
        queueOperation({ type: 'DELETE', id });
      }
    })();
  } else {
    // Offline: queue the operation
    queueOperation({ type: 'DELETE', id });
  }
}

/**
 * Get all unique technique tags
 */
export function getAllTags(): string[] {
  const sessions = getSessions();
  const tags = new Set<string>();
  sessions.forEach((s) => s.techniques.forEach((t) => tags.add(t)));
  return Array.from(tags).sort();
}

/**
 * Rename a technique tag across all sessions (updates cache and API/queue)
 */
export function renameTag(oldName: string, newName: string): void {
  const sessions = getSessions();
  const updated = sessions.map((session) => {
    if (session.techniques.includes(oldName)) {
      const newTechniques = session.techniques.map((t) =>
        t === oldName ? newName : t
      );
      return { ...session, techniques: Array.from(new Set(newTechniques)) };
    }
    return session;
  });

  // Update each modified session
  updated.forEach((session, idx) => {
    if (sessions[idx].techniques.join(',') !== session.techniques.join(',')) {
      updateSession(session);
    }
  });
}

/**
 * Delete a technique tag from all sessions (updates cache and API/queue)
 */
export function deleteTag(tagName: string): void {
  const sessions = getSessions();
  const updated = sessions.map((session) => ({
    ...session,
    techniques: session.techniques.filter((t) => t !== tagName),
  }));

  // Update each modified session
  updated.forEach((session, idx) => {
    if (sessions[idx].techniques.join(',') !== session.techniques.join(',')) {
      updateSession(session);
    }
  });
}

/**
 * Merge two technique tags (rename source to target)
 */
export function mergeTags(sourceTag: string, targetTag: string): void {
  renameTag(sourceTag, targetTag);
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
  return getCurrentPreferences().gitHub ?? { ...DEFAULT_GITHUB_SETTINGS };
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
  const settings = getGitHubSettings();
  settings.syncStatus = status;
  settings.lastSyncTime = new Date().toISOString();
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
  sessionCache = [];
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
    sessionCache = latestSessions;
    window.dispatchEvent(
      new CustomEvent('storageSync', { detail: { sessions: latestSessions } })
    );
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

    latestAppliedSeq = seq;
    sessionCache = sessions;
    updateLocalStorageCache(sessions);
    // Notify listeners (components) of the update
    window.dispatchEvent(
      new CustomEvent('storageSync', { detail: { sessions } })
    );
  } catch (error) {
    console.error('Error refreshing sessions from API', error);
  }
}

async function syncPendingOperations(): Promise<void> {
  if (!isOnline || isSyncing || isGuestMode()) return;

  isSyncing = true;

  try {
    const queue = getQueue();
    const gitHubConfig = getGitHubConfig();
    const gitHubEnabled = isGitHubEnabled();
    for (const [index, operation] of queue.entries()) {
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
            const createResponse = await fetch('/api/sessions/create', {
              method: 'POST',
              headers: createHeaders,
              body: JSON.stringify(createBody),
            });

            if (!createResponse.ok) throw new Error('Failed to create session');
            break;

          case 'UPDATE':
            const updateBody: any = { ...operation.session };
            if (gitHubConfig && gitHubEnabled) {
              updateBody.gitHubConfig = gitHubConfig;
            }
            const updateHeaders = await getAuthHeaders({
              'Content-Type': 'application/json',
            });
            const updateResponse = await fetch(
              `/api/sessions/${operation.session.id}`,
              {
                method: 'PUT',
                headers: updateHeaders,
                body: JSON.stringify(updateBody),
              }
            );

            if (!updateResponse.ok) throw new Error('Failed to update session');
            break;

          case 'DELETE':
            const deleteBody: any = {};
            if (gitHubConfig && gitHubEnabled) {
              deleteBody.gitHubConfig = gitHubConfig;
            }
            const deleteHeaders = await getAuthHeaders({
              'Content-Type': 'application/json',
            });
            const deleteResponse = await fetch(
              `/api/sessions/${operation.id}`,
              {
                method: 'DELETE',
                headers: deleteHeaders,
                body:
                  Object.keys(deleteBody).length > 0
                    ? JSON.stringify(deleteBody)
                    : undefined,
              }
            );

            if (!deleteResponse.ok) throw new Error('Failed to delete session');
            break;
        }
      } catch (error) {
        console.error('Error syncing operation', error);
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
  }
}
