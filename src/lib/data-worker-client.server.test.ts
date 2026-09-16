import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DATA_WORKER_REQUEST_TIMEOUT_MS,
  createDataWorkerSignature,
  requestDataWorker,
} from './data-worker-client.server';

test('data Worker signatures bind the method, path, timestamp, and body', () => {
  const secret = 'test-secret';
  const baseline = createDataWorkerSignature(
    secret,
    '1700000000',
    'PUT',
    '/v1/preferences',
    '{"preferences":{}}'
  );

  assert.equal(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'put',
      '/v1/preferences',
      '{"preferences":{}}'
    )
  );
  assert.notEqual(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'PUT',
      '/v1/preferences',
      '{"preferences":{"changed":true}}'
    )
  );
  assert.notEqual(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'PUT',
      '/v1/plugin-overrides',
      '{"preferences":{}}'
    )
  );
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
