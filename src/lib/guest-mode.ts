'use client';

import { DEMO_SESSIONS } from './demo-sessions';
import {
  GUEST_USER_ID,
  getScopedStorageKeyForUser,
  isGuestMode,
} from './client-identity';
import type { JudoSession } from './types';

const GUEST_WORKSPACE_META_KEY = 'matmetrics_guest_workspace_meta';
const SESSIONS_STORAGE_KEY_BASE = 'matmetrics_sessions';
const SYNC_QUEUE_KEY_BASE = 'matmetrics_sync_queue';

type GuestWorkspaceSource = 'demo' | 'custom';

type GuestWorkspaceMeta = {
  source: GuestWorkspaceSource;
  importDismissedBy: string[];
};

function getGuestSessionsStorageKey(): string {
  return getScopedStorageKeyForUser(SESSIONS_STORAGE_KEY_BASE, GUEST_USER_ID);
}

function getGuestQueueStorageKey(): string {
  return getScopedStorageKeyForUser(SYNC_QUEUE_KEY_BASE, GUEST_USER_ID);
}

function getDefaultGuestWorkspaceMeta(): GuestWorkspaceMeta {
  return {
    source: 'demo',
    importDismissedBy: [],
  };
}

function readGuestWorkspaceMeta(): GuestWorkspaceMeta {
  if (typeof window === 'undefined') {
    return getDefaultGuestWorkspaceMeta();
  }

  try {
    const stored = localStorage.getItem(GUEST_WORKSPACE_META_KEY);
    if (!stored) {
      return getDefaultGuestWorkspaceMeta();
    }

    const parsed = JSON.parse(stored) as Partial<GuestWorkspaceMeta>;
    return {
      source: parsed.source === 'custom' ? 'custom' : 'demo',
      importDismissedBy: Array.isArray(parsed.importDismissedBy)
        ? parsed.importDismissedBy.filter(
            (userId): userId is string => typeof userId === 'string'
          )
        : [],
    };
  } catch (error) {
    console.error('Failed to parse guest workspace metadata', error);
    return getDefaultGuestWorkspaceMeta();
  }
}

function writeGuestWorkspaceMeta(meta: GuestWorkspaceMeta): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(GUEST_WORKSPACE_META_KEY, JSON.stringify(meta));
}

function readGuestSessions(): JudoSession[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = localStorage.getItem(getGuestSessionsStorageKey());
    return stored ? (JSON.parse(stored) as JudoSession[]) : [];
  } catch (error) {
    console.error('Failed to parse guest sessions', error);
    return [];
  }
}

export function ensureGuestWorkspaceSeeded(): void {
  if (typeof window === 'undefined' || !isGuestMode()) {
    return;
  }

  const storageKey = getGuestSessionsStorageKey();
  if (localStorage.getItem(storageKey) !== null) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(DEMO_SESSIONS));
  writeGuestWorkspaceMeta(getDefaultGuestWorkspaceMeta());
}

export function markGuestWorkspaceCustom(): void {
  if (typeof window === 'undefined' || !isGuestMode()) {
    return;
  }

  const currentMeta = readGuestWorkspaceMeta();
  if (currentMeta.source === 'custom') {
    return;
  }

  writeGuestWorkspaceMeta({
    source: 'custom',
    importDismissedBy: [],
  });
}

export function getGuestWorkspaceSummary(): {
  source: GuestWorkspaceSource;
  sessions: JudoSession[];
} {
  return {
    source: readGuestWorkspaceMeta().source,
    sessions: readGuestSessions(),
  };
}

export function shouldPromptGuestImport(userId: string): boolean {
  const meta = readGuestWorkspaceMeta();
  if (meta.source !== 'custom') {
    return false;
  }

  if (meta.importDismissedBy.includes(userId)) {
    return false;
  }

  return readGuestSessions().length > 0;
}

export function dismissGuestImport(userId: string): void {
  const meta = readGuestWorkspaceMeta();
  if (meta.importDismissedBy.includes(userId)) {
    return;
  }

  writeGuestWorkspaceMeta({
    ...meta,
    importDismissedBy: [...meta.importDismissedBy, userId],
  });
}

export function getGuestSessionsForImport(): JudoSession[] {
  return readGuestSessions();
}

export function clearGuestWorkspaceAfterImport(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(getGuestSessionsStorageKey());
  localStorage.removeItem(getGuestQueueStorageKey());
  localStorage.removeItem(GUEST_WORKSPACE_META_KEY);
}
