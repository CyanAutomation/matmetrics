'use client';

import { useState, useEffect, useCallback } from 'react';
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
export function useSessionsData(deps?: {
  userId?: string | null;
  authMode?: string;
}) {
  const [sessions, setSessions] = useState<JudoSession[]>([]);
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
  }, []);

  const retrySessionListRefresh = useCallback(
    () => forceRefreshSessionList(),
    []
  );

  useEffect(() => {
    initializeStorage();
    refreshSessions();

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
  }, [refreshSessions, deps?.userId, deps?.authMode]);

  return {
    sessions,
    sessionFileIssues,
    sessionListRefreshError,
    syncStatus,
    guestWorkspace,
    refreshSessions,
    retrySessionListRefresh,
  };
}
