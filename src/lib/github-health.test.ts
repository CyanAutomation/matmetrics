import assert from 'node:assert/strict';
import test from 'node:test';

import { checkGitHubHealth } from './github-health';

test('checkGitHubHealth requests the configured repository with cancellation enabled', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;

  process.env.GITHUB_TOKEN = 'test-token';
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return Response.json(
      { default_branch: 'main' },
      {
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': '1760000000',
        },
      }
    );
  };

  try {
    const result = await checkGitHubHealth({
      owner: 'owner with spaces',
      repo: 'repo/name',
    });

    assert.equal(
      requestedUrl,
      'https://api.github.com/repos/owner%20with%20spaces/repo%2Fname'
    );
    assert.equal(
      (requestedInit?.headers as Record<string, string>).Authorization,
      'token test-token'
    );
    assert.ok(requestedInit?.signal instanceof AbortSignal);
    assert.equal(result.success, true);
    assert.equal(result.branch, 'main');
    assert.deepEqual(result.rateLimit, {
      limit: 5000,
      remaining: 4999,
      resetAt: new Date(1760000000 * 1000).toISOString(),
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

test('checkGitHubHealth reports an aborted GitHub request as a timeout', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  globalThis.fetch = async (_input, init) => {
    const controller = init?.signal;
    assert.ok(controller);
    Object.defineProperty(controller, 'aborted', { value: true });
    throw new DOMException('Aborted', 'AbortError');
  };

  try {
    await assert.rejects(
      checkGitHubHealth({ owner: 'owner', repo: 'repo' }),
      /GitHub API request timed out/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});
