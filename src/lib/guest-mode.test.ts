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

test('demo sessions fixture enforces stable product invariants', () => {
  const allowedCategories = new Set(['Technical', 'Randori', 'Shiai']);
  const allowedEffortLevels = new Set([1, 2, 3, 4, 5]);

  DEMO_SESSIONS.forEach((session) => {
    assert.equal(typeof session.id, 'string');
    assert.equal(session.id.length > 0, true);
    assert.equal(typeof session.date, 'string');
    assert.match(session.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(allowedCategories.has(session.category), true);
    assert.equal(allowedEffortLevels.has(session.effort), true);
    assert.equal(Array.isArray(session.techniques), true);
    assert.equal(session.techniques.length > 0, true);
  });

  assert.equal(new Set(DEMO_SESSIONS.map((session) => session.id)).size, DEMO_SESSIONS.length);
  assertSessionsSortedNewestFirst();
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
