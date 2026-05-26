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

const baseControlStateInput = {
  canUseGitHubSync: true,
  owner: 'cyan-automation',
  repo: 'judo-notes',
  isEnabled: true,
  isTesting: false,
  isSyncing: false,
  isSyncHistoryLoading: false,
  isDisabling: false,
  isClearing: false,
  isClearDialogOpen: false,
};

test('[REQ-GHS-001][#431] auth gating disables GitHub actions when feature access is blocked', () => {
  const cases = [
    {
      name: 'identity present still blocks all GitHub actions',
      input: { canUseGitHubSync: false },
      expected: {
        canTestConnection: false,
        canRunSyncAll: false,
        canRefreshHistory: false,
        canDisableSync: false,
        canOpenClearDialog: false,
        hasRepoIdentity: true,
        showConnectedState: true,
      },
    },
  ] as const;

  for (const testCase of cases) {
    const result = deriveGitHubSettingsControlState({
      ...baseControlStateInput,
      ...testCase.input,
    });

    assert.equal(result.canTestConnection, testCase.expected.canTestConnection, testCase.name);
    assert.equal(result.canRunSyncAll, testCase.expected.canRunSyncAll, testCase.name);
    assert.equal(result.canRefreshHistory, testCase.expected.canRefreshHistory, testCase.name);
    assert.equal(result.canDisableSync, testCase.expected.canDisableSync, testCase.name);
    assert.equal(result.canOpenClearDialog, testCase.expected.canOpenClearDialog, testCase.name);
    assert.equal(result.hasRepoIdentity, testCase.expected.hasRepoIdentity, testCase.name);
    assert.equal(result.showConnectedState, testCase.expected.showConnectedState, testCase.name);

    assert.equal(result.testConnectionLabel, 'Test Connection', `${testCase.name}: testConnectionLabel`);
    assert.equal(result.syncAllLabel, 'Sync All Sessions to GitHub', `${testCase.name}: syncAllLabel`);
  }
});

test('[REQ-GHS-002][#431] in-flight labels are scoped to their matching action', () => {
  const cases = [
    {
      name: 'testing in-flight disables only test action',
      input: { isTesting: true },
      expected: {
        canTestConnection: false,
        canRunSyncAll: true,
        canRefreshHistory: true,
        canDisableSync: true,
        canOpenClearDialog: true,
      },
      labels: {
        testConnectionLabel: 'Testing...',
        syncAllLabel: 'Sync All Sessions to GitHub',
      },
    },
    {
      name: 'syncing in-flight disables only sync action',
      input: { isSyncing: true },
      expected: {
        canTestConnection: true,
        canRunSyncAll: false,
        canRefreshHistory: true,
        canDisableSync: true,
        canOpenClearDialog: true,
      },
      labels: {
        testConnectionLabel: 'Test Connection',
        syncAllLabel: 'Syncing...',
      },
    },
  ] as const;

  for (const testCase of cases) {
    const result = deriveGitHubSettingsControlState({
      ...baseControlStateInput,
      ...testCase.input,
    });

    assert.equal(result.canTestConnection, testCase.expected.canTestConnection, testCase.name);
    assert.equal(result.canRunSyncAll, testCase.expected.canRunSyncAll, testCase.name);
    assert.equal(result.canRefreshHistory, testCase.expected.canRefreshHistory, testCase.name);
    assert.equal(result.canDisableSync, testCase.expected.canDisableSync, testCase.name);
    assert.equal(result.canOpenClearDialog, testCase.expected.canOpenClearDialog, testCase.name);

    assert.equal(
      result.testConnectionLabel,
      testCase.labels.testConnectionLabel,
      `${testCase.name}: testConnectionLabel`
    );
    assert.equal(result.syncAllLabel, testCase.labels.syncAllLabel, `${testCase.name}: syncAllLabel`);
  }
});

test('[REQ-GHS-003][#431] destructive-action gating locks clear/disable controls independently', () => {
  const cases = [
    {
      name: 'disabling in-flight gates destructive controls',
      input: { isDisabling: true, isClearDialogOpen: true },
      expected: {
        canTestConnection: true,
        canRunSyncAll: true,
        canRefreshHistory: true,
        canDisableSync: false,
        canOpenClearDialog: false,
        canConfirmClear: true,
      },
      labels: {
        disableLabel: 'Disabling...',
        clearLabel: 'Clear',
      },
    },
    {
      name: 'clearing in-flight blocks confirm clear and disable button',
      input: { isClearing: true, isClearDialogOpen: true },
      expected: {
        canTestConnection: true,
        canRunSyncAll: true,
        canRefreshHistory: true,
        canDisableSync: false,
        canOpenClearDialog: false,
        canConfirmClear: false,
      },
      labels: {
        disableLabel: 'Disable Sync',
        clearLabel: 'Clearing...',
      },
    },
  ] as const;

  for (const testCase of cases) {
    const result = deriveGitHubSettingsControlState({
      ...baseControlStateInput,
      ...testCase.input,
    });

    assert.equal(result.canTestConnection, testCase.expected.canTestConnection, testCase.name);
    assert.equal(result.canRunSyncAll, testCase.expected.canRunSyncAll, testCase.name);
    assert.equal(result.canRefreshHistory, testCase.expected.canRefreshHistory, testCase.name);
    assert.equal(result.canDisableSync, testCase.expected.canDisableSync, testCase.name);
    assert.equal(result.canOpenClearDialog, testCase.expected.canOpenClearDialog, testCase.name);
    assert.equal(result.canConfirmClear, testCase.expected.canConfirmClear, testCase.name);

    assert.equal(result.disableLabel, testCase.labels.disableLabel, `${testCase.name}: disableLabel`);
    assert.equal(result.clearLabel, testCase.labels.clearLabel, `${testCase.name}: clearLabel`);
  }
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

test('deriveDisableOutcome returns deterministic results for edge destructive states', () => {
  const cases = [
    {
      name: 'disable preserves config while toggling isEnabled off',
      input: {
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
      },
      expected: {
        owner: 'cyan-automation',
        repo: 'judo-notes',
        branch: 'main',
        isEnabled: false,
        migrationDone: true,
        isClearDialogOpen: true,
        testResult: {
          success: false,
          message: 'Failed',
        },
      },
    },
    {
      name: 'disable is idempotent when already disabled',
      input: {
        owner: 'cyan-automation',
        repo: 'judo-notes',
        branch: 'dev',
        isEnabled: false,
        migrationDone: false,
        isClearDialogOpen: false,
        testResult: null,
      },
      expected: {
        owner: 'cyan-automation',
        repo: 'judo-notes',
        branch: 'dev',
        isEnabled: false,
        migrationDone: false,
        isClearDialogOpen: false,
        testResult: null,
      },
    },
  ] as const;

  for (const testCase of cases) {
    const result = deriveDisableOutcome(testCase.input);
    assert.deepEqual(result, testCase.expected, testCase.name);
  }
});

test('deriveClearOutcome returns deterministic results for edge destructive states', () => {
  const cases = [
    {
      name: 'clear removes all connection identity and test state',
      input: {
        owner: 'cyan-automation',
        repo: 'judo-notes',
        branch: 'main',
        isEnabled: true,
        migrationDone: true,
        isClearDialogOpen: true,
        testResult: {
          success: true,
          message: 'Connected',
        },
      },
      expected: {
        owner: '',
        repo: '',
        branch: '',
        isEnabled: false,
        migrationDone: false,
        isClearDialogOpen: false,
        testResult: null,
      },
    },
    {
      name: 'clear is stable from partially-cleared state',
      input: {
        owner: '',
        repo: 'judo-notes',
        branch: '',
        isEnabled: false,
        migrationDone: true,
        isClearDialogOpen: true,
        testResult: null,
      },
      expected: {
        owner: '',
        repo: '',
        branch: '',
        isEnabled: false,
        migrationDone: false,
        isClearDialogOpen: false,
        testResult: null,
      },
    },
  ] as const;

  for (const testCase of cases) {
    const result = deriveClearOutcome(testCase.input);
    assert.deepEqual(result, testCase.expected, testCase.name);
  }
});
