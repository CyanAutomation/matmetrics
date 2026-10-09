'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSessions,
  getSessionFileIssues,
  getSessionListRefreshError,
  forceRefreshSessionList,
  initializeStorage,
  getSyncStatus,
  type SessionListRefreshError,
} from '@/lib/storage';
import type { JudoSession, SessionFileIssue } from '@/lib/types';
import { getGuestWorkspaceSummary } from '@/lib/guest-mode';

/**
 * Manages session data loading, sync status, and guest workspace info
 * Handles storage initialization, listener setup, and periodic sync updates
 */
export function useSessionsData(deps: {
  userId?: string | null;
  authMode?: string;
  authReady: boolean;
  preferencesReady: boolean;
}) {
  const contextKey = JSON.stringify([
    deps.userId?.trim() ?? '',
    deps.authMode ?? 'guest',
  ]);
  const lastForcedRefreshContextRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<JudoSession[]>([]);
  const [loadedContextKey, setLoadedContextKey] = useState<string | null>(null);
  const [sessionFileIssues, setSessionFileIssues] = useState<
    SessionFileIssue[]
  >([]);
  const [sessionListRefreshError, setSessionListRefreshError] = useState<
    SessionListRefreshError | null
  >(getSessionListRefreshError());
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [guestWorkspace, setGuestWorkspace] = useState(() =>
    getGuestWorkspaceSummary()
  );

  const refreshSessions = useCallback(() => {
    setSessions(getSessions());
    setSessionFileIssues(getSessionFileIssues());
    setSessionListRefreshError(getSessionListRefreshError());
    setSyncStatus(getSyncStatus());
    setGuestWorkspace(getGuestWorkspaceSummary());
    setLoadedContextKey(contextKey);
  }, [contextKey]);

  const retrySessionListRefresh = useCallback(
    () => forceRefreshSessionList(),
    []
  );

  useEffect(() => {
    if (!deps.authReady || !deps.preferencesReady) return;

    initializeStorage();
    refreshSessions();

    if (
      deps.authMode !== 'guest' &&
      deps.userId &&
      lastForcedRefreshContextRef.current !== contextKey
    ) {
      lastForcedRefreshContextRef.current = contextKey;
      void forceRefreshSessionList();
    }

    const handleStorageSync = () => {
      refreshSessions();
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key?.startsWith('matmetrics_sessions:')) {
        refreshSessions();
      }
    };

    window.addEventListener('storageSync', handleStorageSync);
    window.addEventListener('storage', handleStorageChange);

    const statusInterval = setInterval(() => {
      setSyncStatus(getSyncStatus());
    }, 500);

    return () => {
      window.removeEventListener('storageSync', handleStorageSync);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(statusInterval);
    };
  }, [
    contextKey,
    deps.authMode,
    deps.authReady,
    deps.preferencesReady,
    deps.userId,
    refreshSessions,
  ]);

  const isCurrentContextLoaded = loadedContextKey === contextKey;

  return {
    sessions: isCurrentContextLoaded ? sessions : [],
    sessionFileIssues: isCurrentContextLoaded ? sessionFileIssues : [],
    sessionListRefreshError: isCurrentContextLoaded
      ? sessionListRefreshError
      : null,
    syncStatus,
    guestWorkspace,
    refreshSessions,
    retrySessionListRefresh,
  };
}
