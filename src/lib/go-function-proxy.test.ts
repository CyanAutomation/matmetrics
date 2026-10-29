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

test('proxyGoFunction normalizes non-JSON upstream failures into an actionable JSON response', async () => {
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
    assert.deepEqual(await response.json(), {
      error: 'Upstream service returned an unexpected response',
      details: 'backend unavailable',
    });
    assert.equal(response.headers.get('content-type'), 'application/json');
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

test('proxyGoFunction forwards session list validators and preserves private cache headers', async () => {
  const originalFetch = global.fetch;
  let requestHeaders: Headers | undefined;
  let cacheOutcome: string | undefined;
  global.fetch = async (_input, init) => {
    requestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify([{ id: 'session-1' }]), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'private, no-cache, must-revalidate',
        etag: '"session-list-v1"',
        vary: 'Authorization',
        'x-matmetrics-session-cache': 'hit',
      },
    });
  };

  try {
    const request = new NextRequest('http://localhost/api/sessions/list', {
      headers: {
        authorization: 'Bearer test-token',
        'if-none-match': '"session-list-v1"',
      },
    });
    const response = await proxyGoFunction(request, {
      path: '/api/go/sessions/list?owner=test',
      method: 'GET',
      onCacheOutcome: (outcome: string) => {
        cacheOutcome = outcome;
      },
    });

    assert.equal(requestHeaders?.get('if-none-match'), '"session-list-v1"');
    assert.equal(response.headers.get('cache-control'), 'private, no-cache, must-revalidate');
    assert.equal(response.headers.get('etag'), '"session-list-v1"');
    assert.equal(response.headers.get('vary'), 'Authorization');
    assert.equal(response.headers.get('x-matmetrics-session-cache'), null);
    assert.equal(cacheOutcome, 'hit');
  } finally {
    global.fetch = originalFetch;
  }
});

test('proxyGoFunction preserves upstream 304 without trying to parse a JSON body', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(null, {
      status: 304,
      headers: {
        'cache-control': 'private, no-cache, must-revalidate',
        etag: '"session-list-v1"',
        vary: 'Authorization',
      },
    });

  try {
    const response = await proxyGoFunction(buildRequest(), {
      path: '/api/go/sessions/list',
      method: 'GET',
    });

    assert.equal(response.status, 304);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('etag'), '"session-list-v1"');
    assert.equal(response.headers.get('cache-control'), 'private, no-cache, must-revalidate');
  } finally {
    global.fetch = originalFetch;
  }
});

test('proxyGoFunction turns endpoint disconnectivity into a useful retryable response', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new TypeError('fetch failed with internal socket details');
  };

  try {
    const response = await proxyGoFunction(buildRequest(), {
      path: '/api/go/sessions/list',
      method: 'GET',
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'The storage service is temporarily unavailable. Please try again later.',
    });
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
