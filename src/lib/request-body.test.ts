import assert from 'node:assert/strict';
import test from 'node:test';

import { parseJsonObjectBody } from './request-body';

test('parseJsonObjectBody reports syntax and shape failures', async () => {
  assert.deepEqual(await parseJsonObjectBody(new Request('http://test')), {
    ok: false,
    reason: 'invalid-json',
  });
  assert.deepEqual(
    await parseJsonObjectBody(
      new Request('http://test', { method: 'POST', body: 'null' })
    ),
    { ok: false, reason: 'not-an-object' }
  );
});

test('parseJsonObjectBody lets unexpected request failures escape', async () => {
  const failure = new Error('stream failed');
  const request = {
    json: async () => {
      throw failure;
    },
  } as Request;

  await assert.rejects(parseJsonObjectBody(request), failure);
});
