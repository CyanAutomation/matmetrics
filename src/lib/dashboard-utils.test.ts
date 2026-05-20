import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getUserInitials,
  getGuestBadgeLabel,
  getSyncStatusText,
  getGuestWorkspaceDescription,
  getGuestModeAlertMessage,
  getSignInButtonText,
} from './dashboard-utils';
import type { SyncStatus } from '@/lib/sync-queue';

test('dashboard utilities - user initials generation', async (t) => {
  await t.test('generates initials from display name', () => {
    const initials = getUserInitials('John Doe', 'john@example.com', false);
    assert.equal(initials, 'JD');
  });

  await t.test('generates initials from email when display name is unavailable', () => {
    const initials = getUserInitials(null, 'alice.evans@example.com', false);
    assert.equal(initials, 'AE');
  });

  await t.test('uses guest label when both display name and email are unavailable in guest mode', () => {
    const initials = getUserInitials(null, null, true);
    assert.equal(initials, 'G');
  });

  await t.test('uses MM default when both display name and email are unavailable in non-guest mode', () => {
    const initials = getUserInitials(null, null, false);
    assert.equal(initials, 'MM');
  });

  await t.test('handles single-word display names', () => {
    const initials = getUserInitials('Alice', 'alice@example.com', false);
    assert.equal(initials, 'A');
  });

  await t.test('limits initials to 2 characters maximum', () => {
    const initials = getUserInitials('John Michael Doe', 'john@example.com', false);
    assert.equal(initials.length, 2);
    assert.equal(initials, 'JM');
  });

  await t.test('converts initials to uppercase', () => {
    const initials = getUserInitials('john doe', 'john@example.com', false);
    assert.equal(initials, 'JD');
  });

  await t.test('handles email with multiple domains correctly', () => {
    const initials = getUserInitials(null, 'john.doe@subdomain.example.com', false);
    assert.equal(initials, 'JD');
  });
});

test('dashboard utilities - guest badge label', async (t) => {
  await t.test('returns guest workspace label for custom source', () => {
    const label = getGuestBadgeLabel('custom');
    assert.equal(label, 'Guest Workspace');
  });

  await t.test('returns demo preview label for demo source', () => {
    const label = getGuestBadgeLabel('demo');
    assert.equal(label, 'Demo Preview');
  });
});

test('dashboard utilities - sync status text generation', async (t) => {
  await t.test('returns offline when not online', () => {
    const status: SyncStatus = {
      isOnline: false,
      isSyncing: false,
      pendingCount: 0,
    };
    assert.equal(getSyncStatusText(status), 'Offline');
  });

  await t.test('returns syncing when actively syncing', () => {
    const status: SyncStatus = {
      isOnline: true,
      isSyncing: true,
      pendingCount: 0,
    };
    assert.equal(getSyncStatusText(status), 'Syncing');
  });

  await t.test('returns pending count when online but not syncing with pending items', () => {
    const status: SyncStatus = {
      isOnline: true,
      isSyncing: false,
      pendingCount: 3,
    };
    assert.equal(getSyncStatusText(status), '3 pending');
  });

  await t.test('returns synced when online with no pending items', () => {
    const status: SyncStatus = {
      isOnline: true,
      isSyncing: false,
      pendingCount: 0,
    };
    assert.equal(getSyncStatusText(status), 'Synced');
  });

  await t.test('prioritizes offline status over syncing', () => {
    const status: SyncStatus = {
      isOnline: false,
      isSyncing: true,
      pendingCount: 5,
    };
    assert.equal(getSyncStatusText(status), 'Offline');
  });

  await t.test('prioritizes syncing status over pending count', () => {
    const status: SyncStatus = {
      isOnline: true,
      isSyncing: true,
      pendingCount: 3,
    };
    assert.equal(getSyncStatusText(status), 'Syncing');
  });

  await t.test('handles single pending item correctly', () => {
    const status: SyncStatus = {
      isOnline: true,
      isSyncing: false,
      pendingCount: 1,
    };
    assert.equal(getSyncStatusText(status), '1 pending');
  });

  await t.test('handles large pending counts', () => {
    const status: SyncStatus = {
      isOnline: true,
      isSyncing: false,
      pendingCount: 42,
    };
    assert.equal(getSyncStatusText(status), '42 pending');
  });
});

test('dashboard utilities - guest workspace description', async (t) => {
  await t.test('returns custom description for custom source', () => {
    const desc = getGuestWorkspaceDescription('custom');
    assert.equal(desc, 'Local guest data');
  });

  await t.test('returns demo description for demo source', () => {
    const desc = getGuestWorkspaceDescription('demo');
    assert.equal(desc, 'Demo data loaded');
  });
});

test('dashboard utilities - guest mode alert message', async (t) => {
  await t.test('returns custom workspace message with auth available', () => {
    const message = getGuestModeAlertMessage('custom', true);
    assert.match(message, /sign in to unlock/i);
    assert.match(message, /AI tools, GitHub sync/);
  });

  await t.test('returns custom workspace message without auth available', () => {
    const message = getGuestModeAlertMessage('custom', false);
    assert.match(message, /logging sessions locally/);
    assert.match(message, /Sign-in is not available/);
  });

  await t.test('returns demo workspace message with auth available', () => {
    const message = getGuestModeAlertMessage('demo', true);
    assert.match(message, /seeded preview workspace/);
    assert.match(message, /turn it into your own/);
  });

  await t.test('returns demo workspace message without auth available', () => {
    const message = getGuestModeAlertMessage('demo', false);
    assert.match(message, /seeded preview workspace/);
  });
});

test('dashboard utilities - sign in button text', async (t) => {
  await t.test('returns unlock button text when auth is available', () => {
    const text = getSignInButtonText(true);
    assert.equal(text, 'Sign in to unlock more');
  });

  await t.test('returns setup button text when auth is not available', () => {
    const text = getSignInButtonText(false);
    assert.equal(text, 'View sign-in setup');
  });
});
