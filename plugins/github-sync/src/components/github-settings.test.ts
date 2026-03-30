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

test('deriveGitHubSettingsControlState returns deterministic button states/labels for edge combinations', () => {
  const cases = [
    {
      name: 'auth blocked disables all GitHub actions even when identity exists',
      input: {
        canUseGitHubSync: false,
        owner: 'cyan-automation',
        repo: 'judo-notes',
        isEnabled: true,
        isTesting: false,
        isSyncing: false,
        isSyncHistoryLoading: false,
        isDisabling: false,
        isClearing: false,
        isClearDialogOpen: false,
      },
      expected: {
        canTestConnection: false,
        canRunSyncAll: false,
        canRefreshHistory: false,
        canDisableSync: false,
        canOpenClearDialog: false,
        canConfirmClear: true,
        hasRepoIdentity: true,
        showConnectedState: true,
        testConnectionLabel: 'Test Connection',
        syncAllLabel: 'Sync All Sessions to GitHub',
        disableLabel: 'Disable Sync',
        clearLabel: 'Clear',
      },
    },
    {
      name: 'testing in-flight keeps sync available but disables test button and shows loading label',
      input: {
        canUseGitHubSync: true,
        owner: 'cyan-automation',
        repo: 'judo-notes',
        isEnabled: true,
        isTesting: true,
        isSyncing: false,
        isSyncHistoryLoading: false,
        isDisabling: false,
        isClearing: false,
        isClearDialogOpen: false,
      },
      expected: {
        canTestConnection: false,
        canRunSyncAll: true,
        canRefreshHistory: true,
        canDisableSync: true,
        canOpenClearDialog: true,
        canConfirmClear: true,
        hasRepoIdentity: true,
        showConnectedState: true,
        testConnectionLabel: 'Testing...',
        syncAllLabel: 'Sync All Sessions to GitHub',
        disableLabel: 'Disable Sync',
        clearLabel: 'Clear',
      },
    },
    {
      name: 'syncing in-flight disables sync action and shows syncing label',
      input: {
        canUseGitHubSync: true,
        owner: 'cyan-automation',
        repo: 'judo-notes',
        isEnabled: true,
        isTesting: false,
        isSyncing: true,
        isSyncHistoryLoading: false,
        isDisabling: false,
        isClearing: false,
        isClearDialogOpen: false,
      },
      expected: {
        canTestConnection: true,
        canRunSyncAll: false,
        canRefreshHistory: true,
        canDisableSync: true,
        canOpenClearDialog: true,
        canConfirmClear: true,
        hasRepoIdentity: true,
        showConnectedState: true,
        testConnectionLabel: 'Test Connection',
        syncAllLabel: 'Syncing...',
        disableLabel: 'Disable Sync',
        clearLabel: 'Clear',
      },
    },
    {
      name: 'disabling in-flight disables destructive buttons and updates disable label',
      input: {
        canUseGitHubSync: true,
        owner: 'cyan-automation',
        repo: 'judo-notes',
        isEnabled: true,
        isTesting: false,
        isSyncing: false,
        isSyncHistoryLoading: false,
        isDisabling: true,
        isClearing: false,
        isClearDialogOpen: true,
      },
      expected: {
        canTestConnection: true,
        canRunSyncAll: true,
        canRefreshHistory: true,
        canDisableSync: false,
        canOpenClearDialog: false,
        canConfirmClear: true,
        hasRepoIdentity: true,
        showConnectedState: true,
        testConnectionLabel: 'Test Connection',
        syncAllLabel: 'Sync All Sessions to GitHub',
        disableLabel: 'Disabling...',
        clearLabel: 'Clear',
      },
    },
    {
      name: 'clearing in-flight disables destructive controls and updates clear labels',
      input: {
        canUseGitHubSync: true,
        owner: 'cyan-automation',
        repo: 'judo-notes',
        isEnabled: true,
        isTesting: false,
        isSyncing: false,
        isSyncHistoryLoading: false,
        isDisabling: false,
        isClearing: true,
        isClearDialogOpen: true,
      },
      expected: {
        canTestConnection: true,
        canRunSyncAll: true,
        canRefreshHistory: true,
        canDisableSync: false,
        canOpenClearDialog: false,
        canConfirmClear: false,
        hasRepoIdentity: true,
        showConnectedState: true,
        testConnectionLabel: 'Test Connection',
        syncAllLabel: 'Sync All Sessions to GitHub',
        disableLabel: 'Disable Sync',
        clearLabel: 'Clearing...',
      },
    },
  ] as const;

  for (const testCase of cases) {
    const result = deriveGitHubSettingsControlState(testCase.input);

    assert.equal(
      result.canTestConnection,
      testCase.expected.canTestConnection,
      `${testCase.name}: canTestConnection`
    );
    assert.equal(
      result.canRunSyncAll,
      testCase.expected.canRunSyncAll,
      `${testCase.name}: canRunSyncAll`
    );
    assert.equal(
      result.canRefreshHistory,
      testCase.expected.canRefreshHistory,
      `${testCase.name}: canRefreshHistory`
    );
    assert.equal(
      result.canDisableSync,
      testCase.expected.canDisableSync,
      `${testCase.name}: canDisableSync`
    );
    assert.equal(
      result.canOpenClearDialog,
      testCase.expected.canOpenClearDialog,
      `${testCase.name}: canOpenClearDialog`
    );
    assert.equal(
      result.canConfirmClear,
      testCase.expected.canConfirmClear,
      `${testCase.name}: canConfirmClear`
    );
    assert.equal(
      result.hasRepoIdentity,
      testCase.expected.hasRepoIdentity,
      `${testCase.name}: hasRepoIdentity`
    );
    assert.equal(
      result.showConnectedState,
      testCase.expected.showConnectedState,
      `${testCase.name}: showConnectedState`
    );
    assert.equal(
      result.testConnectionLabel,
      testCase.expected.testConnectionLabel,
      `${testCase.name}: testConnectionLabel`
    );
    assert.equal(
      result.syncAllLabel,
      testCase.expected.syncAllLabel,
      `${testCase.name}: syncAllLabel`
    );
    assert.equal(
      result.disableLabel,
      testCase.expected.disableLabel,
      `${testCase.name}: disableLabel`
    );
    assert.equal(
      result.clearLabel,
      testCase.expected.clearLabel,
      `${testCase.name}: clearLabel`
    );
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
