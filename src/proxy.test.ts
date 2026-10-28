import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { config, proxy } from './proxy';

test('Proxy attaches a per-request nonce CSP for the rendered application', () => {
  const response = proxy(new NextRequest('https://matmetrics.example.test/'));
  const csp = response.headers.get('content-security-policy');

  assert.ok(csp);
  assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/]+=*' 'strict-dynamic'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.ok(response.headers.get('x-middleware-request-content-security-policy'));
  assert.ok(config.matcher.some((matcher) => matcher.includes('_next/static')));
});
