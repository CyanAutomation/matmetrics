import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DATA_WORKER_REQUEST_TIMEOUT_MS,
  DataWorkerError,
  createDataWorkerSignature,
  isDataWorkerConfigured,
  requestDataWorker,
} from './data-worker-client.server';

test('data Worker signatures bind the method, path, timestamp, user, and body', () => {
  const secret = 'test-secret';
  const baseline = createDataWorkerSignature(
    secret,
    '1700000000',
    'PUT',
    '/v1/preferences',
    '{"preferences":{}}',
    'user-1'
  );

  assert.equal(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'put',
      '/v1/preferences',
      '{"preferences":{}}',
      'user-1'
    )
  );
  assert.notEqual(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'PUT',
      '/v1/preferences',
      '{"preferences":{"changed":true}}',
      'user-1'
    )
  );
  assert.notEqual(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'PUT',
      '/v1/plugin-overrides',
      '{"preferences":{}}',
      'user-1'
    )
  );
  assert.notEqual(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'PUT',
      '/v1/preferences?scope=app',
      '{"preferences":{}}',
      'user-1'
    )
  );
  assert.notEqual(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'PUT',
      '/v1/preferences',
      '{"preferences":{}}',
      'user-2'
    )
  );
});

test('data Worker request trims the shared secret and signs the query string', async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = ' test-secret ';

  try {
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      const timestamp = init?.headers instanceof Headers
        ? init.headers.get('X-Matmetrics-Timestamp')!
        : (init?.headers as Record<string, string>)['X-Matmetrics-Timestamp'];
      const authorization = init?.headers instanceof Headers
        ? init.headers.get('Authorization')
        : (init?.headers as Record<string, string>)['Authorization'];

      assert.equal(url.search, '?scope=app');
      assert.equal(
        authorization,
        `Bearer ${createDataWorkerSignature(
          'test-secret',
          timestamp,
          'GET',
          `${url.pathname}${url.search}`,
          '',
          'user-1'
        )}`
      );
      return Response.json({ preferences: null, revision: 0 });
    }) as typeof fetch;

    await requestDataWorker('/v1/preferences?scope=app', {
      method: 'GET',
      userId: 'user-1',
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});

test('data Worker requests set an abort signal for the bounded upstream call', async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'test-secret';

  try {
    let signal: AbortSignal | undefined;
    globalThis.fetch = (async (_input, init) => {
      signal = init?.signal ?? undefined;
      return Response.json({ preferences: null, revision: 0 });
    }) as typeof fetch;

    await requestDataWorker('/v1/preferences', {
      method: 'GET',
      userId: 'user-1',
    });

    assert.ok(signal);
    assert.equal(signal.aborted, false);
    assert.equal(DATA_WORKER_REQUEST_TIMEOUT_MS, 8_000);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) {
      delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    } else {
      process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    }
    if (previousSecret === undefined) {
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    } else {
      process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
    }
  }
});

test('missing data Worker endpoint or secret is reported as unconfigured', async () => {
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalFetch = globalThis.fetch;
  delete process.env.CLOUDFLARE_DATA_WORKER_URL;
  delete process.env.MATMETRICS_INTERNAL_API_SECRET;
  globalThis.fetch = async () => {
    throw new Error('must not fetch without worker configuration');
  };

  try {
    assert.equal(isDataWorkerConfigured(), false);
    await assert.rejects(
      requestDataWorker('/v1/preferences', {
        method: 'GET',
        userId: 'user-1',
      }),
      (error: unknown) =>
        error instanceof DataWorkerError &&
        error.status === 503 &&
        error.category === 'configuration'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});

test('a disconnected data Worker endpoint becomes a retryable service error', async () => {
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'test-secret';
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };

  try {
    await assert.rejects(
      requestDataWorker('/v1/preferences', {
        method: 'GET',
        userId: 'user-1',
      }),
      (error: unknown) =>
        error instanceof DataWorkerError &&
        error.status === 503 &&
        error.message ===
          'The background data service is temporarily unavailable. Please try again.'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});

test('an expired data Worker signature is classified without exposing upstream details', async () => {
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'expired-test-secret';
  globalThis.fetch = async () =>
    Response.json({ error: 'Expired signature' }, { status: 401 });

  try {
    await assert.rejects(
      requestDataWorker('/v1/preferences', {
        method: 'GET',
        userId: 'user-1',
      }),
      (error: unknown) =>
        error instanceof DataWorkerError &&
        error.status === 503 &&
        error.category === 'authentication' &&
        error.upstreamStatus === 401 &&
        error.upstreamAuthFailure === 'expired-signature' &&
        error.message ===
          'The background data service rejected request authentication.'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});

test('data Worker auth failures do not echo untrusted response text', async () => {
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'test-secret';
  globalThis.fetch = async () =>
    Response.json(
      { error: 'Unauthorized: secret mismatch test detail' },
      { status: 401 }
    );

  try {
    await assert.rejects(
      requestDataWorker('/v1/preferences', {
        method: 'GET',
        userId: 'user-1',
      }),
      (error: unknown) =>
        error instanceof DataWorkerError &&
        error.category === 'authentication' &&
        error.upstreamAuthFailure === 'request-rejected' &&
        !error.message.includes('secret mismatch')
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});

test('data Worker non-auth failures do not echo untrusted response text', async () => {
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://data.example.workers.dev';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'test-secret';
  globalThis.fetch = async () =>
    Response.json(
      { error: 'internal token=upstream-secret detail' },
      { status: 400 }
    );

  try {
    await assert.rejects(
      requestDataWorker('/v1/background-jobs', {
        method: 'POST',
        userId: 'user-1',
        body: { type: 'github-health' },
      }),
      (error: unknown) =>
        error instanceof DataWorkerError &&
        error.status === 400 &&
        error.category === 'unavailable' &&
        error.message === 'The background data service rejected the request.' &&
        !error.message.includes('upstream-secret')
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
  }
});
