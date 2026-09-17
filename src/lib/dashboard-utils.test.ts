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
  // Dashboard/profile-display requirement: show compact, uppercase initials with
  // identity fallbacks that distinguish guest and authenticated users.
  const cases = [
    {
      label: 'display-name: derives initials from the preferred display name',
      displayName: 'John Doe',
      email: 'john@example.com',
      isGuest: false,
      expected: 'JD',
    },
    {
      label: 'single-word-display-name: handles single-word display names',
      displayName: 'Alice',
      email: 'alice@example.com',
      isGuest: false,
      expected: 'A',
    },
    {
      label: 'email-fallback: uses the email when the display name is absent',
      displayName: null,
      email: 'alice@example.com',
      isGuest: false,
      expected: 'A',
    },
    {
      label: 'separator: treats email username separators as word boundaries',
      displayName: null,
      email: 'alice.evans@example.com',
      isGuest: false,
      expected: 'AE',
    },
    {
      label: 'case-normalization: converts lowercase initials to uppercase',
      displayName: 'john doe',
      email: 'john@example.com',
      isGuest: false,
      expected: 'JD',
    },
    {
      label: 'maximum-length: limits initials to two characters',
      displayName: 'John Michael Doe',
      email: 'john@example.com',
      isGuest: false,
      expected: 'JM',
    },
    {
      label: 'guest-default: identifies a guest without profile details',
      displayName: null,
      email: null,
      isGuest: true,
      expected: 'G',
    },
    {
      label: 'authenticated-default: identifies a user without profile details',
      displayName: null,
      email: null,
      isGuest: false,
      expected: 'MM',
    },
  ];

  for (const { label, displayName, email, isGuest, expected } of cases) {
    await t.test(label, () => {
      assert.equal(getUserInitials(displayName, email, isGuest), expected);
    });
  }
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

  const pendingCountCases = [
    { pendingCount: 0, expected: 'Synced' },
    { pendingCount: 1, expected: '1 pending' },
    { pendingCount: 2, expected: '2 pending' },
  ];

  for (const { pendingCount, expected } of pendingCountCases) {
    await t.test(
      `returns ${expected} for a pending count of ${pendingCount}`,
      () => {
        const status: SyncStatus = {
          isOnline: true,
          isSyncing: false,
          pendingCount,
        };
        assert.equal(getSyncStatusText(status), expected);
      }
    );
  }

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

  await t.test(
    'returns custom workspace message without auth available',
    () => {
      const message = getGuestModeAlertMessage('custom', false);
      assert.match(message, /logging sessions locally/);
      assert.match(message, /Sign-in is not available/);
    }
  );

  await t.test('keeps demo product copy independent of authentication', () => {
    const authenticatedMessage = getGuestModeAlertMessage('demo', true);
    const unauthenticatedMessage = getGuestModeAlertMessage('demo', false);

    assert.equal(
      authenticatedMessage,
      'You are browsing a seeded preview workspace. Start editing to turn it into your own local guest workspace.'
    );
    assert.equal(authenticatedMessage, unauthenticatedMessage);
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
