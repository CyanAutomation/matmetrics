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
  assert.equal(getScopedStorageKey('matmetrics_sessions'), 'matmetrics_sessions:guest');
});

test('client identity scopes keys to the authenticated user id', () => {
  setActiveUserId('user-123');

  assert.equal(getActiveUserId(), 'user-123');
  assert.equal(isGuestMode(), false);
  assert.equal(
    getScopedStorageKey('matmetrics_sessions'),
    'matmetrics_sessions:user-123'
  );
  assert.equal(
    getScopedStorageKeyForUser('matmetrics_sessions', 'other-user'),
    'matmetrics_sessions:other-user'
  );
});
