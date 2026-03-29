import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runLoadGitHubSyncHistory,
  type GitHubSyncHistoryData,
  type GitHubSyncSurfaceState,
} from './github-sync-results';

function isMessageState(
  state: GitHubSyncSurfaceState<GitHubSyncHistoryData>
): state is
  | Extract<GitHubSyncSurfaceState<GitHubSyncHistoryData>, { message: string }>
  | Extract<GitHubSyncSurfaceState<GitHubSyncHistoryData>, { status: 'error' }>
  | Extract<GitHubSyncSurfaceState<GitHubSyncHistoryData>, { status: 'empty' }> {
  return 'message' in state;
}

test('runLoadGitHubSyncHistory maps error and empty responses to semantic user-facing messages', async () => {
  const states: Array<GitHubSyncSurfaceState<GitHubSyncHistoryData>> = [];

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
    onStateChange: (state) => states.push(state),
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
    onStateChange: (state) => states.push(state),
  });

  assert.deepEqual(
    states.map((state) => state.status),
    ['loading', 'error', 'loading', 'empty']
  );

  const errorState = states[1];
  const emptyState = states[3];

  assert.ok(errorState && isMessageState(errorState));
  assert.ok(emptyState && isMessageState(emptyState));
  assert.match(errorState.message, /^Forbidden$/);
  assert.match(
    emptyState.message,
    /No sync history is available yet\. Run sync to generate repository diagnostics\./
  );
});

test('runLoadGitHubSyncHistory maps summary payload fields and warnings into success state data', async () => {
  const states: Array<GitHubSyncSurfaceState<GitHubSyncHistoryData>> = [];

  await runLoadGitHubSyncHistory({
    owner: 'octocat',
    repo: 'matmetrics',
    branch: 'release',
    getHeaders: async () => ({ Authorization: 'Bearer test' }),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          message: 'Diagnosed 2 markdown file(s) with 1 invalid file(s)',
          branch: 'release',
          summary: { totalFiles: 2, invalidFiles: 1 },
          files: [
            {
              path: 'data/2026/03/20260301-matmetrics.md',
              status: 'invalid',
              errors: ['duplicate id'],
              id: 'session-1',
              date: '2026-03-01',
            },
            {
              path: 'data/2026/03/20260302-matmetrics.md',
              status: 'valid',
              errors: [],
              id: 'session-2',
              date: '2026-03-02',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    onStateChange: (state) => states.push(state),
  });

  assert.deepEqual(
    states.map((state) => state.status),
    ['loading', 'success']
  );

  const successState = states[1];
  assert.ok(successState?.status === 'success');
  assert.equal(successState.data.branch, 'release');
  assert.equal(successState.data.totalFiles, 2);
  assert.equal(successState.data.invalidFiles, 1);
  assert.equal(successState.data.files.length, 2);
  assert.match(successState.warnings[0] ?? '', /1 file have validation issues/i);
  assert.match(
    successState.warnings[1] ?? '',
    /data\/2026\/03\/20260301-matmetrics\.md: duplicate id/
  );
});

test('runLoadGitHubSyncHistory supports retry callback behavior by allowing a second invocation to recover from an error', async () => {
  const failureThenRetry: string[] = [];

  const runLoad = async (fetchImpl: typeof fetch) => {
    await runLoadGitHubSyncHistory({
      owner: 'octocat',
      repo: 'matmetrics',
      branch: 'main',
      getHeaders: async () => ({ Authorization: 'Bearer retry' }),
      fetchImpl,
      onStateChange: (state) => failureThenRetry.push(state.status),
    });
  };

  await runLoad(async () =>
    new Response(JSON.stringify({ message: 'Temporary upstream outage' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  );

  await runLoad(async () =>
    new Response(
      JSON.stringify({
        message: 'Sync history loaded.',
        summary: { totalFiles: 1, invalidFiles: 0 },
        files: [
          {
            path: 'data/2026/03/20260303-matmetrics.md',
            status: 'valid',
            errors: [],
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  );

  assert.deepEqual(failureThenRetry, ['loading', 'error', 'loading', 'success']);
});
