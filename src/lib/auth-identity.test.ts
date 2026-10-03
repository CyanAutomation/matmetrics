import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertIdentityLinkAllowed,
  betterAuthIdentityForUser,
  firebaseIdentityForUid,
  IdentityLinkConflictError,
} from '@/lib/auth-identity';

test('Firebase UID keeps the existing canonical MatMetrics user ID', () => {
  const identity = firebaseIdentityForUid('legacy-firebase-uid');
  assert.deepEqual(identity, {
    appUserId: 'legacy-firebase-uid',
    provider: 'firebase',
    providerSubject: 'legacy-firebase-uid',
  });
});

test('Better Auth identity links to the same canonical user as Firebase', () => {
  const firebase = firebaseIdentityForUid('legacy-firebase-uid');
  const betterAuth = betterAuthIdentityForUser(firebase.appUserId);

  assert.equal(betterAuth.appUserId, firebase.appUserId);
  assert.equal(betterAuth.provider, 'better-auth');
  assert.equal(betterAuth.providerSubject, firebase.appUserId);
});

test('an authentication subject already mapped to another user cannot be claimed', () => {
  const identity = firebaseIdentityForUid('existing-subject');

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
