import assert from 'node:assert/strict';
import test from 'node:test';
import { isPasskeyRegistrationAllowed } from './passkey-policy';

test('passkey registration is available only when authenticated enrolment is enabled', () => {
  assert.equal(isPasskeyRegistrationAllowed({ enrolmentEnabled: true }), true);
  assert.equal(isPasskeyRegistrationAllowed({ enrolmentEnabled: false }), false);
});
