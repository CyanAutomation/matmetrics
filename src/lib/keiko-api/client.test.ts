import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createKeikoApiClient,
  KeikoTransportError,
  type KeikoCreateSession,
} from './client';

const session: KeikoCreateSession & { id: string } = {
  id: 'session-1',
  date: '2026-03-18',
  techniques: ['Uchi mata'],
  effort: 3,
  category: 'Technical',
};

test('typed session client builds list, CRUD requests and keeps conditional metadata', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Request[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.ok(input instanceof Request);
    calls.push(input);
    if (input.method === 'GET') {
      return Response.json({ data: [{ session, revision: 3 }], pagination: { nextCursor: null, hasMore: false } }, {
        headers: { ETag: '"3-0123456789abcdef01234567"' },
      });
    }
    if (input.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({ data: { session, revision: 4 } }, {
      status: input.method === 'POST' ? 201 : 200,
      headers: { ETag: '"4-0123456789abcdef01234567"' },
    });
  }) as typeof fetch;

  try {
    const client = createKeikoApiClient('https://keiko.example.test', 'short-lived-token');
    const listed = await client.listSessions({ limit: 25, category: 'Technical' });
    assert.equal(new URL(calls[0]!.url).pathname, '/v1/sessions');
    assert.equal(new URL(calls[0]!.url).searchParams.get('limit'), '25');
    assert.equal(new URL(calls[0]!.url).searchParams.get('category'), 'Technical');
    assert.equal(new Headers(calls[0]!.headers).get('authorization'), 'Bearer short-lived-token');
    assert.equal(listed.response.headers.get('etag'), '"3-0123456789abcdef01234567"');
    assert.deepEqual((await listed.facadeResponse.json()) as unknown, {
      data: [{ session, revision: 3 }], pagination: { nextCursor: null, hasMore: false },
    });

    await client.getSession('session-1');
    assert.equal(calls[1]!.url, 'https://keiko.example.test/v1/sessions/session-1');
    await client.createSession(session);
    assert.equal(calls[2]!.method, 'POST');
    assert.deepEqual(await calls[2]!.clone().json(), session);
    await client.updateSession('session-1', session, '"3"');
    assert.equal(calls[3]!.method, 'PUT');
    assert.equal(calls[3]!.headers.get('if-match'), '"3"');
    await client.deleteSession('session-1', '"3"');
    assert.equal(calls[4]!.method, 'DELETE');
    assert.equal(calls[4]!.headers.get('if-match'), '"3"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('typed client preserves error status and retry metadata without retrying mutations', async () => {
  const originalFetch = globalThis.fetch;
  const statuses = [401, 403, 404, 409, 412, 428, 429];
  let index = 0;
  const calls: Request[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.ok(input instanceof Request);
    calls.push(input);
    const status = statuses[index++]!;
    return Response.json({ error: { code: `status_${status}`, message: 'safe message' }, requestId: `request-${status}` }, {
      status,
      headers: status === 429 ? { 'Retry-After': '60', 'X-Request-Id': `request-${status}` } : {},
    });
  }) as typeof fetch;

  try {
    const client = createKeikoApiClient('https://keiko.example.test', 'token');
    for (const status of statuses) {
      const result = await client.updateSession('session-1', session, '"7"');
      assert.equal(result.response.status, status);
      assert.equal(result.response.headers.get('retry-after'), status === 429 ? '60' : null);
      assert.equal(result.error?.category, status === 401 || status === 403 ? 'authentication' :
        status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 412 ? 'stale_revision' :
        status === 428 ? 'missing_precondition' : 'rate_limited');
      assert.equal(result.error?.retryable, status === 429);
      assert.equal(result.error?.requestId, `request-${status}`);
      if (status === 429) assert.equal(result.error?.retryAfterMs, 60_000);
      const error = await result.facadeResponse.json() as { error: { code: string }; requestId: string };
      assert.equal(error.error.code, `status_${status}`);
      assert.equal(error.requestId, `request-${status}`);
    }
    assert.equal(calls.length, statuses.length);
    assert.ok(calls.every((request) => request.method === 'PUT'));
    assert.ok(calls.every((request) => request.headers.get('if-match') === '"7"'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('typed client does not log credentials and propagates transport failures', async () => {
  const originalFetch = globalThis.fetch;
  const networkError = new TypeError('network unavailable');
  globalThis.fetch = (async () => { throw networkError; }) as typeof fetch;
  try {
    await assert.rejects(
      createKeikoApiClient('https://keiko.example.test', 'secret-token').listSessions({ limit: 10 }),
      (error: unknown) => error instanceof KeikoTransportError && error.message.includes('could not reach')
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
