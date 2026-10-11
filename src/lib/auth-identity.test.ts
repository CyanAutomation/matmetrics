import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertIdentityLinkAllowed,
  betterAuthIdentityForUser,
  IdentityLinkConflictError,
} from '@/lib/auth-identity';

test('Better Auth keeps the canonical MatMetrics account ID', () => {
  assert.deepEqual(betterAuthIdentityForUser('canonical-id'), {
    appUserId: 'canonical-id',
    provider: 'better-auth',
    providerSubject: 'canonical-id',
  });
});

test('an authentication subject already mapped to another user cannot be claimed', () => {
  const identity = betterAuthIdentityForUser('canonical-id');
  assert.throws(
    () => assertIdentityLinkAllowed(identity, 'different-app-user'),
    IdentityLinkConflictError
  );
});

test('the same identity can be linked idempotently to its canonical user', () => {
  const identity = betterAuthIdentityForUser('canonical-id');
  assert.doesNotThrow(() =>
    assertIdentityLinkAllowed(identity, 'canonical-id')
  );
});
