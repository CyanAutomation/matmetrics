import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from './server-auth';

test('Better Auth EdDSA tokens load and validate through the isolated verifier', async () => {
  const { exportJWK, generateKeyPair, SignJWT } = await import('jose');
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
  });
  const issuer = 'https://auth.example.test';
  const audience = 'matmetrics-api';
  const jwksUrl = 'https://auth.example.test/.well-known/jwks.json';
  const keyId = 'better-auth-test-key';
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    alg: 'EdDSA',
    kid: keyId,
    use: 'sig',
  };
  const savedEnv = {
    jwks: process.env.MATMETRICS_AUTH_JWKS_URL,
    issuer: process.env.MATMETRICS_AUTH_ISSUER,
    audience: process.env.MATMETRICS_AUTH_AUDIENCE,
    authTestMode: process.env.MATMETRICS_AUTH_TEST_MODE,
    nodeEnv: process.env.NODE_ENV,
  };
  const originalFetch = globalThis.fetch;
  const loadedUsers: string[] = [];
  const savedUsers: string[] = [];
  process.env.MATMETRICS_AUTH_JWKS_URL = jwksUrl;
  process.env.MATMETRICS_AUTH_ISSUER = issuer;
  process.env.MATMETRICS_AUTH_AUDIENCE = audience;
  process.env.MATMETRICS_AUTH_TEST_MODE = 'false';
  Reflect.set(process.env, 'NODE_ENV', 'test');
  globalThis.fetch = async () =>
    Response.json({ keys: [publicJwk] }, { headers: { 'Cache-Control': 'max-age=60' } });

  try {
    const token = await new SignJWT({
      appUserId: 'canonical-better-user',
      email: 'user@example.test',
      name: 'Better User',
      emailVerified: true,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: keyId })
      .setSubject('canonical-better-user')
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    const valid = await requireAuthenticatedUser(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: `Bearer ${token}` },
      })
    );
    assert.equal('status' in valid, false);
    if ('status' in valid) assert.fail('Expected a verified Better Auth user');
    assert.deepEqual(valid, {
      userId: 'canonical-better-user',
      appUserId: 'canonical-better-user',
      provider: 'better-auth',
      email: 'user@example.test',
      displayName: 'Better User',
      emailVerified: true,
    });

    mock.module('@/lib/preferences-store.server', {
      exports: {
        loadStoredPreferences: async (uid: string) => {
          loadedUsers.push(uid);
          return { preferences: { auditMode: 'standard' }, revision: 7 };
        },
        saveStoredPreferences: async (
          uid: string,
          preferences: Record<string, unknown>,
          revision: number
        ) => {
          savedUsers.push(uid);
          return { preferences, revision: revision + 1 };
        },
        PreferencesStoreConfigurationError: class extends Error {},
      },
    } as never);
    const { GET, PUT } = await import('@/app/api/preferences/api-handler');
    const getResponse = await GET(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: `Bearer ${token}` },
      })
    );
    assert.equal(getResponse.status, 200);
    assert.deepEqual(await getResponse.json(), {
      preferences: { auditMode: 'standard' },
      revision: 7,
    });

    const putResponse = await PUT(
      new NextRequest('http://localhost/api/preferences', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          preferences: { auditMode: 'custom' },
          revision: 7,
        }),
      })
    );
    assert.equal(putResponse.status, 200);
    assert.deepEqual(await putResponse.json(), {
      preferences: { auditMode: 'custom' },
      revision: 8,
    });
    assert.deepEqual(loadedUsers, ['canonical-better-user']);
    assert.deepEqual(savedUsers, ['canonical-better-user']);

    const invalidToken = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    const invalid = await requireAuthenticatedUser(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: `Bearer ${invalidToken}` },
      }),
      { includeErrorCode: true }
    );
    assert.equal('status' in invalid, true);
    if (!('status' in invalid)) assert.fail('Expected an invalid-token response');
    assert.equal(invalid.status, 401);
    assert.deepEqual(await invalid.json(), {
      error: 'Invalid authentication token',
      code: 'AUTHENTICATION_FAILED',
    });
  } finally {
    globalThis.fetch = originalFetch;
    const env = [
      ['MATMETRICS_AUTH_JWKS_URL', savedEnv.jwks],
      ['MATMETRICS_AUTH_ISSUER', savedEnv.issuer],
      ['MATMETRICS_AUTH_AUDIENCE', savedEnv.audience],
      ['MATMETRICS_AUTH_TEST_MODE', savedEnv.authTestMode],
      ['NODE_ENV', savedEnv.nodeEnv],
    ] as const;
    for (const [key, value] of env) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
});
