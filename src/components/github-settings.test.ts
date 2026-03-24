import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGitHubNetworkErrorMessage,
  deriveClearOutcome,
  deriveDisableOutcome,
  deriveGitHubSettingsControlState,
  getGitHubSettingsValidationError,
} from './github-settings-view-model';

test('returns a validation error when owner or repo are missing', () => {
  assert.equal(
    getGitHubSettingsValidationError('', 'judo-notes'),
    'Please enter both GitHub owner and repository name.'
  );
  assert.equal(
    getGitHubSettingsValidationError('cyan-automation', ''),
    'Please enter both GitHub owner and repository name.'
  );
  assert.equal(
    getGitHubSettingsValidationError('cyan-automation', 'judo-notes'),
    null
  );
});

test('derives loading labels and disables actions while test/sync operations are pending', () => {
  const testingState = deriveGitHubSettingsControlState({
    canUseGitHubSync: true,
    owner: 'cyan-automation',
    repo: 'judo-notes',
    isEnabled: true,
    isTesting: true,
    isSyncing: false,
    isDisabling: false,
    isClearing: false,
    isClearDialogOpen: false,
  });

  assert.equal(testingState.canTestConnection, false);
  assert.equal(testingState.testConnectionLabel, 'Testing...');

  const syncingState = deriveGitHubSettingsControlState({
    canUseGitHubSync: true,
    owner: 'cyan-automation',
    repo: 'judo-notes',
    isEnabled: true,
    isTesting: false,
    isSyncing: true,
    isDisabling: false,
    isClearing: false,
    isClearDialogOpen: false,
  });

  assert.equal(syncingState.canRunSyncAll, false);
  assert.equal(syncingState.syncAllLabel, 'Syncing...');
});

test('builds failure messages for API/network errors', () => {
  assert.equal(
    buildGitHubNetworkErrorMessage(
      'Network error while testing connection',
      new Error('connection reset')
    ),
    'Network error while testing connection: connection reset'
  );

  assert.equal(
    buildGitHubNetworkErrorMessage('Bulk sync request failed', null),
    'Bulk sync request failed: Unknown error'
  );
});

test('applies destructive-action outcomes for disable and clear', () => {
  const baseState = {
    owner: 'cyan-automation',
    repo: 'judo-notes',
    branch: 'main',
    isEnabled: true,
    migrationDone: true,
    isClearDialogOpen: true,
    testResult: {
      success: false,
      message: 'Failed',
    },
  };

  const disabled = deriveDisableOutcome(baseState);
  assert.equal(disabled.isEnabled, false);
  assert.equal(disabled.owner, 'cyan-automation');

  const cleared = deriveClearOutcome(baseState);
  assert.equal(cleared.owner, '');
  assert.equal(cleared.repo, '');
  assert.equal(cleared.branch, '');
  assert.equal(cleared.isEnabled, false);
  assert.equal(cleared.migrationDone, false);
  assert.equal(cleared.isClearDialogOpen, false);
  assert.equal(cleared.testResult, null);
});

test('keeps tests isolated by using mocked auth + network dependencies', async () => {
  const mockUseAuth = () => ({
    user: { uid: 'user-1' },
    canUseGitHubSync: true,
  });
  const mockGetAuthHeaders = async () => ({ Authorization: 'Bearer test' });
  const originalFetch = global.fetch;

  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const auth = mockUseAuth();
    const headers = await mockGetAuthHeaders();
    await fetch('/api/github/validate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ owner: 'cyan-automation', repo: 'judo-notes' }),
    });

    assert.equal(auth.canUseGitHubSync, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.input, '/api/github/validate');
  } finally {
    global.fetch = originalFetch;
  }
});
