import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAuthorizedGitHubConfig } from '@/lib/server-github-authz';
import { normalizeGitHubConfig } from '@/lib/session-storage';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

test('resolveAuthorizedGitHubConfig treats null and undefined missing-state inputs identically', async () => {
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
