import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  GUEST_USER_ID,
  getActiveUserId,
  getScopedStorageKey,
  getScopedStorageKeyForUser,
  isGuestMode,
  isGuestUserId,
  setActiveUserId,
} from './client-identity';

beforeEach(() => {
  setActiveUserId(GUEST_USER_ID);
});

afterEach(() => {
  setActiveUserId(GUEST_USER_ID);
});

test('guest normalization (null/undefined/blank -> guest)', () => {
  setActiveUserId(null);
  assert.equal(getActiveUserId(), GUEST_USER_ID);

  setActiveUserId(undefined);
  assert.equal(getActiveUserId(), GUEST_USER_ID);

  setActiveUserId('');
  assert.equal(getActiveUserId(), GUEST_USER_ID);

  setActiveUserId('   ');
  assert.equal(getActiveUserId(), GUEST_USER_ID);

  assert.equal(isGuestUserId(null), true);
  assert.equal(isGuestUserId(undefined), true);
  assert.equal(isGuestUserId(''), true);
  assert.equal(isGuestUserId('   '), true);
});

test('active user switching', () => {
  assert.equal(getActiveUserId(), GUEST_USER_ID);

  setActiveUserId('user-123');
  assert.equal(getActiveUserId(), 'user-123');

  setActiveUserId('other-user');
  assert.equal(getActiveUserId(), 'other-user');

  setActiveUserId(' user-456 ');
  assert.equal(getActiveUserId(), 'user-456');
});

test('scoped key generation for explicit user', () => {
  const baseKey = 'matmetrics_sessions';

  assert.equal(
    getScopedStorageKeyForUser(baseKey, 'user-123'),
    `${baseKey}:user-123`
  );
  assert.equal(
    getScopedStorageKeyForUser(baseKey, ' user-123 '),
    `${baseKey}:user-123`
  );
  assert.equal(
    getScopedStorageKeyForUser(baseKey, null),
    `${baseKey}:${GUEST_USER_ID}`
  );

  setActiveUserId('other-user');
  assert.equal(getScopedStorageKey(baseKey), `${baseKey}:other-user`);
});

test('guest-mode predicate behavior', () => {
  assert.equal(isGuestMode(), true);

  setActiveUserId('user-123');
  assert.equal(isGuestMode(), false);

  setActiveUserId('   ');
  assert.equal(isGuestMode(), true);

  setActiveUserId(undefined);
  assert.equal(isGuestMode(), true);
});
