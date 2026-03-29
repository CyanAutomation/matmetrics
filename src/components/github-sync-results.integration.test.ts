import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runLoadGitHubSyncHistory,
  type GitHubSyncHistoryData,
  type GitHubSyncSurfaceState,
} from './github-sync-results';

test('runLoadGitHubSyncHistory emits loading -> error and loading -> empty transitions for mocked API responses', async () => {
  const transitions: Array<GitHubSyncSurfaceState<GitHubSyncHistoryData>> = [];

  await runLoadGitHubSyncHistory({
    owner: 'octocat',
    repo: 'matmetrics',
    branch: 'main',
    getHeaders: async () => ({ Authorization: 'Bearer test' }),
    fetchImpl: async () =>
      new Response(JSON.stringify({ success: false, message: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    onStateChange: (state) => transitions.push(state),
  });

  await runLoadGitHubSyncHistory({
    owner: 'octocat',
    repo: 'matmetrics',
    branch: 'main',
    getHeaders: async () => ({ Authorization: 'Bearer test' }),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: true,
          message: 'Diagnosed 0 markdown file(s)',
          summary: { totalFiles: 0, validFiles: 0, invalidFiles: 0 },
          files: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    onStateChange: (state) => transitions.push(state),
  });

  assert.equal(transitions[0]?.status, 'loading');
  assert.equal(transitions[1]?.status, 'error');
  assert.equal(transitions[2]?.status, 'loading');
  assert.equal(transitions[3]?.status, 'empty');
});
