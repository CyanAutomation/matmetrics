import assert from 'node:assert/strict';
import test from 'node:test';

import nextConfig from '../../next.config';
import {
  createContentSecurityPolicy,
  getSecurityHeaders,
} from './security-headers';

test('Next config applies defensive security headers to every route', async () => {
  const config = nextConfig as typeof nextConfig & {
    headers?: () => Promise<Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }>>;
  };
  assert.equal(typeof config.headers, 'function');

  const mutableProcessEnv = process.env as unknown as Record<string, string | undefined>;
  const previousNodeEnv = mutableProcessEnv.NODE_ENV;
  mutableProcessEnv.NODE_ENV = 'production';
  let rules: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
  try {
    rules = await config.headers!();
  } finally {
    if (previousNodeEnv === undefined) delete mutableProcessEnv.NODE_ENV;
    else mutableProcessEnv.NODE_ENV = previousNodeEnv;
  }
  const globalRule = rules.find((rule) => rule.source === '/(.*)');
  assert.ok(globalRule);
  const headers = new Map(
    globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value])
  );

  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(headers.get('strict-transport-security') ?? '', /^max-age=/);
  assert.match(headers.get('permissions-policy') ?? '', /camera=\(\)/);
});

test('HSTS is limited to production and does not assume subdomain HTTPS', () => {
  assert.equal(
    getSecurityHeaders(false).some(({ key }) => key === 'Strict-Transport-Security'),
    false
  );
  const hsts = getSecurityHeaders(true).find(
    ({ key }) => key === 'Strict-Transport-Security'
  );
  assert.equal(hsts?.value, 'max-age=31536000');
});

test('production CSP uses a nonce without unsafe inline scripts or eval', () => {
  const csp = createContentSecurityPolicy('test-nonce', true);
  assert.match(csp, /script-src 'self' 'nonce-test-nonce' 'strict-dynamic'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(?:inline|eval)'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
});
