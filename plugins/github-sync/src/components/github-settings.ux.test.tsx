import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveGitHubSettingsControlState,
  GITHUB_SYNC_HISTORY_REFRESH_LOADING_LABEL,
} from './github-settings-view-model';
import {
  GITHUB_SYNC_RESULTS_EMPTY_CTA_LABEL,
  GITHUB_SYNC_RESULTS_ERROR_RETRY_LABEL,
  GITHUB_SYNC_RESULTS_LOADING_TEXT,
  runLoadGitHubSyncHistory,
} from './github-sync-results';

test('loading criterion anchor: loading state present with loading text and disabled interaction while loading', async () => {
  const states: string[] = [];

  await runLoadGitHubSyncHistory({
    owner: 'cyan-automation',
    repo: 'matmetrics-sync',
    getHeaders: async (headers) => headers ?? {},
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          message: 'Sync history loaded.',
          summary: {
            totalFiles: 1,
            invalidFiles: 0,
          },
          files: [
            {
              path: 'data/2026/03/example.md',
              status: 'valid',
              errors: [],
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    onStateChange: (state) => {
      states.push(state.status);
    },
  });

  const controlState = deriveGitHubSettingsControlState({
    canUseGitHubSync: true,
    owner: 'cyan-automation',
    repo: 'matmetrics-sync',
    isEnabled: true,
    isTesting: false,
    isSyncing: false,
    isSyncHistoryLoading: true,
    isDisabling: false,
    isClearing: false,
    isClearDialogOpen: false,
  });

  assert.deepEqual(states.slice(0, 2), ['loading', 'success']);
  assert.equal(
    GITHUB_SYNC_RESULTS_LOADING_TEXT.toLowerCase().includes('loading'),
    true
  );
  assert.equal(controlState.canRefreshHistory, false);
  assert.equal(
    controlState.refreshHistoryLabel,
    GITHUB_SYNC_HISTORY_REFRESH_LOADING_LABEL
  );
});

test('error criterion anchor: error state exposes retry recovery action label and callable recover flow', async () => {
  const failedStates: Array<{ status: string; message?: string }> = [];
  const recoveredStates: string[] = [];

  await runLoadGitHubSyncHistory({
    owner: 'cyan-automation',
    repo: 'matmetrics-sync',
    getHeaders: async (headers) => headers ?? {},
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          message: 'Sync history unavailable while loading diagnostics.',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    onStateChange: (state) => {
      failedStates.push({
        status: state.status,
        message: 'message' in state ? state.message : undefined,
      });
    },
  });

  await runLoadGitHubSyncHistory({
    owner: 'cyan-automation',
    repo: 'matmetrics-sync',
    getHeaders: async (headers) => headers ?? {},
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          message: 'Sync history loaded.',
          summary: {
            totalFiles: 1,
            invalidFiles: 0,
          },
          files: [
            {
              path: 'data/2026/03/example.md',
              status: 'valid',
              errors: [],
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    onStateChange: (state) => {
      recoveredStates.push(state.status);
    },
  });

  assert.equal(failedStates[1]?.status, 'error');
  assert.match(
    failedStates[1]?.message ?? '',
    /unavailable while loading diagnostics/i
  );
  assert.equal(
    GITHUB_SYNC_RESULTS_ERROR_RETRY_LABEL.toLowerCase().includes('retry'),
    true
  );
  assert.deepEqual(recoveredStates.slice(0, 2), ['loading', 'success']);
});

test('empty criterion anchor: empty state present with cta action wording run sync configure', async () => {
  const states: Array<{ status: string; message?: string }> = [];

  await runLoadGitHubSyncHistory({
    owner: 'cyan-automation',
    repo: 'matmetrics-sync',
    getHeaders: async (headers) => headers ?? {},
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          message: 'No history yet.',
          summary: {
            totalFiles: 0,
            invalidFiles: 0,
          },
          files: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    onStateChange: (state) => {
      states.push({
        status: state.status,
        message: 'message' in state ? state.message : undefined,
      });
    },
  });

  assert.equal(states[1]?.status, 'empty');
  assert.match(states[1]?.message ?? '', /run sync/i);
  assert.equal(
    GITHUB_SYNC_RESULTS_EMPTY_CTA_LABEL.toLowerCase().includes('sync'),
    true
  );
});
