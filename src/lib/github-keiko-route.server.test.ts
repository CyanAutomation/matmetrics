import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { validateKeikoGitHubRoute } from './github-keiko-route.server';

async function withTestAuth(run: () => Promise<void>) {
  const originalMode = process.env.MATMETRICS_AUTH_TEST_MODE;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
  Reflect.set(process.env, 'NODE_ENV', 'test');
  try {
    await run();
  } finally {
    if (originalMode === undefined) delete process.env.MATMETRICS_AUTH_TEST_MODE;
    else process.env.MATMETRICS_AUTH_TEST_MODE = originalMode;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
  }
}

function request(body: string, authorization = 'Bearer test-token') {
  return new NextRequest('http://localhost/api/github/validate', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body,
  });
}

test('accepts legacy owner/repository fields but validates and normalizes the selected branch', async () => {
  await withTestAuth(async () => {
    const result = await validateKeikoGitHubRoute(
      request(JSON.stringify({ owner: 'old-owner', repo: 'old-repo', branch: '  feature/judo  ' })),
      ['owner', 'repo', 'branch']
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.user.appUserId, 'test-user');
    assert.equal(result.branch, 'feature/judo');
    assert.deepEqual(result.body, { owner: 'old-owner', repo: 'old-repo', branch: '  feature/judo  ' });
  });
});

test('rejects unexpected fields and unsafe branch values', async () => {
  await withTestAuth(async () => {
    const unexpected = await validateKeikoGitHubRoute(
      request(JSON.stringify({ branch: 'main', installationId: 731 })),
      ['branch']
    );
    assert.equal(unexpected.ok, false);
    if (!unexpected.ok) assert.equal(unexpected.response.status, 400);

    const invalidBranch = await validateKeikoGitHubRoute(
      request(JSON.stringify({ branch: 'main\nX-Injected: true' })),
      ['branch']
    );
    assert.equal(invalidBranch.ok, false);
    if (!invalidBranch.ok) assert.equal(invalidBranch.response.status, 400);
  });
});

test('requires an authenticated caller before parsing a GitHub operation body', async () => {
  await withTestAuth(async () => {
    const result = await validateKeikoGitHubRoute(request('{}', ''), ['branch']);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 401);
  });
});
