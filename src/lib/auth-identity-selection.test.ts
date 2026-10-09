import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUserScopedValueReady,
  selectActiveAuthIdentity,
  selectUserScopedValue,
} from './auth-identity-selection';
import type { AuthenticatedUser } from './types';

const firebaseUser: AuthenticatedUser = {
  uid: 'firebase-user',
  email: 'athlete@example.com',
  displayName: 'Athlete',
  photoURL: null,
};

const passkeyUser: AuthenticatedUser = {
  uid: 'passkey-user',
  email: 'athlete@example.com',
  displayName: 'Athlete',
  photoURL: null,
};

test('Firebase is selected when Better Auth is explicitly disabled', () => {
  assert.deepEqual(
    selectActiveAuthIdentity({
      betterAuthEnabled: false,
      betterAuthState: 'unavailable',
      betterAuthUser: passkeyUser,
      firebaseUser,
    }),
    {
      status: 'authenticated',
      provider: 'firebase',
      user: firebaseUser,
    }
  );
});

test('a pending Better Auth session does not expose a Firebase identity', () => {
  assert.deepEqual(
    selectActiveAuthIdentity({
      betterAuthEnabled: true,
      betterAuthState: 'pending',
      betterAuthUser: null,
      firebaseUser,
    }),
    { status: 'pending', provider: null, user: null }
  );
});

test('a Better Auth outage does not silently select Firebase', () => {
  assert.deepEqual(
    selectActiveAuthIdentity({
      betterAuthEnabled: true,
      betterAuthState: 'unavailable',
      betterAuthUser: null,
      firebaseUser,
    }),
    { status: 'unavailable', provider: null, user: null }
  );
});

test('a confirmed anonymous Better Auth session selects Firebase', () => {
  assert.deepEqual(
    selectActiveAuthIdentity({
      betterAuthEnabled: true,
      betterAuthState: 'anonymous',
      betterAuthUser: null,
      firebaseUser,
    }),
    {
      status: 'authenticated',
      provider: 'firebase',
      user: firebaseUser,
    }
  );
});

test('matching provider sessions select the canonical Better Auth identity', () => {
  const sameUser = { ...firebaseUser, uid: 'canonical-id' };
  assert.deepEqual(
    selectActiveAuthIdentity({
      betterAuthEnabled: true,
      betterAuthState: 'authenticated',
      betterAuthUser: sameUser,
      firebaseUser: sameUser,
    }),
    {
      status: 'authenticated',
      provider: 'better-auth',
      user: sameUser,
    }
  );
});

test('different provider identities fail closed instead of changing accounts', () => {
  assert.deepEqual(
    selectActiveAuthIdentity({
      betterAuthEnabled: true,
      betterAuthState: 'authenticated',
      betterAuthUser: passkeyUser,
      firebaseUser,
    }),
    { status: 'conflict', provider: null, user: null }
  );
});

test('no provider session selects guest mode', () => {
  assert.deepEqual(
    selectActiveAuthIdentity({
      betterAuthEnabled: true,
      betterAuthState: 'anonymous',
      betterAuthUser: null,
      firebaseUser: null,
    }),
    { status: 'guest', provider: null, user: null }
  );
});

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
