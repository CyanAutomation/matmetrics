import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { GET, PUT } from './api-handler';

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

test('preferences route returns a useful message when its configured data endpoint is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const originalSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalConsoleError = console.error;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'test-secret';
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  console.error = () => {};

  try {
    const response = await GET(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error:
        'The background data service is temporarily unavailable. Please try again.',
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalUrl === undefined)
      delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = originalUrl;
    if (originalSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = originalSecret;
  }
});
