import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { GET } from './api-handler';

const authUrl = 'https://matmetrics-auth.example.workers.dev';
const authOrigin = 'https://matmetrics.example.test';
const keikoUrl = 'https://keiko.example.test';
const issuer = authOrigin;
const githubJwksUrl = `${authOrigin}/api/auth/jwks-github-installation-test`;

test('installation status does not activate Keiko routing for non-cutover accounts', async () => {
  const originalAuthMode = process.env.MATMETRICS_AUTH_TEST_MODE;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCutoverUsers = process.env.KEIKO_SESSION_CUTOVER_USER_IDS;
  const originalFetch = globalThis.fetch;
  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
  Reflect.set(process.env, 'NODE_ENV', 'test');
  process.env.KEIKO_SESSION_CUTOVER_USER_IDS = 'another-user';
  let outboundCalls = 0;
  globalThis.fetch = (async () => {
    outboundCalls += 1;
    throw new Error('non-cutover status must not call Keiko');
  }) as typeof fetch;

  try {
    const response = await GET(new NextRequest(`${authOrigin}/api/github/installation`, {
      headers: {
        authorization: 'Bearer test-token',
        cookie: '__Secure-better-auth.session_token=session-value',
        'sec-fetch-site': 'same-origin',
      },
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { cutover: false, connected: false, installation: null });
    assert.equal(outboundCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAuthMode === undefined) delete process.env.MATMETRICS_AUTH_TEST_MODE;
    else process.env.MATMETRICS_AUTH_TEST_MODE = originalAuthMode;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
    if (originalCutoverUsers === undefined) delete process.env.KEIKO_SESSION_CUTOVER_USER_IDS;
    else process.env.KEIKO_SESSION_CUTOVER_USER_IDS = originalCutoverUsers;
  }
});

test('installation status marks the response as Keiko cutover for routed accounts', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const keyId = 'keiko-installation-status-test-key';
  const publicJwk = { ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: keyId, use: 'sig' };
  const token = await new SignJWT({ appUserId: 'test-user', scope: 'backups:read' })
    .setProtectedHeader({ alg: 'EdDSA', kid: keyId })
    .setSubject('test-user')
    .setIssuer(issuer)
    .setAudience('keiko-dojo-api')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries([
    'MATMETRICS_AUTH_TEST_MODE', 'NODE_ENV', 'KEIKO_SESSION_CUTOVER_USER_IDS',
    'CLOUDFLARE_AUTH_WORKER_URL', 'CLOUDFLARE_AUTH_WORKER_HOST', 'KEIKO_API_BASE_URL',
    'MATMETRICS_AUTH_FRONTEND_ORIGIN', 'MATMETRICS_AUTH_ISSUER', 'MATMETRICS_AUTH_JWKS_URL',
  ].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MATMETRICS_AUTH_TEST_MODE: 'true',
    KEIKO_SESSION_CUTOVER_USER_IDS: 'test-user',
    CLOUDFLARE_AUTH_WORKER_URL: authUrl,
    CLOUDFLARE_AUTH_WORKER_HOST: new URL(authUrl).hostname,
    KEIKO_API_BASE_URL: keikoUrl,
    MATMETRICS_AUTH_FRONTEND_ORIGIN: authOrigin,
    MATMETRICS_AUTH_ISSUER: issuer,
    MATMETRICS_AUTH_JWKS_URL: githubJwksUrl,
  });
  Reflect.set(process.env, 'NODE_ENV', 'test');
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${authUrl}/__internal/keiko-token`) {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        expectedUserId: 'test-user', scopes: ['backups:read'],
      });
      return Response.json({ token, scopes: ['backups:read'] });
    }
    if (url === githubJwksUrl) return Response.json({ keys: [publicJwk] });
    if (url === `${keikoUrl}/v1/backups/github-installation`) {
      return Response.json({
        connected: true,
        installation: { owner: 'CyanAutomation', repository: 'matmetrics' },
      });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  }) as typeof fetch;

  try {
    const response = await GET(new NextRequest(`${authOrigin}/api/github/installation`, {
      headers: {
        authorization: 'Bearer test-token',
        cookie: '__Secure-better-auth.session_token=session-value',
        'sec-fetch-site': 'same-origin',
      },
    }));

    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(await response.json(), {
      cutover: true,
      connected: true,
      installation: { owner: 'CyanAutomation', repository: 'matmetrics' },
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else Reflect.set(process.env, key, value);
    }
  }
});
