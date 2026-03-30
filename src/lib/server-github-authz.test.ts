import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAuthorizedGitHubConfig } from '@/lib/server-github-authz';
import { normalizeGitHubConfig } from '@/lib/session-storage';

const ENV_KEYS = [
  'MATMETRICS_AUTH_TEST_MODE',
  'MATMETRICS_TEST_USER_GITHUB_CONFIG',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const envSnapshot = new Map<EnvKey, string | undefined>();

test.beforeEach(() => {
  for (const key of ENV_KEYS) {
    envSnapshot.set(key, process.env[key]);
  }

  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
});

test.afterEach(() => {
  for (const key of ENV_KEYS) {
    const originalValue = envSnapshot.get(key);
    if (originalValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = originalValue;
  }

  envSnapshot.clear();
});

test('resolveAuthorizedGitHubConfig treats null and undefined missing-state inputs identically', async () => {
  delete process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG;

  const undefinedRequested = normalizeGitHubConfig(undefined);
  const nullRequested = normalizeGitHubConfig(null);

  assert.equal(undefinedRequested, undefined);
  assert.equal(nullRequested, undefined);

  const fromUndefined = await resolveAuthorizedGitHubConfig(
    'test-user',
    undefinedRequested
  );
  const fromNull = await resolveAuthorizedGitHubConfig(
    'test-user',
    nullRequested
  );

  assert.deepEqual(fromUndefined, {
    config: { owner: 'test-owner', repo: 'test-repo' },
  });
  assert.deepEqual(fromNull, {
    config: { owner: 'test-owner', repo: 'test-repo' },
  });
});

test('resolveAuthorizedGitHubConfig allows omitted requested branch when stored branch is present', async () => {
  process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = JSON.stringify({
    owner: 'test-owner',
    repo: 'test-repo',
    branch: 'main',
  });

  const result = await resolveAuthorizedGitHubConfig('test-user', {
    owner: 'test-owner',
    repo: 'test-repo',
  });

  assert.deepEqual(result, {
    config: { owner: 'test-owner', repo: 'test-repo', branch: 'main' },
  });
});

test('resolveAuthorizedGitHubConfig rejects explicit mismatched branch', async () => {
  process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = JSON.stringify({
    owner: 'test-owner',
    repo: 'test-repo',
    branch: 'main',
  });

  const result = await resolveAuthorizedGitHubConfig('test-user', {
    owner: 'test-owner',
    repo: 'test-repo',
    branch: 'develop',
  });

  assert.equal(result.config, undefined);
  assert.equal(result.forbiddenResponse?.status, 403);
});
