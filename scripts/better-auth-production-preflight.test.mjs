import assert from 'node:assert/strict';
import test from 'node:test';
import { runBetterAuthProductionPreflight } from './better-auth-production-preflight.mjs';

test('preflight probes only the Worker health and same-origin JWKS GETs', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify(
        url.endsWith('/healthz') ? { ok: true } : { keys: [{ kty: 'OKP' }] }
      ),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const result = await runBetterAuthProductionPreflight({
    appOrigin: 'https://app.example.test',
    workerOrigin: 'https://auth.example.test',
    fetchImpl,
  });

  assert.equal(result.passed, true);
  assert.equal(result.readOnly, true);
  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method]),
    [
      ['https://auth.example.test/healthz', 'GET'],
      ['https://app.example.test/api/auth/jwks', 'GET'],
    ]
  );
  assert.ok(requests.every(({ options }) => options.redirect === 'error'));
});

test('preflight reports an unexpected public JWKS response as a failure', async () => {
  const result = await runBetterAuthProductionPreflight({
    appOrigin: 'https://app.example.test',
    workerOrigin: 'https://auth.example.test',
    fetchImpl: async (url) =>
      new Response(JSON.stringify(url.endsWith('/healthz') ? { ok: true } : { keys: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.find((check) => check.name === 'same-origin-jwks')?.ok, false);
});

test('preflight refuses plain HTTP origins outside loopback', async () => {
  await assert.rejects(
    runBetterAuthProductionPreflight({
      appOrigin: 'http://app.example.test',
      workerOrigin: 'https://auth.example.test',
      fetchImpl: async () => {
        throw new Error('fetch should not be reached');
      },
    }),
    /HTTPS origin/
  );
});
