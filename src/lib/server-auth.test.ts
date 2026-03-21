import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { requireAuthenticatedUser } from '@/lib/server-auth';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

test('requireAuthenticatedUser accepts Authorization Bearer scheme', async () => {
  const result = await requireAuthenticatedUser(
    new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer test-token' },
    })
  );

  assert.equal('status' in result, false);
  if ('status' in result) {
    assert.fail('Expected decoded token for valid Bearer header');
  }

  assert.equal(result.uid, 'test-user');
});

test('requireAuthenticatedUser accepts lowercase bearer scheme', async () => {
  const result = await requireAuthenticatedUser(
    new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'bearer test-token' },
    })
  );

  assert.equal('status' in result, false);
  if ('status' in result) {
    assert.fail('Expected decoded token for lowercase bearer header');
  }

  assert.equal(result.uid, 'test-user');
});

test('requireAuthenticatedUser rejects malformed authorization headers', async () => {
  const malformedHeaders = [
    'Bearer',
    'Basic test-token',
    'Token test-token',
    'test-token',
  ];

  for (const authorization of malformedHeaders) {
    const result = await requireAuthenticatedUser(
      new NextRequest('http://localhost/api/test', {
        headers: { authorization },
      })
    );

    assert.equal('status' in result, true, `${authorization} should be rejected`);
    if (!('status' in result)) {
      assert.fail(`Expected NextResponse for malformed header: ${authorization}`);
    }

    assert.equal(result.status, 401);
    const body = await result.json();
    assert.equal(body.error, 'Authentication required');
  }
});
