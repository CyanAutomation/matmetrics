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
  assert.deepEqual(await response.json(), {
    error: 'Authentication required',
    code: 'AUTHENTICATION_REQUIRED',
  });
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
    code: 'INVALID_PREFERENCE_PAYLOAD',
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
      error: 'Saved preferences are temporarily unavailable. Please try again.',
      code: 'PREFERENCES_UNAVAILABLE',
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

test('preferences route classifies missing server-side storage without exposing details', async () => {
  const names = [
    'CLOUDFLARE_DATA_WORKER_URL',
    'MATMETRICS_INTERNAL_API_SECRET',
    'FIREBASE_SERVICE_ACCOUNT_KEY',
  ] as const;
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]])
  );
  const originalConsoleError = console.error;
  for (const name of names) delete process.env[name];
  console.error = () => {};

  try {
    const response = await GET(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error:
        'Saved preferences are not configured. Contact the site administrator.',
      code: 'PREFERENCE_STORE_CONFIGURATION',
    });
  } finally {
    console.error = originalConsoleError;
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('preferences route classifies malformed Worker configuration safely', async () => {
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalConsoleError = console.error;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'not-a-valid-url';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'test-secret';
  console.error = () => {};

  try {
    const response = await GET(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error:
        'Saved preferences are not configured. Contact the site administrator.',
      code: 'PREFERENCE_STORE_CONFIGURATION',
    });
  } finally {
    console.error = originalConsoleError;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});

test('preferences route hides permanent Worker request details and does not label them retryable', async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalConsoleError = console.error;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'test-secret';
  globalThis.fetch = async () =>
    Response.json({ error: 'private worker internals' }, { status: 422 });
  console.error = () => {};

  try {
    const response = await GET(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      error: 'The preferences request could not be completed.',
      code: 'PREFERENCE_REQUEST_FAILED',
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});

test('preferences route makes Worker authentication failures actionable without exposing upstream details', async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalConsoleError = console.error;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'expired-test-secret';
  globalThis.fetch = async () =>
    Response.json({ error: 'Unauthorized: secret mismatch' }, { status: 401 });
  console.error = () => {};

  try {
    const response = await GET(
      new NextRequest('http://localhost/api/preferences', {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error:
        'Saved preferences are not configured. Contact the site administrator.',
      code: 'PREFERENCE_STORE_CONFIGURATION',
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});
