import assert from 'node:assert/strict';
import test from 'node:test';

import { callCloudflareAi } from './cloudflare-ai-client';

const request = { messages: [{ role: 'user' as const, content: 'practice' }] };

test('Cloudflare AI does not call the endpoint when its API token is missing', async () => {
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  delete process.env.CLOUDFLARE_API_TOKEN;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('must not fetch without a token');
  };

  try {
    await assert.rejects(
      callCloudflareAi(request),
      /CLOUDFLARE_API_TOKEN environment variable is not set/
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});

test('Cloudflare AI reports rejected credentials with a safe status', async () => {
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  process.env.CLOUDFLARE_API_TOKEN = 'expired-test-token';
  globalThis.fetch = async () =>
    Response.json({ error: { message: 'Bad credentials' } }, { status: 401 });
  console.error = () => {};

  try {
    await assert.rejects(
      callCloudflareAi(request),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { status?: number }).status === 401 &&
        error.message === 'Cloudflare AI authentication failed'
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});

test('Cloudflare AI surfaces an endpoint disconnect for safe service classification', async () => {
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalFetch = globalThis.fetch;
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };

  try {
    await assert.rejects(
      callCloudflareAi(request),
      (error: unknown) =>
        error instanceof TypeError && error.message === 'fetch failed'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});
