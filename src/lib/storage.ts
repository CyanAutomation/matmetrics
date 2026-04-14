'use client';

import {
  JudoSession,
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
const DEFAULT_SYNC_LOCK_TTL_MS = 45_000;
const MIN_SYNC_LOCK_TTL_MS = 1_000;
const DEFAULT_SYNC_LOCK_HEARTBEAT_MS = 5_000;
const MIN_SYNC_LOCK_HEARTBEAT_MS = 1_000;
const DEFAULT_GITHUB_REFRESH_COOLDOWN_MS = 30_000;
const DEFAULT_GITHUB_REFRESH_DEBOUNCE_MS = 750;

// Add log state to prevent spam
const logState = new Map<string, { count: number; lastLogged: number }>();

function logOnce(category: string, message: string, error?: unknown): void {
  const now = Date.now();
  const existing = logState.get(category);
  
  if (!existing || (now - existing.lastLogged) > 60_000) {
    console.log(`[${category}] ${message}`);
    if (error) {
      console.error(`[${category}] Details:`, error);
    }
    logState.set(category, { count: 1, lastLogged: now });
  } else {
    existing.count++;
    existing.lastLogged = now;
  }
}

function logWithBackoff(category: string, message: string, error?: unknown): void {
  const now = Date.now();
  const existing = logState.get(category);
  const backoffMs = Math.min(300_000, 1000 * Math.pow(2, (existing?.count || 0)));
  
  if (!existing || (now - existing.lastLogged) > backoffMs) {
    console.log(`[${category}] ${message}`);
    if (error) {
      console.error(`[${category}] Details:`, error);
    }
    logState.set(category, { count: (existing?.count || 0) + 1, lastLogged: now });
  }
}

function isAuthConfigAvailable(): boolean {
  try {
    const auth = getFirebaseAuth();
    if (!auth) {
      return false;
    }
    
    // Check if we have a current user or if auth is properly configured
    if (auth.currentUser) {
      return true;
    }
    
    // Try to detect if Firebase is configured by checking for app
    return !!auth.app;
  } catch (error) {
    logOnce('auth-config-error', 'Firebase authentication configuration check failed', error);
    return false;
  }
}

function isAPIEndpointAvailable(): boolean {
  // Simple check if we're in a browser environment with access to fetch
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return false;
  }
  
  // Check if we have a valid origin
  if (!window.location.origin) {
    return false;
  }
  
  return true;
}

function checkAuthPrerequisites(): boolean {
  // Check if Firebase config is available
  if (!isAuthConfigAvailable()) {
    logOnce('auth-unavailable', 'Firebase client configuration unavailable, skipping refresh');
    return false;
  }
  
  // Check if API endpoint is accessible
  if (!isAPIEndpointAvailable()) {
    logOnce('api-unavailable', 'API endpoint unavailable, skipping refresh');
    return false;
  }
  
  return true;
}

// Rest of the existing storage code with modifications to refreshSessionsFromAPI

// Modified refreshSessionsFromAPI function with early checks
async function refreshSessionsFromAPI(options?: {
  force?: boolean;
}): Promise<void> {
  if (typeof window === 'undefined' || !isOnline || isGuestMode()) return;
  
  // Early exit: Check prerequisites before attempting auth/network calls
  if (!checkAuthPrerequisites()) {
    return;
  }
  
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

      // This will now only be called after prerequisites are checked
      const headers = await getAuthHeaders();
      const res = await fetch(url.toString(), { headers });
      
      if (!res.ok) {
        logWithBackoff('api-refresh-failure', `Skipping cache refresh from /api/sessions/list due to non-OK status ${res.status}`);
        return;
      }

      const payload = await res.json();
      const sessions: JudoSession[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.sessions)
          ? payload.sessions
          : [];
      const sessionFileIssues: SessionFileIssue[] = Array.isArray(
        payload?.issues
      )
        ? payload.issues
        : [];
      if (!isStorageGenerationCurrent(generation)) {
        return;
      }
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
      lastSuccessfulRemoteRefreshAt = Date.now();
      sessionFileIssuesCache = sessionFileIssues;
      commitLocalSessions(mergedSessions);
      dispatchStorageSync(mergedSessions);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Firebase client configuration is missing')) {
        logOnce('auth-failure', 'Failed to read Firebase ID token - client configuration missing');
      } else if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        logWithBackoff('network-failure', `Error refreshing sessions from API - connection refused: ${error.message}`);
      } else {
        logWithBackoff('refresh-failure', 'Unexpected error refreshing sessions from API', error);
      }
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

// Export helper functions for testing
export function __getLogState(): Map<string, { count: number; lastLogged: number }> {
  return logState;
}

export function __resetLogState(): void {
  logState.clear();
}
