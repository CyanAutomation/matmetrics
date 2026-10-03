import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPasskeyRegistrationContext,
  PASSKEY_REGISTRATION_CONTEXT_TTL_SECONDS,
  verifyPasskeyRegistrationContext,
} from '@/lib/passkey-registration-context';

const secret = 'local-test-registration-context-secret-0123456789';
const baseClaims = {
  appUserId: 'legacy-firebase-uid',
  provider: 'firebase' as const,
  providerSubject: 'legacy-firebase-uid',
  email: 'Athlete@Example.com',
  name: '  Judo Athlete  ',
  emailVerified: true,
};

test('valid Firebase registration context preserves the canonical identity', async () => {
  const now = 1_800_000_000;
  const token = await createPasskeyRegistrationContext(baseClaims, secret, now);
  const claims = await verifyPasskeyRegistrationContext(token, secret, now);

  assert.equal(claims.appUserId, baseClaims.appUserId);
  assert.equal(claims.providerSubject, baseClaims.providerSubject);
  assert.equal(claims.email, 'athlete@example.com');
  assert.equal(claims.name, 'Judo Athlete');
  assert.equal(claims.emailVerified, true);
  assert.ok(claims.nonce);
});

test('expired registration context is rejected', async () => {
  const issuedAt = 1_800_000_000;
  const token = await createPasskeyRegistrationContext(
    baseClaims,
    secret,
    issuedAt
  );

  await assert.rejects(
    verifyPasskeyRegistrationContext(
      token,
      secret,
      issuedAt + PASSKEY_REGISTRATION_CONTEXT_TTL_SECONDS + 1
    ),
    /Invalid or expired passkey registration context/
  );
});

test('modified registration context cannot change the MatMetrics user', async () => {
  const token = await createPasskeyRegistrationContext(baseClaims, secret);
  const [header, payload, signature] = token.split('.');
  assert.ok(header && payload && signature);
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  claims.appUserId = 'another-user';
  const modified = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;

  await assert.rejects(
    verifyPasskeyRegistrationContext(modified, secret),
    /Invalid or expired passkey registration context/
  );
});

test('Firebase subject must equal the canonical user ID in a signed context', async () => {
  const token = await createPasskeyRegistrationContext(
    { ...baseClaims, providerSubject: 'another-firebase-uid' },
    secret
  );

  await assert.rejects(
    verifyPasskeyRegistrationContext(token, secret),
    /Invalid or expired passkey registration context/
  );
});
