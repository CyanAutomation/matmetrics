import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { DELETE, GET as GET_SESSION, PUT } from '@/app/api/sessions/[id]/api-handler';
import { GET as GET_SESSION_LIST } from '@/app/api/sessions/list/api-handler';

const authOrigin = 'https://matmetrics.example.test';
const authWorkerUrl = 'https://matmetrics-auth.example.workers.dev';
const keikoOrigin = 'https://keiko.example.test';
const userId = 'test-user';

async function withKeikoRoute(
  run: (input: {
    request: (method: 'GET' | 'PUT' | 'DELETE', ifMatch?: string, path?: string) => NextRequest;
    requests: Array<{ url: string; method: string; headers: Headers; body?: string }>;
  }) => Promise<void>,
  scopes = ['sessions:read', 'sessions:write']
): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const suffix = crypto.randomUUID();
  const jwksUrl = `${authOrigin}/api/auth/jwks-${suffix}`;
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    alg: 'EdDSA',
    kid: `keiko-route-${suffix}`,
    use: 'sig',
  };
  const token = await new SignJWT({ appUserId: userId, scope: scopes.join(' ') })
    .setProtectedHeader({ alg: 'EdDSA', kid: `keiko-route-${suffix}` })
    .setSubject(userId)
    .setIssuer(authOrigin)
    .setAudience('keiko-dojo-api')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const requests: Array<{ url: string; method: string; headers: Headers; body?: string }> = [];
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries([
    'CLOUDFLARE_AUTH_WORKER_URL',
    'CLOUDFLARE_AUTH_WORKER_HOST',
    'KEIKO_API_BASE_URL',
    'KEIKO_SESSION_CUTOVER_USER_IDS',
    'MATMETRICS_AUTH_FRONTEND_ORIGIN',
    'MATMETRICS_AUTH_ISSUER',
    'MATMETRICS_AUTH_JWKS_URL',
    'MATMETRICS_AUTH_TEST_MODE',
  ].map((key) => [key, process.env[key]]));

  Object.assign(process.env, {
    CLOUDFLARE_AUTH_WORKER_URL: authWorkerUrl,
    CLOUDFLARE_AUTH_WORKER_HOST: new URL(authWorkerUrl).hostname,
    KEIKO_API_BASE_URL: keikoOrigin,
    KEIKO_SESSION_CUTOVER_USER_IDS: userId,
    MATMETRICS_AUTH_FRONTEND_ORIGIN: authOrigin,
    MATMETRICS_AUTH_ISSUER: authOrigin,
    MATMETRICS_AUTH_JWKS_URL: jwksUrl,
    MATMETRICS_AUTH_TEST_MODE: 'true',
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      method,
      headers,
      ...(init?.body === undefined ? {} : { body: String(init.body) }),
    });
    if (url === `${authWorkerUrl}/__internal/keiko-token`) {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        expectedUserId: userId,
        scopes,
      });
      return Response.json({ token, scopes });
    }
    if (url === jwksUrl) return Response.json({ keys: [publicJwk] });
    if (url.startsWith(`${keikoOrigin}/v1/sessions?`)) {
      return Response.json({
        data: [{
          session: {
            id: 'session-concurrency',
            date: '2026-11-01',
            techniques: [],
            effort: 3,
            category: 'Technical',
          },
          revision: 1,
        }],
        pagination: { hasMore: false, nextCursor: null },
      });
    }
    if (url === `${keikoOrigin}/v1/sessions/session-concurrency`) {
      if ((method === 'PUT' || method === 'DELETE') && !headers.has('if-match')) {
        return Response.json({ error: 'If-Match is required' }, { status: 428 });
      }
      if (headers.get('if-match') === '"stale"') {
        return Response.json({ error: 'Session has changed' }, { status: 412 });
      }
      if (method === 'DELETE') return new Response(null, { status: 204 });
      if (method === 'PUT') {
        return Response.json(
          {
            data: {
              session: {
                id: 'session-concurrency',
                date: '2026-11-01',
                techniques: [],
                effort: 4,
                category: 'Technical',
              },
              revision: 2,
            },
          },
          { headers: { etag: `"2-${'b'.repeat(24)}"` } }
        );
      }
      return Response.json(
        {
          data: {
            session: {
              id: 'session-concurrency',
              date: '2026-11-01',
              techniques: [],
              effort: 3,
              category: 'Technical',
            },
            revision: 1,
          },
        },
        { headers: { etag: `"1-${'a'.repeat(24)}"` } }
      );
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  }) as typeof fetch;

  try {
    await run({
      requests,
      request: (method, ifMatch, path = '/api/sessions/session-concurrency') => new NextRequest(`${authOrigin}${path}`, {
        method,
        headers: {
          authorization: 'Bearer test-token',
          cookie: 'better-auth.session_token=session-value',
          origin: authOrigin,
          'sec-fetch-site': 'same-origin',
          'content-type': 'application/json',
          ...(ifMatch ? { 'if-match': ifMatch } : {}),
        },
        ...(method === 'PUT'
          ? { body: JSON.stringify({
              id: 'session-concurrency',
              date: '2026-11-01',
              techniques: [],
              effort: 4,
              category: 'Technical',
              notes: 'edited by this client',
            }) }
          : {}),
      }),
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Keiko update forwards the revision read by the client without a pre-write GET', async () => {
  await withKeikoRoute(async ({ request, requests }) => {
    const response = await PUT(request('PUT', '"1"'), {
      params: Promise.resolve({ id: 'session-concurrency' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(
      requests.filter(({ url }) => url.startsWith(`${keikoOrigin}/`)).map(({ method }) => method),
      ['PUT']
    );
    const forwarded = requests.find(({ url }) => url === `${keikoOrigin}/v1/sessions/session-concurrency`);
    assert.ok(forwarded);
    assert.equal(forwarded.headers.get('if-match'), '"1"');
    assert.equal(JSON.parse(forwarded.body ?? '{}').keikoRevision, undefined);
    assert.equal((await response.json()).keikoRevision, 2);
  });
});

test('Keiko delete forwards the revision read by the client without a pre-write GET', async () => {
  await withKeikoRoute(async ({ request, requests }) => {
    const response = await DELETE(request('DELETE', '"1"'), {
      params: Promise.resolve({ id: 'session-concurrency' }),
    });

    assert.equal(response.status, 204);
    assert.deepEqual(
      requests.filter(({ url }) => url.startsWith(`${keikoOrigin}/`)).map(({ method }) => method),
      ['DELETE']
    );
    const forwarded = requests.find(({ url }) => url === `${keikoOrigin}/v1/sessions/session-concurrency`);
    assert.ok(forwarded);
    assert.equal(forwarded.headers.get('if-match'), '"1"');
  });
});

test('Keiko list revisions reach the client session snapshot', async () => {
  await withKeikoRoute(async ({ request }) => {
    const response = await GET_SESSION_LIST(
      request('GET', undefined, '/api/sessions/list')
    );

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).sessions[0], {
      id: 'session-concurrency',
      date: '2026-11-01',
      techniques: [],
      effort: 3,
      category: 'Technical',
      keikoRevision: 1,
    });
  }, ['sessions:read']);
});

test('Keiko detail response preserves its strong ETag and exposes the revision snapshot', async () => {
  await withKeikoRoute(async ({ request }) => {
    const response = await GET_SESSION(request('GET'), {
      params: Promise.resolve({ id: 'session-concurrency' }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('etag'), `"1-${'a'.repeat(24)}"`);
    assert.equal((await response.json()).keikoRevision, 1);
  }, ['sessions:read']);
});

test('Keiko stale update and delete responses remain visible to the client', async () => {
  await withKeikoRoute(async ({ request, requests }) => {
    const updateResponse = await PUT(request('PUT', '"stale"'), {
      params: Promise.resolve({ id: 'session-concurrency' }),
    });
    const deleteResponse = await DELETE(request('DELETE', '"stale"'), {
      params: Promise.resolve({ id: 'session-concurrency' }),
    });

    assert.equal(updateResponse.status, 412);
    assert.equal(deleteResponse.status, 412);
    assert.deepEqual(
      requests.filter(({ url }) => url.startsWith(`${keikoOrigin}/`)).map(({ method }) => method),
      ['PUT', 'DELETE']
    );
  });
});

test('Keiko missing update and delete preconditions are not replaced with a fresh revision', async () => {
  await withKeikoRoute(async ({ request, requests }) => {
    const updateResponse = await PUT(request('PUT'), {
      params: Promise.resolve({ id: 'session-concurrency' }),
    });
    const deleteResponse = await DELETE(request('DELETE'), {
      params: Promise.resolve({ id: 'session-concurrency' }),
    });

    assert.equal(updateResponse.status, 428);
    assert.equal(deleteResponse.status, 428);
    const writes = requests.filter(({ url }) => url.startsWith(`${keikoOrigin}/`));
    assert.deepEqual(writes.map(({ method }) => method), ['PUT', 'DELETE']);
    assert.ok(writes.every(({ headers }) => !headers.has('if-match')));
  });
});
