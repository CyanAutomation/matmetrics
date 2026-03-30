import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { requireAuthenticatedUser } from '@/lib/server-auth';

const AUTH_TEST_MODE_ENV = 'MATMETRICS_AUTH_TEST_MODE';
const requestForAuthorization = (authorization?: string) =>
  new NextRequest('http://localhost/api/test', {
    headers: authorization ? { authorization } : undefined,
  });

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

test.before(() => {
  process.env[AUTH_TEST_MODE_ENV] = 'true';
});

test.after(() => {
  delete process.env[AUTH_TEST_MODE_ENV];
});

test('requireAuthenticatedUser accepts valid Bearer authorization variants', async () => {
  const validHeaders = [
    { name: 'canonical bearer scheme', authorization: 'Bearer test-token' },
    { name: 'lowercase bearer scheme', authorization: 'bearer test-token' },
  ];

  for (const { name, authorization } of validHeaders) {
    const result = await requireAuthenticatedUser(
      requestForAuthorization(authorization)
    );

    assert.equal('status' in result, false, `${name} should authenticate`);
    if ('status' in result) {
      assert.fail(`Expected decoded token for ${name}`);
    }

    assert.equal(result.uid, 'test-user');
  }
});

test('requireAuthenticatedUser rejects malformed authorization header variants', async () => {
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
});

test('requireAuthenticatedUser rejects invalid test-mode token', async () => {
  const result = await requireAuthenticatedUser(
    requestForAuthorization('Bearer invalid')
  );

  await assertUnauthorizedResponse(result, 'Invalid authentication token');
});
