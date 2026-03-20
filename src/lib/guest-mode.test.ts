import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_SESSIONS } from './demo-sessions';
import { setActiveUserId } from './client-identity';
import {
  clearGuestWorkspaceAfterImport,
  dismissGuestImport,
  ensureGuestWorkspaceSeeded,
  getGuestSessionsForImport,
  getGuestWorkspaceSummary,
  markGuestWorkspaceCustom,
  shouldPromptGuestImport,
} from './guest-mode';

class LocalStorageMock {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

function installBrowserStorage() {
  const localStorage = new LocalStorageMock();

  Object.assign(globalThis, {
    window: globalThis,
    localStorage,
  });

  return localStorage;
}

function assertSessionsSortedNewestFirst() {
  for (let index = 1; index < DEMO_SESSIONS.length; index += 1) {
    const previous = DEMO_SESSIONS[index - 1].date;
    const current = DEMO_SESSIONS[index].date;
    assert.equal(previous >= current, true);
  }
}

function getDemoCategoryCounts() {
  return DEMO_SESSIONS.reduce<Record<string, number>>((counts, session) => {
    counts[session.category] = (counts[session.category] || 0) + 1;
    return counts;
  }, {});
}

function getDemoTechniqueCounts() {
  return DEMO_SESSIONS.reduce<Record<string, number>>((counts, session) => {
    session.techniques.forEach((technique) => {
      counts[technique] = (counts[technique] || 0) + 1;
    });
    return counts;
  }, {});
}

test('guest workspace seeds demo data the first time guest mode initializes', () => {
  const localStorage = installBrowserStorage();
  setActiveUserId('guest');

  ensureGuestWorkspaceSeeded();

  assert.equal(DEMO_SESSIONS.length, 12);
  assertSessionsSortedNewestFirst();
  assert.deepEqual(getGuestSessionsForImport(), DEMO_SESSIONS);
  assert.deepEqual(getGuestWorkspaceSummary(), {
    source: 'demo',
    sessions: DEMO_SESSIONS,
  });

  localStorage.clear();
});

test('demo sessions are intentionally uneven enough to feel realistic', () => {
  const categoryCounts = Object.values(getDemoCategoryCounts()).sort(
    (left, right) => right - left
  );
  const techniqueCounts = Object.entries(getDemoTechniqueCounts()).sort(
    (left, right) => right[1] - left[1]
  );

  assert.equal(categoryCounts[0] === categoryCounts[1], false);
  assert.equal(techniqueCounts[0][1] > 1, true);
  assert.equal(techniqueCounts[0][1] > techniqueCounts[4][1], true);
});

test('guest workspace becomes importable after local edits and can be dismissed', async () => {
  const localStorage = installBrowserStorage();
  setActiveUserId('guest');

  ensureGuestWorkspaceSeeded();
  markGuestWorkspaceCustom();

  assert.equal(await shouldPromptGuestImport('user-1'), true);

  await dismissGuestImport('user-1');

  assert.equal(await shouldPromptGuestImport('user-1'), false);
  assert.equal(await shouldPromptGuestImport('user-2'), true);

  localStorage.clear();
});

test('clearing guest workspace removes guest sessions and metadata', () => {
  const localStorage = installBrowserStorage();
  setActiveUserId('guest');

  ensureGuestWorkspaceSeeded();
  markGuestWorkspaceCustom();
  clearGuestWorkspaceAfterImport();

  assert.deepEqual(getGuestSessionsForImport(), []);
  assert.deepEqual(getGuestWorkspaceSummary(), {
    source: 'demo',
    sessions: [],
  });

  localStorage.clear();
});
