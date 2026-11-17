import assert from 'node:assert/strict';
import test from 'node:test';
import { getTrustedAuthOriginConfiguration } from './trusted-auth-origins';

const productionConfig = {
  ENVIRONMENT: 'production',
  MATMETRICS_AUTH_PUBLIC_URL: 'https://matmetrics-teal.vercel.app',
  MATMETRICS_AUTH_FRONTEND_ORIGIN: 'https://matmetrics-teal.vercel.app',
  MATMETRICS_AUTH_RP_ID: 'matmetrics-teal.vercel.app',
};

test('preserves the current production origin and RP ID', () => {
  const config = getTrustedAuthOriginConfiguration(productionConfig);

  assert.equal(config.publicUrl, 'https://matmetrics-teal.vercel.app');
  assert.equal(config.rpId, 'matmetrics-teal.vercel.app');
  assert.deepEqual(config.trustedOrigins, ['https://matmetrics-teal.vercel.app']);
  assert.deepEqual(config.passkeyOrigins, ['https://matmetrics-teal.vercel.app']);
});

test('supports additional explicitly configured origins under the existing RP ID', () => {
  const config = getTrustedAuthOriginConfiguration({
    ...productionConfig,
    MATMETRICS_AUTH_ADDITIONAL_FRONTEND_ORIGINS:
      'https://companion.matmetrics-teal.vercel.app,https://auth.matmetrics-teal.vercel.app',
  });

  assert.deepEqual(config.trustedOrigins, [
    'https://matmetrics-teal.vercel.app',
    'https://companion.matmetrics-teal.vercel.app',
    'https://auth.matmetrics-teal.vercel.app',
  ]);
  assert.deepEqual(config.passkeyOrigins, config.trustedOrigins);
});

test('allows HTTP localhost only in explicit development configuration', () => {
  const config = getTrustedAuthOriginConfiguration({
    ENVIRONMENT: 'development',
    MATMETRICS_AUTH_PUBLIC_URL: 'http://localhost:9002',
    MATMETRICS_AUTH_FRONTEND_ORIGIN: 'http://localhost:9002',
    MATMETRICS_AUTH_RP_ID: 'localhost',
  });

  assert.deepEqual(config.trustedOrigins, ['http://localhost:9002']);
  assert.throws(
    () => getTrustedAuthOriginConfiguration({
      ...productionConfig,
      MATMETRICS_AUTH_FRONTEND_ORIGIN: 'http://localhost:9002',
      MATMETRICS_AUTH_PUBLIC_URL: 'http://localhost:9002',
      MATMETRICS_AUTH_RP_ID: 'localhost',
    }),
    /HTTPS/,
  );
});

test('rejects wildcards, credentials, paths, queries, and lookalike origins', () => {
  for (const origin of [
    '*',
    'https://user:password@matmetrics-teal.vercel.app',
    'https://matmetrics-teal.vercel.app/path',
    'https://matmetrics-teal.vercel.app?next=/',
    'https://matmetrics-teal.vercel.app.attacker.test',
  ]) {
    assert.throws(
      () => getTrustedAuthOriginConfiguration({
        ...productionConfig,
        MATMETRICS_AUTH_ADDITIONAL_FRONTEND_ORIGINS: origin,
      }),
      undefined,
      origin,
    );
  }
});

test('rejects an additional origin outside the configured WebAuthn RP ID', () => {
  assert.throws(
    () => getTrustedAuthOriginConfiguration({
      ...productionConfig,
      MATMETRICS_AUTH_ADDITIONAL_FRONTEND_ORIGINS: 'https://companion.example.test',
    }),
    /RP ID/,
  );
});

test('rejects a primary frontend outside the RP ID and wildcard RP IDs', () => {
  assert.throws(
    () => getTrustedAuthOriginConfiguration({
      ...productionConfig,
      MATMETRICS_AUTH_FRONTEND_ORIGIN: 'https://matmetrics-teal.vercel.app.attacker.test',
    }),
    /RP ID/,
  );
  assert.throws(
    () => getTrustedAuthOriginConfiguration({
      ...productionConfig,
      MATMETRICS_AUTH_RP_ID: '*',
    }),
    /exact domain/,
  );
});

test('requires explicit environment and origin configuration', () => {
  assert.throws(
    () => getTrustedAuthOriginConfiguration({
      MATMETRICS_AUTH_PUBLIC_URL: productionConfig.MATMETRICS_AUTH_PUBLIC_URL,
      MATMETRICS_AUTH_FRONTEND_ORIGIN: productionConfig.MATMETRICS_AUTH_FRONTEND_ORIGIN,
      MATMETRICS_AUTH_RP_ID: productionConfig.MATMETRICS_AUTH_RP_ID,
    }),
    /ENVIRONMENT/,
  );
  assert.throws(
    () => getTrustedAuthOriginConfiguration({ ENVIRONMENT: 'production' }),
    /required/,
  );
});

test('keeps the server-side auth URL separate from browser origins', () => {
  const config = getTrustedAuthOriginConfiguration({
    ...productionConfig,
    MATMETRICS_AUTH_PUBLIC_URL: 'https://matmetrics-auth-production.scheimann.workers.dev',
  });

  assert.equal(config.publicUrl, 'https://matmetrics-auth-production.scheimann.workers.dev');
  assert.deepEqual(config.trustedOrigins, ['https://matmetrics-teal.vercel.app']);
  assert.deepEqual(config.passkeyOrigins, ['https://matmetrics-teal.vercel.app']);
});
