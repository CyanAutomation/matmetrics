"use client"

import { JudoSession, GitHubConfig, GitHubSettings } from "./types";
import {
  queueOperation,
  getQueue,
  clearQueue,
  getPendingOperationCount,
  hasPendingOperations,
  setQueue,
  SYNC_QUEUE_KEY,
} from "./sync-queue";

const STORAGE_KEY = "matmetrics_sessions";
const PROMPT_KEY = "matmetrics_transformer_prompt";
const MIGRATION_DONE_KEY = "matmetrics_migration_done";
const GITHUB_CONFIG_KEY = "matmetrics_github_config";
const CLOUD_PERSISTENCE_STATUS_KEY = "matmetrics_cloud_persistence_status";

function isStorageEventForKey(event: StorageEvent, key: string): boolean {
  return event.storageArea === localStorage && event.key === key;
}

const DEFAULT_TRANSFORMER_PROMPT = `You are an experienced Judo practitioner helping a student write their training diary.

Your task is to take the following raw, informal notes from a Judo practice session and transform them into a well-structured, clear, and terminologically accurate diary entry.

Guidelines:
- **Tone**: Use an informal, personal, and reflective tone. It should feel like a student writing in their own training diary. Avoid being overly optimistic, buoyant, or exaggerated; maintain a neutral and realistic perspective on the session.
- **Terminology**: Use official Kodokan Judo terminology. Crucially, all techniques MUST be correctly hyphenated (e.g., "O-soto-gari", "Ippon-seoi-nage", "Uchi-mata", "Kuzushi"). Ensure correct spelling and capitalization according to Kodokan standards.
- **Content**: Maintain all specific details and meaning provided by the user.
- **Structure**: Organize the notes so they flow logically. If the input is just a list, turn it into a few readable, reflective sentences.
- **Focus**: Emphasize the specific techniques practiced and the trainee's honest reflections on what went well or what needs work.`;

// Internal state
let sessionCache: JudoSession[] | null = null;
let isOnline = typeof window !== "undefined" ? navigator.onLine : true;
let isSyncing = false;
let migrationAttempted = false;
let listenersInitialized = false;
let refreshSeq = 0;
let latestAppliedSeq = 0;
let cloudPersistencePaused = false;

type CloudPersistenceStatusDetail = {
  paused: boolean;
  reason?: "blob-disabled";
};

function readCloudPersistenceStatus(): CloudPersistenceStatusDetail {
  if (typeof window === "undefined") {
    return { paused: false };
  }

  try {
    const raw = localStorage.getItem(CLOUD_PERSISTENCE_STATUS_KEY);
    if (!raw) return { paused: false };
    const parsed = JSON.parse(raw) as CloudPersistenceStatusDetail;
    if (typeof parsed?.paused !== "boolean") {
      return { paused: false };
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to parse cloud persistence status", error);
    return { paused: false };
  }
}

function setCloudPersistencePaused(paused: boolean, reason?: "blob-disabled"): void {
  if (typeof window === "undefined") return;

  cloudPersistencePaused = paused;
  const detail: CloudPersistenceStatusDetail = paused ? { paused, reason } : { paused };
  localStorage.setItem(CLOUD_PERSISTENCE_STATUS_KEY, JSON.stringify(detail));
  window.dispatchEvent(new CustomEvent("cloudPersistenceStatus", { detail }));
}

async function isBlobStorageDisabledResponse(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;

  try {
    const payload = await res.clone().json();
    return payload?.code === "BLOB_STORAGE_DISABLED";
  } catch {
    return false;
  }
}

/**
 * Initialize storage: set up online/offline listeners and attempt migration
 */
export function initializeStorage(): void {
  if (typeof window === "undefined") return;

  cloudPersistencePaused = readCloudPersistenceStatus().paused;

  // Set up online/offline detection exactly once
  if (!listenersInitialized) {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("storage", handleStorageEvent);
    listenersInitialized = true;
  }

  // Attempt migration on first load
  if (!migrationAttempted) {
    migrationAttempted = true;
    void attemptMigration();
  }

  // Try to sync if we have pending operations
  if (isOnline && hasPendingOperations()) {
    void syncPendingOperations();
  }
}

/**
 * Optional teardown for tests or unmount flows.
 */
export function teardownStorageListeners(): void {
  if (typeof window === "undefined" || !listenersInitialized) return;

  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
  window.removeEventListener("storage", handleStorageEvent);
  listenersInitialized = false;
}

/**
 * Get all sessions from API (online) or cache (offline)
 */
export function getSessions(): JudoSession[] {
  if (typeof window === "undefined") return [];

  // If cache is populated, return it (even if online, we'll refresh in the background)
  if (sessionCache !== null) {
    // Refresh from API in the background if online
    if (isOnline) {
      void refreshSessionsFromAPI();
    }
    return sessionCache;
  }

  // If offline, try to read from localStorage cache
  if (!isOnline) {
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
  if (typeof window === "undefined") return;

  // Update local cache immediately
  sessionCache = sessionCache ? [session, ...sessionCache] : [session];
  updateLocalStorageCache(sessionCache);

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = { ...session };
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    void (async () => {
      try {
        const res = await fetch("/api/sessions/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (await isBlobStorageDisabledResponse(res)) {
          setCloudPersistencePaused(true, "blob-disabled");
          queueOperation({ type: "CREATE", session });
          return;
        }

        if (!res.ok) throw new Error("Failed to save session");

        setCloudPersistencePaused(false);
      } catch (error) {
        console.error("Error saving session to API", error);
        queueOperation({ type: "CREATE", session });
      }
    })();
  } else {
    // Offline: queue the operation
    queueOperation({ type: "CREATE", session });
  }
}

/**
 * Update an existing session (online -> API, offline -> queue + cache)
 */
export function updateSession(session: JudoSession): void {
  if (typeof window === "undefined") return;

  // Update local cache immediately
  const base = sessionCache ?? getLocalStorageCache();
  const hasMatch = base.some(s => s.id === session.id);
  const updated = hasMatch
    ? base.map(s => (s.id === session.id ? session : s))
    : base;

  if (!hasMatch) {
    console.warn(`Session ${session.id} not found in cache. Skipping local update.`);
  }

  updateLocalStorageCache(updated);
  sessionCache = updated;

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = { ...session };
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (await isBlobStorageDisabledResponse(res)) {
          setCloudPersistencePaused(true, "blob-disabled");
          queueOperation({ type: "UPDATE", session });
          return;
        }

        if (!res.ok) throw new Error("Failed to update session");

        setCloudPersistencePaused(false);
      } catch (error) {
        console.error("Error updating session on API", error);
        queueOperation({ type: "UPDATE", session });
      }
    })();
  } else {
    // Offline: queue the operation
    queueOperation({ type: "UPDATE", session });
  }
}

/**
 * Delete a session (online -> API, offline -> queue + cache)
 */
export function deleteSession(id: string): void {
  if (typeof window === "undefined") return;

  // Update local cache immediately
  const base = sessionCache ?? getLocalStorageCache();
  const filtered = base.filter(s => s.id !== id);
  sessionCache = filtered;
  updateLocalStorageCache(filtered);

  if (isOnline) {
    // Send to API with GitHub config if available
    const gitHubConfig = getGitHubConfig();
    const requestBody: any = {};
    if (gitHubConfig && isGitHubEnabled()) {
      requestBody.gitHubConfig = gitHubConfig;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: Object.keys(requestBody).length > 0 ? JSON.stringify(requestBody) : undefined,
        });

        if (await isBlobStorageDisabledResponse(res)) {
          setCloudPersistencePaused(true, "blob-disabled");
          queueOperation({ type: "DELETE", id });
          return;
        }

        if (!res.ok) throw new Error("Failed to delete session");

        setCloudPersistencePaused(false);
      } catch (error) {
        console.error("Error deleting session on API", error);
        queueOperation({ type: "DELETE", id });
      }
    })();
  } else {
    // Offline: queue the operation
    queueOperation({ type: "DELETE", id });
  }
}

/**
 * Get all unique technique tags
 */
export function getAllTags(): string[] {
  const sessions = getSessions();
  const tags = new Set<string>();
  sessions.forEach(s => s.techniques.forEach(t => tags.add(t)));
  return Array.from(tags).sort();
}

/**
 * Rename a technique tag across all sessions (updates cache and API/queue)
 */
export function renameTag(oldName: string, newName: string): void {
  const sessions = getSessions();
  const updated = sessions.map(session => {
    if (session.techniques.includes(oldName)) {
      const newTechniques = session.techniques.map(t =>
        t === oldName ? newName : t
      );
      return { ...session, techniques: Array.from(new Set(newTechniques)) };
    }
    return session;
  });

  // Update each modified session
  updated.forEach((session, idx) => {
    if (sessions[idx].techniques.join(",") !== session.techniques.join(",")) {
      updateSession(session);
    }
  });
}

/**
 * Delete a technique tag from all sessions (updates cache and API/queue)
 */
export function deleteTag(tagName: string): void {
  const sessions = getSessions();
  const updated = sessions.map(session => ({
    ...session,
    techniques: session.techniques.filter(t => t !== tagName),
  }));

  // Update each modified session
  updated.forEach((session, idx) => {
    if (sessions[idx].techniques.join(",") !== session.techniques.join(",")) {
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

// AI Transformer Prompt Persistence (stays in localStorage)
export function getTransformerPrompt(): string {
  if (typeof window === "undefined") return DEFAULT_TRANSFORMER_PROMPT;
  return localStorage.getItem(PROMPT_KEY) || DEFAULT_TRANSFORMER_PROMPT;
}

export function saveTransformerPrompt(prompt: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROMPT_KEY, prompt);
}

export function resetTransformerPrompt(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROMPT_KEY, DEFAULT_TRANSFORMER_PROMPT);
}

// GitHub Settings Persistence
export function getGitHubSettings(): GitHubSettings {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      migrationDone: false,
      syncStatus: 'idle',
    };
  }

  try {
    const stored = localStorage.getItem(GITHUB_CONFIG_KEY);
    if (!stored) {
      return {
        enabled: false,
        migrationDone: false,
        syncStatus: 'idle',
      };
    }

    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse GitHub settings", e);
    return {
      enabled: false,
      migrationDone: false,
      syncStatus: 'idle',
    };
  }
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
  if (typeof window === "undefined") return;

  const settings: GitHubSettings = {
    config,
    enabled: true,
    migrationDone: false,
    syncStatus: 'idle',
  };

  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(settings));
}

export function enableGitHub(): void {
  if (typeof window === "undefined") return;

  const settings = getGitHubSettings();
  settings.enabled = true;
  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(settings));
}

export function disableGitHub(): void {
  if (typeof window === "undefined") return;

  const settings = getGitHubSettings();
  settings.enabled = false;
  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(settings));
}

export function clearGitHubConfig(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GITHUB_CONFIG_KEY);
}

export function setGitHubMigrationDone(): void {
  if (typeof window === "undefined") return;

  const settings = getGitHubSettings();
  settings.migrationDone = true;
  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(settings));
}

export function setGitHubSyncStatus(status: 'idle' | 'syncing' | 'success' | 'error'): void {
  if (typeof window === "undefined") return;

  const settings = getGitHubSettings();
  settings.syncStatus = status;
  settings.lastSyncTime = new Date().toISOString();
  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(settings));
}

export function getGitHubSyncStatus(): 'idle' | 'syncing' | 'success' | 'error' {
  return getGitHubSettings().syncStatus;
}

export function clearAllData(): void {
  if (typeof window === "undefined") return;
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
  cloudPersistencePaused: boolean;
} {
  return {
    isOnline,
    isSyncing,
    pendingCount: getPendingOperationCount(),
    cloudPersistencePaused,
  };
}

export function retryCloudSync(): void {
  if (typeof window === "undefined") return;
  void syncPendingOperations({ allowWhenPaused: true });
}

// ============================================================================
// Private helper functions
// ============================================================================

function getLocalStorageCache(): JudoSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to parse localStorage cache", e);
    return [];
  }
}

function updateLocalStorageCache(sessions: JudoSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error("Failed to update localStorage cache", e);
  }
}

function handleOnline(): void {
  isOnline = true;

  // Sync pending operations when coming back online.
  // The sync flow already refreshes sessions after queue flush.
  if (hasPendingOperations()) {
    void syncPendingOperations({ allowWhenPaused: true });
    return;
  }

  // No pending operations, so refresh immediately.
  void refreshSessionsFromAPI();
}

function handleOffline(): void {
  isOnline = false;
}

function handleStorageEvent(event: StorageEvent): void {
  if (typeof window === "undefined") return;

  if (isStorageEventForKey(event, STORAGE_KEY)) {
    const latestSessions = getLocalStorageCache();
    sessionCache = latestSessions;
    window.dispatchEvent(new CustomEvent("storageSync", { detail: { sessions: latestSessions } }));
    return;
  }

  if (isStorageEventForKey(event, CLOUD_PERSISTENCE_STATUS_KEY)) {
    cloudPersistencePaused = readCloudPersistenceStatus().paused;
    return;
  }

  if (isStorageEventForKey(event, SYNC_QUEUE_KEY) && isOnline && hasPendingOperations() && !cloudPersistencePaused) {
    void syncPendingOperations();
  }
}

async function refreshSessionsFromAPI(): Promise<void> {
  if (typeof window === "undefined" || !isOnline) return;

  const seq = ++refreshSeq;

  try {
    const res = await fetch("/api/sessions/list");
    if (!res.ok) {
      console.warn(`Skipping cache refresh from /api/sessions/list due to non-OK status ${res.status}`);
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
    window.dispatchEvent(new CustomEvent("storageSync", { detail: { sessions } }));
  } catch (error) {
    console.error("Error refreshing sessions from API", error);
  }
}

async function syncPendingOperations(options?: { allowWhenPaused?: boolean }): Promise<void> {
  if (!isOnline || isSyncing) return;
  if (cloudPersistencePaused && !options?.allowWhenPaused) return;

  isSyncing = true;

  try {
    const queue = getQueue();
    const gitHubConfig = getGitHubConfig();
    const gitHubEnabled = isGitHubEnabled();
    for (const [index, operation] of queue.entries()) {
      try {
        switch (operation.type) {
          case "CREATE":
            const createBody: any = { ...operation.session };
            if (gitHubConfig && gitHubEnabled) {
              createBody.gitHubConfig = gitHubConfig;
            }
            const createResponse = await fetch("/api/sessions/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(createBody),
            });

            if (await isBlobStorageDisabledResponse(createResponse)) {
              setCloudPersistencePaused(true, "blob-disabled");
              return;
            }

            if (!createResponse.ok) throw new Error("Failed to create session");
            break;

          case "UPDATE":
            const updateBody: any = { ...operation.session };
            if (gitHubConfig && gitHubEnabled) {
              updateBody.gitHubConfig = gitHubConfig;
            }
            const updateResponse = await fetch(`/api/sessions/${operation.session.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateBody),
            });

            if (await isBlobStorageDisabledResponse(updateResponse)) {
              setCloudPersistencePaused(true, "blob-disabled");
              return;
            }

            if (!updateResponse.ok) throw new Error("Failed to update session");
            break;

          case "DELETE":
            const deleteBody: any = {};
            if (gitHubConfig && gitHubEnabled) {
              deleteBody.gitHubConfig = gitHubConfig;
            }
            const deleteResponse = await fetch(`/api/sessions/${operation.id}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: Object.keys(deleteBody).length > 0 ? JSON.stringify(deleteBody) : undefined,
            });

            if (await isBlobStorageDisabledResponse(deleteResponse)) {
              setCloudPersistencePaused(true, "blob-disabled");
              return;
            }

            if (!deleteResponse.ok) throw new Error("Failed to delete session");
            break;
        }

      } catch (error) {
        console.error("Error syncing operation", error);
        // Stop syncing on first error; retries must include the failed operation to avoid data loss.
        const remainingOperations = queue.slice(index);
        setQueue(remainingOperations, queue);
        return;
      }
    }

    // If all operations succeeded, clear the queue
    clearQueue(queue);
    setCloudPersistencePaused(false);

    // Refresh sessions from API to ensure cache is up-to-date
    await refreshSessionsFromAPI();
  } finally {
    isSyncing = false;
  }
}

async function attemptMigration(): Promise<void> {
  if (typeof window === "undefined") return;

  const migrationDone = localStorage.getItem(MIGRATION_DONE_KEY);
  if (migrationDone) {
    // Already migrated
    return;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    // No localStorage data to migrate
    localStorage.setItem(MIGRATION_DONE_KEY, "true");
    return;
  }

  try {
    const sessions = JSON.parse(stored);
    if (!Array.isArray(sessions) || sessions.length === 0) {
      localStorage.setItem(MIGRATION_DONE_KEY, "true");
      return;
    }

    // Attempt migration
    const response = await fetch("/api/sessions/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success || result.migrated > 0) {
        console.log(`Migrated ${result.migrated} sessions to markdown files`);
        // Clear localStorage after successful migration
        localStorage.removeItem(STORAGE_KEY);
        sessionCache = null; // Clear cache so it gets reloaded from API
        localStorage.setItem(MIGRATION_DONE_KEY, "true");
      }
    } else {
      console.error("Migration failed:", await response.json());
    }
  } catch (error) {
    console.error("Migration error", error);
  }
}
