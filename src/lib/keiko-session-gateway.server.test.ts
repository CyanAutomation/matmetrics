import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, SignJWT, exportJWK } from 'jose';
import { NextRequest } from 'next/server';
import { forwardSessionRequestToKeiko } from './keiko-session-gateway.server';
import { POST as createSessionRoute } from '../app/api/sessions/create/api-handler';

const authUrl = 'https://matmetrics-auth.example.workers.dev';
const authOrigin = 'https://matmetrics.example.test';
const keikoUrl = 'https://keiko.example.test';
const issuer = authOrigin;
const jwksUrl = `${authOrigin}/api/auth/jwks`;
const userId = 'better-user-123';

const withEnv = async (
  fn: () => Promise<void>,
  overrides: Record<string, string | undefined>
) => {
  const saved = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, overrides);
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('forwards only the Better Auth session cookie to the trusted Worker and only the Keiko JWT to Keiko', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
  });
  const keyId = 'keiko-gateway-test-key';
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    alg: 'EdDSA',
    kid: keyId,
    use: 'sig',
  };
  const token = await new SignJWT({
    appUserId: userId,
    scope: 'sessions:read',
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: keyId })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience('keiko-dojo-api')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const originalFetch = globalThis.fetch;
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    seen.push({ url, init });
    if (url === `${authUrl}/__internal/keiko-token`) {
      return Response.json({ token, scopes: ['sessions:read'] });
    }
    if (url === jwksUrl) return Response.json({ keys: [publicJwk] });
    if (url === `${keikoUrl}/v1/sessions`) {
      return Response.json({
        data: [],
        pagination: { hasMore: false, nextCursor: null },
      });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  }) as typeof fetch;

  try {
    await withEnv(
      async () => {
        const request = new NextRequest(`${authOrigin}/api/sessions/list`, {
          headers: {
            authorization: 'Bearer matmetrics-api-token',
            cookie:
              `__Secure-better-auth.session_token=session-value; theme=dark; ` +
              `github_access_token=must-not-forward`,
            origin: authOrigin,
            'sec-fetch-site': 'same-origin',
          },
        });
        const response = await forwardSessionRequestToKeiko(request, {
          userId,
          appUserId: userId,
          provider: 'better-auth',
          email: null,
          displayName: null,
          emailVerified: true,
        }, {
          path: '/v1/sessions',
          method: 'GET',
          scope: 'sessions:read',
        });

        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        assert.doesNotMatch(await response.text(), /eyJ/);

        const authCall = seen.find((call) => call.url === `${authUrl}/__internal/keiko-token`);
        assert.ok(authCall);
        const authHeaders = new Headers(authCall.init?.headers);
        assert.equal(
          authHeaders.get('cookie'),
          '__Secure-better-auth.session_token=session-value'
        );
        assert.equal(authHeaders.get('authorization'), 'Bearer matmetrics-api-token');
        assert.equal(authHeaders.get('origin'), authOrigin);
        assert.equal(authCall.init?.redirect, 'error');
        assert.deepEqual(JSON.parse(String(authCall.init?.body)), {
          expectedUserId: userId,
          scopes: ['sessions:read'],
        });

        const keikoCall = seen.find((call) => call.url === `${keikoUrl}/v1/sessions`);
        assert.ok(keikoCall);
        const keikoHeaders = new Headers(keikoCall.init?.headers);
        assert.equal(keikoHeaders.get('authorization'), `Bearer ${token}`);
        assert.equal(keikoHeaders.get('cookie'), null);
      },
      {
        CLOUDFLARE_AUTH_WORKER_URL: authUrl,
        CLOUDFLARE_AUTH_WORKER_HOST: new URL(authUrl).hostname,
        KEIKO_API_BASE_URL: keikoUrl,
        MATMETRICS_AUTH_FRONTEND_ORIGIN: authOrigin,
        MATMETRICS_AUTH_ISSUER: issuer,
        MATMETRICS_AUTH_JWKS_URL: jwksUrl,
        NODE_ENV: 'production',
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects CSRF, missing or ambiguous cookies, and untrusted Auth Worker URLs before fetch', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ token: 'should-not-be-used' });
  }) as typeof fetch;
  try {
    await withEnv(async () => {
      const principal = {
        userId,
        appUserId: userId,
        provider: 'better-auth' as const,
        email: null,
        displayName: null,
        emailVerified: true,
      };
      const cookie = '__Secure-better-auth.session_token=session-value';
      const cases = [
        { origin: 'https://attacker.example', 'sec-fetch-site': 'same-origin' },
        { origin: authOrigin, 'sec-fetch-site': 'cross-site' },
        { origin: authOrigin, 'sec-fetch-site': 'same-origin', cookie: 'theme=dark' },
        {
          origin: authOrigin,
          'sec-fetch-site': 'same-origin',
          cookie: `${cookie}; ${cookie}`,
        },
      ];
      for (const headers of cases) {
        const requestHeaders = new Headers({ authorization: 'Bearer valid' });
        for (const [key, value] of Object.entries(headers)) {
          if (typeof value === 'string') requestHeaders.set(key, value);
        }
        const request = new NextRequest(`${authOrigin}/api/sessions/list`, {
          headers: requestHeaders,
        });
        const response = await forwardSessionRequestToKeiko(request, principal, {
          path: '/v1/sessions',
          method: 'GET',
          scope: 'sessions:read',
        });
        assert.equal(response.ok, false);
      }

      await withEnv(async () => {
        const request = new NextRequest(`${authOrigin}/api/sessions/list`, {
          headers: {
            authorization: 'Bearer valid',
            cookie,
            origin: authOrigin,
            'sec-fetch-site': 'same-origin',
          },
        });
        const response = await forwardSessionRequestToKeiko(request, principal, {
          path: '/v1/sessions',
          method: 'GET',
          scope: 'sessions:read',
        });
        assert.equal(response.status, 503);
      }, {
        CLOUDFLARE_AUTH_WORKER_URL: 'https://attacker.example',
        CLOUDFLARE_AUTH_WORKER_HOST: new URL(authUrl).hostname,
      });
      await withEnv(async () => {
        const request = new NextRequest(`${authOrigin}/api/sessions/list`, {
          headers: {
            authorization: 'Bearer valid',
            cookie,
            origin: authOrigin,
            'sec-fetch-site': 'same-origin',
          },
        });
        const response = await forwardSessionRequestToKeiko(request, principal, {
          path: '/v1/sessions',
          method: 'GET',
          scope: 'sessions:read',
        });
        assert.equal(response.status, 503);
      }, {
        CLOUDFLARE_AUTH_WORKER_URL: 'https://attacker.workers.dev',
        CLOUDFLARE_AUTH_WORKER_HOST: new URL(authUrl).hostname,
      });
    }, {
      CLOUDFLARE_AUTH_WORKER_URL: authUrl,
      CLOUDFLARE_AUTH_WORKER_HOST: new URL(authUrl).hostname,
      KEIKO_API_BASE_URL: keikoUrl,
      MATMETRICS_AUTH_FRONTEND_ORIGIN: authOrigin,
      MATMETRICS_AUTH_ISSUER: issuer,
      MATMETRICS_AUTH_JWKS_URL: jwksUrl,
      NODE_ENV: 'production',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0);
});

test('rejects a missing MatMetrics bearer token before exchanging the session cookie', async () => {
  const originalFetch = globalThis.fetch;
  let authExchangeCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/__internal/keiko-token')) authExchangeCalls += 1;
    throw new Error(`Unexpected outbound request: ${url}`);
  }) as typeof fetch;
  try {
    const request = new NextRequest(`${authOrigin}/api/sessions/create`, {
      method: 'POST',
      headers: {
        cookie: '__Secure-better-auth.session_token=session-value',
        origin: authOrigin,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'must-not-create',
        date: '2026-10-17',
        techniques: ['Uchi mata'],
        effort: 3,
        category: 'Technical',
      }),
    });
    const response = await createSessionRoute(request);
    assert.equal(response.status, 401);
    assert.equal(authExchangeCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fails closed on an identity mismatch and does not call Keiko or expose the JWT', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
  });
  const keyId = 'keiko-gateway-mismatch-key';
  const mismatchJwksUrl = `${authOrigin}/keiko-mismatch-jwks`;
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    alg: 'EdDSA',
    kid: keyId,
    use: 'sig',
  };
  const token = await new SignJWT({ appUserId: 'another-user', scope: 'sessions:read' })
    .setProtectedHeader({ alg: 'EdDSA', kid: keyId })
    .setSubject('another-user')
    .setIssuer(issuer)
    .setAudience('keiko-dojo-api')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url === `${authUrl}/__internal/keiko-token`) {
      return Response.json({ token, scopes: ['sessions:read'] });
    }
    if (url === mismatchJwksUrl) return Response.json({ keys: [publicJwk] });
    throw new Error(`Keiko should not be reached: ${url}`);
  }) as typeof fetch;
  try {
    await withEnv(async () => {
      const request = new NextRequest(`${authOrigin}/api/sessions/list`, {
        headers: {
          authorization: 'Bearer matmetrics-api-token',
          cookie: 'better-auth.session_token=session-value',
          origin: authOrigin,
          'sec-fetch-site': 'same-origin',
        },
      });
      const response = await forwardSessionRequestToKeiko(request, {
        userId,
        appUserId: userId,
        provider: 'better-auth',
        email: null,
        displayName: null,
        emailVerified: true,
      }, {
        path: '/v1/sessions',
        method: 'GET',
        scope: 'sessions:read',
      });
      assert.notEqual(response.status, 200);
      assert.doesNotMatch(await response.text(), /eyJ/);
    }, {
      CLOUDFLARE_AUTH_WORKER_URL: authUrl,
      CLOUDFLARE_AUTH_WORKER_HOST: new URL(authUrl).hostname,
      KEIKO_API_BASE_URL: keikoUrl,
      MATMETRICS_AUTH_FRONTEND_ORIGIN: authOrigin,
      MATMETRICS_AUTH_ISSUER: issuer,
      MATMETRICS_AUTH_JWKS_URL: mismatchJwksUrl,
      NODE_ENV: 'production',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls, [`${authUrl}/__internal/keiko-token`, mismatchJwksUrl]);
});
