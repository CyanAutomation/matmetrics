import assert from 'node:assert/strict';
import test from 'node:test';
import { isPasskeyRegistrationAllowed } from './passkey-policy';

test('enrolment and public signup have independent registration controls', () => {
  const pilotPolicy = { enrolmentEnabled: true, signupEnabled: false };

  assert.equal(
    isPasskeyRegistrationAllowed('firebase-enrolment', pilotPolicy),
    true
  );
  assert.equal(
    isPasskeyRegistrationAllowed('authenticated-enrolment', pilotPolicy),
    true
  );
  assert.equal(isPasskeyRegistrationAllowed('new-account', pilotPolicy), false);
});

test('disabling enrolment does not depend on the public signup setting', () => {
  const policy = { enrolmentEnabled: false, signupEnabled: true };

  assert.equal(
    isPasskeyRegistrationAllowed('firebase-enrolment', policy),
    false
  );
  assert.equal(isPasskeyRegistrationAllowed('new-account', policy), true);
});
