import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { requireAuthenticatedUser } from '@/lib/server-auth';

const AUTH_TEST_MODE_ENV = 'MATMETRICS_AUTH_TEST_MODE';
const NODE_ENV_VAR = 'NODE_ENV';
const requireFromTest = createRequire(import.meta.url);

const requestForAuthorization = (authorization?: string) =>
  new NextRequest('http://localhost/api/test', {
    headers: authorization ? { authorization } : undefined,
  });

const structurallyValidToken = (algorithm: string) => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: algorithm, kid: 'test-key' })}.${encode({})}.signature`;
};

const setEnvVar = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
    return;
  }

  Reflect.set(process.env, key, value);
};

const withEnv = async (
  env: Partial<Record<typeof AUTH_TEST_MODE_ENV | typeof NODE_ENV_VAR, string>>,
  fn: () => Promise<void>
) => {
  const previousAuthTestMode = process.env[AUTH_TEST_MODE_ENV];
  const previousNodeEnv = process.env[NODE_ENV_VAR];

  setEnvVar(AUTH_TEST_MODE_ENV, env[AUTH_TEST_MODE_ENV]);
  setEnvVar(NODE_ENV_VAR, env[NODE_ENV_VAR]);

  try {
    await fn();
  } finally {
    setEnvVar(AUTH_TEST_MODE_ENV, previousAuthTestMode);
    setEnvVar(NODE_ENV_VAR, previousNodeEnv);
  }
};

const assertUnauthorizedResponse = async (
  result: Awaited<ReturnType<typeof requireAuthenticatedUser>>,
  expectedError: string
) => {
  assert.equal('status' in result, true);
  if (!('status' in result)) {
    assert.fail('Expected unauthorized response');
  }

  assert.equal(result.status, 401);
  const body = await result.json();
  assert.deepEqual(body, { error: expectedError });
};

test('server auth does not eagerly load Firebase Admin Auth', () => {
  const firebaseAuthPath = requireFromTest.resolve('firebase-admin/auth');
  assert.equal(requireFromTest.cache[firebaseAuthPath], undefined);
});

test('test env + MATMETRICS_AUTH_TEST_MODE accepts valid Bearer authorization', async () => {
  await withEnv(
    { [AUTH_TEST_MODE_ENV]: 'true', [NODE_ENV_VAR]: 'test' },
    async () => {
      const result = await requireAuthenticatedUser(
        requestForAuthorization('Bearer test-token')
      );

      assert.equal('status' in result, false);
      if ('status' in result) {
        assert.fail('Expected decoded token in test mode');
      }

      assert.equal(result.appUserId, 'test-user');
      assert.equal(result.provider, 'test');
    }
  );
});

test('test shortcut is unavailable outside NODE_ENV=test', async () => {
  await withEnv(
    { [AUTH_TEST_MODE_ENV]: 'true', [NODE_ENV_VAR]: 'development' },
    async () => {
      const result = await requireAuthenticatedUser(
        requestForAuthorization('Bearer test-token')
      );

      assert.equal('status' in result, true);
      if (!('status' in result)) {
        assert.fail(
          'Expected error response when Firebase admin is unavailable'
        );
      }

      assert.equal(result.status, 401);
      const body = await result.json();
      assert.deepEqual(body, { error: 'Invalid authentication token' });
    }
  );
});

test('Firebase token path reports missing server configuration', async () => {
  await withEnv(
    { [AUTH_TEST_MODE_ENV]: 'false', [NODE_ENV_VAR]: 'test' },
    async () => {
      const result = await requireAuthenticatedUser(
        requestForAuthorization(`Bearer ${structurallyValidToken('RS256')}`),
        { includeErrorCode: true }
      );

      assert.equal('status' in result, true);
      if (!('status' in result)) {
        assert.fail('Expected normal auth path without Firebase config');
      }

      assert.equal(result.status, 500);
      const body = await result.json();
      assert.deepEqual(body, {
        error:
          'Authentication service is not configured. Contact the site administrator.',
        code: 'AUTH_CONFIGURATION',
      });
    }
  );
});

test('requireAuthenticatedUser rejects malformed authorization header variants', async () => {
  await withEnv(
    { [AUTH_TEST_MODE_ENV]: 'true', [NODE_ENV_VAR]: 'test' },
    async () => {
      const malformedHeaders = [
        { authorization: 'Bearer', error: 'Authentication required' },
        { authorization: 'Basic test-token', error: 'Authentication required' },
        { authorization: 'Token test-token', error: 'Authentication required' },
        { authorization: 'test-token', error: 'Authentication required' },
      ];

      for (const { authorization, error } of malformedHeaders) {
        const result = await requireAuthenticatedUser(
          requestForAuthorization(authorization)
        );

        await assertUnauthorizedResponse(result, error);
      }
    }
  );
});

test('requireAuthenticatedUser rejects invalid test-mode token in test env', async () => {
  await withEnv(
    { [AUTH_TEST_MODE_ENV]: 'true', [NODE_ENV_VAR]: 'test' },
    async () => {
      const result = await requireAuthenticatedUser(
        requestForAuthorization('Bearer invalid')
      );

      await assertUnauthorizedResponse(result, 'Invalid authentication token');
    }
  );
});

test('Better Auth token path reports missing JWKS configuration', async () => {
  const jwksUrl = process.env.MATMETRICS_AUTH_JWKS_URL;
  const issuer = process.env.MATMETRICS_AUTH_ISSUER;
  const audience = process.env.MATMETRICS_AUTH_AUDIENCE;
  Reflect.deleteProperty(process.env, 'MATMETRICS_AUTH_JWKS_URL');
  Reflect.deleteProperty(process.env, 'MATMETRICS_AUTH_ISSUER');
  Reflect.deleteProperty(process.env, 'MATMETRICS_AUTH_AUDIENCE');

  try {
    const result = await requireAuthenticatedUser(
      requestForAuthorization(`Bearer ${structurallyValidToken('EdDSA')}`),
      { includeErrorCode: true }
    );
    assert.equal('status' in result, true);
    if (!('status' in result)) assert.fail('Expected configuration response');
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), {
      error:
        'Authentication service is not configured. Contact the site administrator.',
      code: 'AUTH_CONFIGURATION',
    });
  } finally {
    if (jwksUrl !== undefined) process.env.MATMETRICS_AUTH_JWKS_URL = jwksUrl;
    if (issuer !== undefined) process.env.MATMETRICS_AUTH_ISSUER = issuer;
    if (audience !== undefined) process.env.MATMETRICS_AUTH_AUDIENCE = audience;
  }
});

test('Better Auth token path reports malformed JWKS configuration safely', async () => {
  const previous = {
    jwks: process.env.MATMETRICS_AUTH_JWKS_URL,
    issuer: process.env.MATMETRICS_AUTH_ISSUER,
    audience: process.env.MATMETRICS_AUTH_AUDIENCE,
  };
  process.env.MATMETRICS_AUTH_JWKS_URL = 'not-a-url';
  process.env.MATMETRICS_AUTH_ISSUER = 'https://auth.example.test';
  process.env.MATMETRICS_AUTH_AUDIENCE = 'matmetrics-api';

  try {
    const result = await requireAuthenticatedUser(
      requestForAuthorization(`Bearer ${structurallyValidToken('EdDSA')}`),
      { includeErrorCode: true }
    );
    assert.equal('status' in result, true);
    if (!('status' in result)) assert.fail('Expected configuration response');
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), {
      error:
        'Authentication service is not configured. Contact the site administrator.',
      code: 'AUTH_CONFIGURATION',
    });
  } finally {
    if (previous.jwks === undefined) delete process.env.MATMETRICS_AUTH_JWKS_URL;
    else process.env.MATMETRICS_AUTH_JWKS_URL = previous.jwks;
    if (previous.issuer === undefined)
      delete process.env.MATMETRICS_AUTH_ISSUER;
    else process.env.MATMETRICS_AUTH_ISSUER = previous.issuer;
    if (previous.audience === undefined)
      delete process.env.MATMETRICS_AUTH_AUDIENCE;
    else process.env.MATMETRICS_AUTH_AUDIENCE = previous.audience;
  }
});
