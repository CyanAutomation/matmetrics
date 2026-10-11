import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUserScopedValueReady,
  selectUserScopedValue,
} from './auth-identity-selection';

test('account switches hide preferences owned by the previous identity', () => {
  const previousPreferences = { gitHubOwner: 'previous-account' };
  const defaults = { gitHubOwner: '' };

  assert.deepEqual(
    selectUserScopedValue({
      activeUserId: 'next-account',
      ownerUserId: 'previous-account',
      ready: true,
      value: previousPreferences,
      fallback: defaults,
    }),
    defaults
  );
});

test('preferences readiness belongs to the active identity, not the prior owner', () => {
  assert.equal(
    isUserScopedValueReady({
      activeUserId: 'next-account',
      ownerUserId: 'previous-account',
      ready: true,
    }),
    false
  );
  assert.equal(
    isUserScopedValueReady({
      activeUserId: 'active-account',
      ownerUserId: 'active-account',
      ready: true,
    }),
    true
  );
  assert.equal(
    isUserScopedValueReady({
      activeUserId: null,
      ownerUserId: null,
      ready: true,
    }),
    true
  );
});

test('preferences stay hidden until they are loaded for the active identity', () => {
  const previousPreferences = { gitHubOwner: 'previous-account' };
  const defaults = { gitHubOwner: '' };

  assert.deepEqual(
    selectUserScopedValue({
      activeUserId: 'active-account',
      ownerUserId: 'active-account',
      ready: false,
      value: previousPreferences,
      fallback: defaults,
    }),
    defaults
  );
  assert.deepEqual(
    selectUserScopedValue({
      activeUserId: 'active-account',
      ownerUserId: 'active-account',
      ready: true,
      value: { gitHubOwner: 'active-account' },
      fallback: defaults,
    }),
    { gitHubOwner: 'active-account' }
  );
});

test('guest mode does not receive a previously loaded account preference value', () => {
  const defaults = { gitHubOwner: '' };

  assert.deepEqual(
    selectUserScopedValue({
      activeUserId: null,
      ownerUserId: null,
      ready: true,
      value: { gitHubOwner: 'signed-in-account' },
      fallback: defaults,
    }),
    defaults
  );
});
