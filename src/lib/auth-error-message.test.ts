import assert from 'node:assert/strict';
import test from 'node:test';

import { getAuthErrorMessage } from './auth-error-message';

test('network authentication failures use clear retry guidance', () => {
  assert.equal(
    getAuthErrorMessage(new Error('Firebase: Error (auth/network-request-failed).')),
    'Unable to reach the sign-in service. Check your connection and try again.'
  );
});

test('authentication failures preserve provider guidance and use a fallback for unknown errors', () => {
  assert.equal(
    getAuthErrorMessage(new Error('The password is incorrect.')),
    'The password is incorrect.'
  );
  assert.equal(
    getAuthErrorMessage(null, 'Could not sign in with a passkey. Please try again.'),
    'Could not sign in with a passkey. Please try again.'
  );
});
