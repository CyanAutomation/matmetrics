import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  GITHUB_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL,
  resolveClearDialogOutcome,
} from './github-settings-view-model';

test(
  '[req:docs/plugin-ui-contract.md#destructive-flow-requirements] destructive criterion anchor: confirming clears configuration while cancel preserves it',
  () => {
    const baseState = {
      owner: 'cyan-automation',
      repo: 'judo-notes',
      branch: 'main',
      isEnabled: true,
      migrationDone: true,
      isClearDialogOpen: true,
      testResult: { success: true, message: 'Connected' },
    };

    const cancelOutcome = resolveClearDialogOutcome(baseState, 'cancel');
    const confirmOutcome = resolveClearDialogOutcome(baseState, 'confirm');

    assert.equal(cancelOutcome.owner, baseState.owner);
    assert.equal(cancelOutcome.repo, baseState.repo);
    assert.equal(cancelOutcome.branch, baseState.branch);
    assert.equal(cancelOutcome.testResult, baseState.testResult);
    assert.equal(cancelOutcome.isClearDialogOpen, false);

    assert.equal(confirmOutcome.owner, '');
    assert.equal(confirmOutcome.repo, '');
    assert.equal(confirmOutcome.branch, '');
    assert.equal(confirmOutcome.testResult, null);
    assert.equal(confirmOutcome.isClearDialogOpen, false);
  }
);

test(
  '[req:docs/plugin-ui-contract.md#destructive-flow-requirements] clear dialog labels identify the confirm and cancel actions',
  () => {
    assert.equal(
      GITHUB_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL,
      'Clear Configuration'
    );
    assert.equal(GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL, 'Cancel');
  }
);
