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
const GUEST_DISMISS_SALT_KEY = 'matmetrics_guest_dismiss_salt';

type GuestWorkspaceSource = 'demo' | 'custom';

type GuestWorkspaceMeta = {
  source: GuestWorkspaceSource;
  /**
   * List of per-user dismiss keys derived from the authenticated user ID.
   * These are salted, non-reversible identifiers local to this browser.
   */
  importDismissedBy: string[];
};

function getDismissSalt(): string {
  if (typeof window === 'undefined') {
    // During SSR there is no localStorage; use a constant so logic still works,
    // but nothing is persisted.
    return 'server-side-guest-dismiss-salt';
  }

  const existing = window.localStorage.getItem(GUEST_DISMISS_SALT_KEY);
  if (existing) {
    return existing;
  }

  // Generate a random salt once per browser profile.
  const randomSalt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  window.localStorage.setItem(GUEST_DISMISS_SALT_KEY, randomSalt);
  return randomSalt;
}

function getDismissKeyForUser(userId: string): string {
  const salt = getDismissSalt();
  const input = `${salt}:${userId}`;

  // Simple deterministic hash (FNV-1a style) to avoid storing the raw userId.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }

  return hash.toString(16);
}

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

function writeGuestSessions(sessions: JudoSession[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(getGuestSessionsStorageKey(), JSON.stringify(sessions));
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

  const dismissKey = getDismissKeyForUser(userId);
  if (meta.importDismissedBy.includes(dismissKey)) {
    return false;
  }

  return readGuestSessions().length > 0;
}

export function dismissGuestImport(userId: string): void {
  const meta = readGuestWorkspaceMeta();
  const dismissKey = getDismissKeyForUser(userId);
  if (meta.importDismissedBy.includes(dismissKey)) {
    return;
  }

  writeGuestWorkspaceMeta({
    ...meta,
    importDismissedBy: [...meta.importDismissedBy, dismissKey],
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

export function retainGuestSessionsAfterPartialImport(
  sessions: JudoSession[]
): void {
  if (typeof window === 'undefined') {
    return;
  }

  writeGuestSessions(sessions);

  if (sessions.length === 0) {
    localStorage.removeItem(GUEST_WORKSPACE_META_KEY);
    localStorage.removeItem(getGuestQueueStorageKey());
    return;
  }

  writeGuestWorkspaceMeta({
    source: 'custom',
    importDismissedBy: [],
  });
}
