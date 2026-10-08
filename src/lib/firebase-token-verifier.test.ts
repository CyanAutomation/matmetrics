import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from './server-auth';

const requireFromTest = createRequire(import.meta.url);

function createFirebaseToken(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  projectId: string,
  uid: string,
  keyId: string
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
    })
  ).toString('base64url');
  const message = `${header}.${payload}`;
  return `${message}.${sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64url')}`;
}

test('Firebase RS256 tokens use Firebase Admin verification and reject invalid signatures', async () => {
  const projectId = 'matmetrics-firebase-test';
  const keyId = 'firebase-test-key';
  const validPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const invalidPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const validPublicKey = validPair.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString();
  const servicePrivateKey = serviceAccountPair.privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();

  const previousServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const previousAuthTestMode = process.env.MATMETRICS_AUTH_TEST_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  const firebaseAuthPath = requireFromTest.resolve('firebase-admin/auth');
  const apiRequestPath = resolve(
    dirname(firebaseAuthPath),
    '../utils/api-request.js'
  );
  const apiRequest = requireFromTest(apiRequestPath);
  const originalHttpSend = apiRequest.HttpClient.prototype.send;
  apiRequest.HttpClient.prototype.send = async () => ({
    isJson: () => true,
    data: { [keyId]: validPublicKey },
    headers: { 'cache-control': 'public, max-age=3600' },
  });

  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
    project_id: projectId,
    client_email: 'firebase-test@example.test',
    private_key: servicePrivateKey,
  });
  process.env.MATMETRICS_AUTH_TEST_MODE = 'false';
  Reflect.set(process.env, 'NODE_ENV', 'test');

  try {
    const validToken = createFirebaseToken(
      validPair.privateKey,
      projectId,
      'firebase-user',
      keyId
    );
    const { verifyFirebaseToken } = await import(
      './firebase-token-verifier.server'
    );
    await verifyFirebaseToken(validToken);
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

    const loadedUsers: string[] = [];
    const savedUsers: string[] = [];
    mock.module('@/lib/preferences-store.server', {
      exports: {
        loadStoredPreferences: async (uid: string) => {
          loadedUsers.push(uid);
          return { preferences: { auditMode: 'standard' }, revision: 3 };
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
        body: JSON.stringify({ preferences: { auditMode: 'custom' }, revision: 3 }),
      })
    );
    assert.equal(putResponse.status, 200);
    assert.deepEqual(await putResponse.json(), {
      preferences: { auditMode: 'custom' },
      revision: 4,
    });
    assert.deepEqual(loadedUsers, ['firebase-user']);
    assert.deepEqual(savedUsers, ['firebase-user']);

    const invalid = await requireAuthenticatedUser(
      new NextRequest('http://localhost/api/preferences', {
        headers: {
          authorization: `Bearer ${createFirebaseToken(invalidPair.privateKey, projectId, 'firebase-user', keyId)}`,
        },
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
    apiRequest.HttpClient.prototype.send = originalHttpSend;
    if (previousServiceAccount === undefined) {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    } else {
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = previousServiceAccount;
    }
    if (previousAuthTestMode === undefined) {
      delete process.env.MATMETRICS_AUTH_TEST_MODE;
    } else {
      process.env.MATMETRICS_AUTH_TEST_MODE = previousAuthTestMode;
    }
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, 'NODE_ENV');
    } else {
      Reflect.set(process.env, 'NODE_ENV', previousNodeEnv);
    }
  }
});
