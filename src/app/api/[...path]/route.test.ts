import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { GET, HEAD, OPTIONS, POST, PUT } from './route';

test('API dispatcher returns 404 for unknown API paths', async () => {
  const response = await GET(
    new NextRequest('http://localhost/api/not-a-real-endpoint')
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('API dispatcher keeps method availability specific to each endpoint', async () => {
  const request = new NextRequest('http://localhost/api/plugins/create', {
    method: 'PUT',
  });
  const response = await PUT(request);

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'OPTIONS, POST');
});

test('API dispatcher resolves dynamic paths before checking allowed methods', async () => {
  const request = new NextRequest('http://localhost/api/sessions/session%20id', {
    method: 'POST',
  });
  const response = await POST(request);

  assert.equal(response.status, 405);
  assert.equal(
    response.headers.get('Allow'),
    'GET, HEAD, OPTIONS, PUT, DELETE'
  );
});

test('API dispatcher reports route-specific methods for OPTIONS', async () => {
  const response = await OPTIONS(
    new NextRequest('http://localhost/api/preferences', { method: 'OPTIONS' })
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD, OPTIONS, PUT');
});

test('API dispatcher preserves HEAD behavior for GET endpoints', async () => {
  const request = new NextRequest('http://localhost/api/preferences', {
    method: 'HEAD',
  });
  const response = await HEAD(request);

  assert.equal(response.status, 401);
  assert.equal(await response.text(), '');
});

test('API dispatcher returns bodyless HEAD responses for unknown paths', async () => {
  const response = await HEAD(
    new NextRequest('http://localhost/api/not-a-real-endpoint', {
      method: 'HEAD',
    })
  );

  assert.equal(response.status, 404);
  assert.equal(await response.text(), '');
});
