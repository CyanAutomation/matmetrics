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

test('guest workspace seeds demo data the first time guest mode initializes', () => {
  const localStorage = installBrowserStorage();
  setActiveUserId('guest');

  ensureGuestWorkspaceSeeded();

  assert.deepEqual(getGuestSessionsForImport(), DEMO_SESSIONS);
  assert.deepEqual(getGuestWorkspaceSummary(), {
    source: 'demo',
    sessions: DEMO_SESSIONS,
  });

  localStorage.clear();
});

test('guest workspace becomes importable after local edits and can be dismissed', () => {
  const localStorage = installBrowserStorage();
  setActiveUserId('guest');

  ensureGuestWorkspaceSeeded();
  markGuestWorkspaceCustom();

  assert.equal(shouldPromptGuestImport('user-1'), true);

  dismissGuestImport('user-1');

  assert.equal(shouldPromptGuestImport('user-1'), false);
  assert.equal(shouldPromptGuestImport('user-2'), true);

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
