import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { requireAuthenticatedUser } from '@/lib/server-auth';

const AUTH_TEST_MODE_ENV = 'MATMETRICS_AUTH_TEST_MODE';
const NODE_ENV_VAR = 'NODE_ENV';

const requestForAuthorization = (authorization?: string) =>
  new NextRequest('http://localhost/api/test', {
    headers: authorization ? { authorization } : undefined,
  });

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

      assert.equal(result.uid, 'test-user');
    }
  );
});

test('non-test env + MATMETRICS_AUTH_TEST_MODE rejects shortcut and uses normal auth path', async () => {
  await withEnv(
    { [AUTH_TEST_MODE_ENV]: 'true', [NODE_ENV_VAR]: 'development' },
    async () => {
      const result = await requireAuthenticatedUser(
        requestForAuthorization('Bearer test-token')
      );

      assert.equal('status' in result, true);
      if (!('status' in result)) {
        assert.fail('Expected error response when Firebase admin is unavailable');
      }

      assert.equal(result.status, 500);
      const body = await result.json();
      assert.deepEqual(body, { error: 'Firebase admin is not configured' });
    }
  );
});

test('normal auth path unchanged when test mode is disabled', async () => {
  await withEnv(
    { [AUTH_TEST_MODE_ENV]: 'false', [NODE_ENV_VAR]: 'test' },
    async () => {
      const result = await requireAuthenticatedUser(
        requestForAuthorization('Bearer test-token')
      );

      assert.equal('status' in result, true);
      if (!('status' in result)) {
        assert.fail('Expected normal auth path without Firebase config');
      }

      assert.equal(result.status, 500);
      const body = await result.json();
      assert.deepEqual(body, { error: 'Firebase admin is not configured' });
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
