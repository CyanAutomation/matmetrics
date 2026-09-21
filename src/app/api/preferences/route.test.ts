import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { GET, PUT } from './route';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

test('preferences routes require authentication', async () => {
  const response = await GET(
    new NextRequest('http://localhost/api/preferences')
  );
  assert.equal(response.status, 401);
});

test('preferences route rejects malformed writes before calling a data store', async () => {
  const response = await PUT(
    new NextRequest('http://localhost/api/preferences', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ preferences: [], revision: 0 }),
    })
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Invalid preference payload',
  });
});
