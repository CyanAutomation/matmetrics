import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { config, proxy } from './proxy';

test('Proxy attaches a per-request nonce CSP for the rendered application', () => {
  const request = new NextRequest('https://matmetrics.example.test/', {
    headers: { 'x-nonce': 'attacker-controlled' },
  });
  const response = proxy(request);
  const csp = response.headers.get('content-security-policy');

  assert.ok(csp);
  assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/]+=*' 'strict-dynamic'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce);
  assert.equal(response.headers.get('x-middleware-request-x-nonce'), nonce);
  assert.equal(
    response.headers.get('x-middleware-request-content-security-policy'),
    csp
  );
  assert.notEqual(nonce, 'attacker-controlled');
  assert.ok(config.matcher.some((matcher) => matcher.includes('_next/static')));
});
