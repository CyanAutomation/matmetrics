import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/github/sync-all/route';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

test('POST /api/github/sync-all rejects malformed and non-object JSON without proxying', async (t) => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;
  process.env.GITHUB_TOKEN = 'test-token';
  let proxyCalls = 0;
  global.fetch = async () => {
    proxyCalls += 1;
    throw new Error('proxy must not be called');
  };

  try {
    for (const body of ['{"owner":', '[]']) {
      await t.test(body, async () => {
        const response = await POST(
          new NextRequest('http://localhost/api/github/sync-all', {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body,
          })
        );
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          success: false,
          message: 'Invalid request body',
        });
        assert.equal(proxyCalls, 0);
      });
    }
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
});
