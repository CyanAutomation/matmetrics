import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { exportJWK } from 'jose';
import { requireAuthenticatedUser } from './server-auth';
import { createPreferencesApiHandlers } from '@/app/api/preferences/api-handler';

const requireFromTest = createRequire(import.meta.url);

function createFirebaseToken(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  projectId: string,
  uid: string,
  keyId: string,
  claims: Record<string, unknown> = {}
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: keyId, typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      aud: projectId,
      auth_time: now - 1,
      email: `${uid}@example.test`,
      email_verified: true,
      exp: now + 3600,
      firebase: { sign_in_provider: 'password' },
      iat: now,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: uid,
      user_id: uid,
      ...claims,
    })
  ).toString('base64url');
  const message = `${header}.${payload}`;
  return `${message}.${sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64url')}`;
}

function setEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    Reflect.set(process.env, key, value);
  }
}

test('Firebase RS256 verification uses jose without loading Firebase Admin Auth', async () => {
  const projectId = 'matmetrics-firebase-test';
  const keyId = 'firebase-test-key';
  const validPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const invalidPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const servicePrivateKey = serviceAccountPair.privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const publicJwk = {
    ...(await exportJWK(validPair.publicKey)),
    alg: 'RS256',
    kid: keyId,
    use: 'sig',
  };

  const envNames = [
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'MATMETRICS_AUTH_TEST_MODE',
    'NODE_ENV',
  ] as const;
  const previousEnv = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]])
  );
  const firebaseAuthPath = requireFromTest.resolve('firebase-admin/auth');
  const originalFetch = globalThis.fetch;
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
    project_id: projectId,
    client_email: 'firebase-test@example.test',
    private_key: servicePrivateKey,
  });
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
  process.env.MATMETRICS_AUTH_TEST_MODE = 'false';
  Reflect.set(process.env, 'NODE_ENV', 'test');

  globalThis.fetch = async () =>
    Response.json(
      { keys: [publicJwk] },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );

  try {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const unavailable = await requireAuthenticatedUser(
      new NextRequest('http://localhost/api/preferences', {
        headers: {
          authorization: `Bearer ${createFirebaseToken(
            validPair.privateKey,
            projectId,
            'firebase-user',
            keyId
          )}`,
        },
      }),
      { includeErrorCode: true }
    );
    assert.equal('status' in unavailable, true);
    if (!('status' in unavailable)) {
      assert.fail('Expected an authentication-service availability response');
    }
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      error:
        'Authentication service is temporarily unavailable. Please try again.',
      code: 'AUTHENTICATION_UNAVAILABLE',
    });

    globalThis.fetch = async () =>
      Response.json(
        { keys: [publicJwk] },
        { headers: { 'Cache-Control': 'public, max-age=3600' } }
      );
    const validToken = createFirebaseToken(
      validPair.privateKey,
      projectId,
      'firebase-user',
      keyId
    );
    const valid = await requireAuthenticatedUser(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: `Bearer ${validToken}` },
      })
    );
    assert.equal('status' in valid, false);
    if ('status' in valid) assert.fail('Expected a verified Firebase user');
    assert.deepEqual(valid, {
      userId: 'firebase-user',
      appUserId: 'firebase-user',
      provider: 'firebase',
      email: 'firebase-user@example.test',
      displayName: null,
      emailVerified: true,
    });
    assert.equal(requireFromTest.cache[firebaseAuthPath], undefined);

    const invalidToken = createFirebaseToken(
      invalidPair.privateKey,
      projectId,
      'firebase-user',
      keyId
    );
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

    const invalidClaims = [
      { aud: 'another-firebase-project' },
      { aud: [projectId, 'another-firebase-project'] },
      { iss: 'https://securetoken.google.com/another-firebase-project' },
      { auth_time: undefined },
      { sub: 'x'.repeat(129) },
    ];
    for (const claims of invalidClaims) {
      const invalidClaimsToken = createFirebaseToken(
        validPair.privateKey,
        projectId,
        'firebase-user',
        keyId,
        claims
      );
      const invalidClaimsResult = await requireAuthenticatedUser(
        new NextRequest('http://localhost/api/preferences', {
          headers: { authorization: `Bearer ${invalidClaimsToken}` },
        })
      );
      assert.equal('status' in invalidClaimsResult, true);
      if (!('status' in invalidClaimsResult)) {
        assert.fail('Expected invalid Firebase claims to be rejected');
      }
      assert.equal(invalidClaimsResult.status, 401);
    }

    const { GET, PUT } = createPreferencesApiHandlers({
      loadStoredPreferences: async () => ({
        preferences: { auditMode: 'standard' },
        revision: 3,
      }),
      saveStoredPreferences: async (
        _uid,
        preferences,
        revision
      ) => ({ preferences, revision: revision + 1 }),
    });
    const getResponse = await GET(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: `Bearer ${validToken}` },
      })
    );
    assert.equal(getResponse.status, 200);
    assert.deepEqual(await getResponse.json(), {
      preferences: { auditMode: 'standard' },
      revision: 3,
    });

    const putResponse = await PUT(
      new NextRequest('http://localhost/api/preferences', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          preferences: { auditMode: 'custom' },
          revision: 3,
        }),
      })
    );
    assert.equal(putResponse.status, 200);
    assert.deepEqual(await putResponse.json(), {
      preferences: { auditMode: 'custom' },
      revision: 4,
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      setEnvVar(name, previousEnv[name]);
    }
  }
});

test('Firebase client and service-account project mismatch is configuration failure', async () => {
  const envNames = [
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'MATMETRICS_AUTH_TEST_MODE',
    'NODE_ENV',
  ] as const;
  const previousEnv = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]])
  );
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
    project_id: 'server-firebase-project',
    client_email: 'firebase-test@example.test',
    private_key: 'unused-by-token-verification',
  });
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'client-firebase-project';
  process.env.MATMETRICS_AUTH_TEST_MODE = 'false';
  Reflect.set(process.env, 'NODE_ENV', 'test');

  try {
    const result = await requireAuthenticatedUser(
      new NextRequest('http://localhost/api/preferences', {
        headers: {
          authorization: `Bearer ${createFirebaseToken(
            generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey,
            'client-firebase-project',
            'firebase-user',
            'firebase-test-key'
          )}`,
        },
      }),
      { includeErrorCode: true }
    );
    assert.equal('status' in result, true);
    if (!('status' in result)) {
      assert.fail('Expected a Firebase configuration response');
    }
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), {
      error:
        'Authentication service is not configured. Contact the site administrator.',
      code: 'AUTH_CONFIGURATION',
    });
  } finally {
    for (const name of envNames) {
      setEnvVar(name, previousEnv[name]);
    }
  }
});
