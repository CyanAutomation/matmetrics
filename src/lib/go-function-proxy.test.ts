import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { proxyGoFunction } from './go-function-proxy';

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost/api/sessions/list', {
    headers: {
      authorization: 'Bearer test-token',
    },
  });
}

test('proxyGoFunction returns JSON payloads for JSON upstream errors', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ error: 'upstream failure' }), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });

  try {
    const response = await proxyGoFunction(buildRequest(), {
      path: '/api/go/sessions/list',
      method: 'GET',
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'upstream failure' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('proxyGoFunction returns plain text responses with status and key headers', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response('backend unavailable', {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });

  try {
    const response = await proxyGoFunction(buildRequest(), {
      path: '/api/go/sessions/list',
      method: 'GET',
    });

    assert.equal(response.status, 503);
    assert.equal(await response.text(), 'backend unavailable');
    assert.equal(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8'
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    global.fetch = originalFetch;
  }
});

test('proxyGoFunction preserves empty non-JSON responses', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'max-age=60',
      },
    });

  try {
    const response = await proxyGoFunction(buildRequest(), {
      path: '/api/go/sessions/list',
      method: 'GET',
    });

    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('content-type'), null);
    assert.equal(response.headers.get('cache-control'), 'max-age=60');
  } finally {
    global.fetch = originalFetch;
  }
});

test('proxyGoFunction throws a controlled error for malformed MATMETRICS_GO_PROXY_BASE_URL', async () => {
  const originalBaseUrl = process.env.MATMETRICS_GO_PROXY_BASE_URL;
  process.env.MATMETRICS_GO_PROXY_BASE_URL = '://invalid-base-url';

  try {
    await assert.rejects(
      () =>
        proxyGoFunction(buildRequest(), {
          path: '/api/go/sessions/list',
          method: 'GET',
        }),
      {
        message:
          'Invalid MATMETRICS_GO_PROXY_BASE_URL; expected absolute URL such as https://host:port',
      }
    );
  } finally {
    if (originalBaseUrl === undefined) {
      delete process.env.MATMETRICS_GO_PROXY_BASE_URL;
    } else {
      process.env.MATMETRICS_GO_PROXY_BASE_URL = originalBaseUrl;
    }
  }
});
