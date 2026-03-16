"use client"

import { JudoSession } from "./types";
import {
  queueOperation,
  getQueue,
  clearQueue,
  getPendingOperationCount,
  hasPendingOperations,
} from "./sync-queue";

const STORAGE_KEY = "matmetrics_sessions";
const PROMPT_KEY = "matmetrics_transformer_prompt";
const MIGRATION_DONE_KEY = "matmetrics_migration_done";

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

/**
 * Initialize storage: set up online/offline listeners and attempt migration
 */
export function initializeStorage(): void {
  if (typeof window === "undefined") return;

  // Set up online/offline detection
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Attempt migration on first load
  if (!migrationAttempted) {
    migrationAttempted = true;
    attemptMigration();
  }

  // Try to sync if we have pending operations
  if (isOnline && hasPendingOperations()) {
    syncPendingOperations();
  }
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
      refreshSessionsFromAPI();
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
  refreshSessionsFromAPI();

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
    // Send to API
    fetch("/api/sessions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to save session");
        // Successfully saved to server
      })
      .catch(error => {
        console.error("Error saving session to API", error);
        // Queue it as fallback
        queueOperation({ type: "CREATE", session });
      });
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
  sessionCache = sessionCache
    ? sessionCache.map(s => (s.id === session.id ? session : s))
    : [session];
  updateLocalStorageCache(sessionCache);

  if (isOnline) {
    // Send to API
    fetch(`/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to update session");
      })
      .catch(error => {
        console.error("Error updating session on API", error);
        // Queue it as fallback
        queueOperation({ type: "UPDATE", session });
      });
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
  sessionCache = sessionCache ? sessionCache.filter(s => s.id !== id) : [];
  updateLocalStorageCache(sessionCache);

  if (isOnline) {
    // Send to API
    fetch(`/api/sessions/${id}`, {
      method: "DELETE",
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to delete session");
      })
      .catch(error => {
        console.error("Error deleting session on API", error);
        // Queue it as fallback
        queueOperation({ type: "DELETE", id });
      });
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
} {
  return {
    isOnline,
    isSyncing,
    pendingCount: getPendingOperationCount(),
  };
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
  // Sync pending operations when coming back online
  if (hasPendingOperations()) {
    syncPendingOperations();
  }
  // Also refresh sessions from API
  refreshSessionsFromAPI();
}

function handleOffline(): void {
  isOnline = false;
}

function refreshSessionsFromAPI(): void {
  if (typeof window === "undefined" || !isOnline) return;

  fetch("/api/sessions/list")
    .then(res => {
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    })
    .then((sessions: JudoSession[]) => {
      sessionCache = sessions;
      updateLocalStorageCache(sessions);
      // Notify listeners (components) of the update
      window.dispatchEvent(new CustomEvent("storageSync", { detail: { sessions } }));
    })
    .catch(error => {
      console.error("Error refreshing sessions from API", error);
    });
}

async function syncPendingOperations(): Promise<void> {
  if (!isOnline || isSyncing) return;

  isSyncing = true;

  try {
    const queue = getQueue();

    for (const operation of queue) {
      try {
        switch (operation.type) {
          case "CREATE":
            await fetch("/api/sessions/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(operation.session),
            }).then(res => {
              if (!res.ok) throw new Error("Failed to create session");
            });
            break;

          case "UPDATE":
            await fetch(`/api/sessions/${operation.session.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(operation.session),
            }).then(res => {
              if (!res.ok) throw new Error("Failed to update session");
            });
            break;

          case "DELETE":
            await fetch(`/api/sessions/${operation.id}`, {
              method: "DELETE",
            }).then(res => {
              if (!res.ok) throw new Error("Failed to delete session");
            });
            break;
        }
      } catch (error) {
        console.error("Error syncing operation", error);
        // Stop syncing on first error; will retry next time
        break;
      }
    }

    // If all operations succeeded, clear the queue
    clearQueue();

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
