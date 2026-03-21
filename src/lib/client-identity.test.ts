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

test('client identity isolates storage across guest and multiple authenticated users', () => {
  const storage = new Map<string, string>();
  const baseKey = 'matmetrics_sessions';

  setActiveUserId(null);
  assert.equal(getActiveUserId(), GUEST_USER_ID);
  assert.equal(isGuestMode(), true);
  assert.equal(isGuestUserId(undefined), true);

  const guestScopedKey = getScopedStorageKey(baseKey);
  assert.equal(guestScopedKey, `${baseKey}:${GUEST_USER_ID}`);
  storage.set(guestScopedKey, 'guest-session');

  setActiveUserId('user-123');
  assert.equal(getActiveUserId(), 'user-123');
  assert.equal(isGuestMode(), false);

  const user123ScopedKey = getScopedStorageKey(baseKey);
  assert.equal(user123ScopedKey, getScopedStorageKeyForUser(baseKey, 'user-123'));
  assert.equal(storage.get(user123ScopedKey), undefined);
  storage.set(user123ScopedKey, 'user-123-session');

  setActiveUserId('other-user');
  const otherUserScopedKey = getScopedStorageKey(baseKey);

  assert.notEqual(otherUserScopedKey, guestScopedKey);
  assert.notEqual(otherUserScopedKey, user123ScopedKey);
  assert.equal(storage.get(otherUserScopedKey), undefined);

  storage.set(otherUserScopedKey, 'other-user-session');

  assert.equal(storage.get(guestScopedKey), 'guest-session');
  assert.equal(storage.get(user123ScopedKey), 'user-123-session');
  assert.equal(storage.get(otherUserScopedKey), 'other-user-session');
});
