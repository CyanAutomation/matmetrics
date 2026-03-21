import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GUEST_USER_ID,
  getActiveUserId,
  getScopedStorageKey,
  getScopedStorageKeyForUser,
  isGuestMode,
  isGuestUserId,
  setActiveUserId,
} from './client-identity';

test('client identity falls back to guest scope when no user is active', () => {
  setActiveUserId(null);

  assert.equal(getActiveUserId(), GUEST_USER_ID);
  assert.equal(isGuestMode(), true);
  assert.equal(isGuestUserId(undefined), true);

  const guestKey = getScopedStorageKey('matmetrics_sessions');

  assert.equal(
    guestKey,
    getScopedStorageKeyForUser('matmetrics_sessions', GUEST_USER_ID)
  );
});

test('client identity isolates guest-scoped and user-scoped storage reads/writes', () => {
  const storage = new Map<string, string>();
  const baseKey = 'matmetrics_sessions';

  setActiveUserId(null);
  const guestScopedKey = getScopedStorageKey(baseKey);
  storage.set(guestScopedKey, 'guest-session');

  setActiveUserId('user-123');
  const userScopedKey = getScopedStorageKey(baseKey);

  assert.notEqual(userScopedKey, guestScopedKey);
  assert.equal(storage.get(userScopedKey), undefined);

  storage.set(userScopedKey, 'user-session');

  assert.equal(storage.get(guestScopedKey), 'guest-session');
  assert.equal(storage.get(userScopedKey), 'user-session');
  assert.equal(isGuestMode(), false);
});
