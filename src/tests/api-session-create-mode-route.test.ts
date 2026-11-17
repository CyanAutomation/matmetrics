import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/sessions/create-mode/api-handler';
import { SESSION_CREATE_MODE_HEADER } from '@/lib/session-create-mode';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

test('create capability is derived from the verified account and server rollout flag', async () => {
  const originalCutoverUsers = process.env.KEIKO_SESSION_CUTOVER_USER_IDS;
  const originalEnabled = process.env.KEIKO_IDEMPOTENT_CREATE_ENABLED;
  process.env.KEIKO_SESSION_CUTOVER_USER_IDS = 'test-user';
  process.env.KEIKO_IDEMPOTENT_CREATE_ENABLED = 'true';

  try {
    const keikoResponse = await GET(new NextRequest('http://localhost/api/sessions/create-mode', {
      headers: {
        authorization: 'Bearer test-token',
        [SESSION_CREATE_MODE_HEADER]: 'legacy',
      },
    }));
    assert.equal(keikoResponse.headers.get(SESSION_CREATE_MODE_HEADER), 'keiko-idempotent');
    assert.equal((await keikoResponse.json()).mode, 'keiko-idempotent');
    assert.equal(keikoResponse.headers.get('cache-control'), 'private, no-store');

    process.env.KEIKO_IDEMPOTENT_CREATE_ENABLED = 'false';
    const pausedResponse = await GET(new NextRequest('http://localhost/api/sessions/create-mode', {
      headers: { authorization: 'Bearer test-token' },
    }));
    assert.equal(pausedResponse.headers.get(SESSION_CREATE_MODE_HEADER), 'keiko-unavailable');

    process.env.KEIKO_SESSION_CUTOVER_USER_IDS = '';
    const legacyResponse = await GET(new NextRequest('http://localhost/api/sessions/create-mode', {
      headers: { authorization: 'Bearer test-token' },
    }));
    assert.equal(legacyResponse.headers.get(SESSION_CREATE_MODE_HEADER), 'legacy');
  } finally {
    if (originalCutoverUsers === undefined) delete process.env.KEIKO_SESSION_CUTOVER_USER_IDS;
    else process.env.KEIKO_SESSION_CUTOVER_USER_IDS = originalCutoverUsers;
    if (originalEnabled === undefined) delete process.env.KEIKO_IDEMPOTENT_CREATE_ENABLED;
    else process.env.KEIKO_IDEMPOTENT_CREATE_ENABLED = originalEnabled;
  }
});
