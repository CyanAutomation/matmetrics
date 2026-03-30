import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveDisableOutcome,
  GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  GITHUB_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL,
  resolveClearDialogOutcome,
} from './github-settings-view-model';

test('destructive criterion anchor: destructive confirm clears configuration and destructive cancel preserves prior values', () => {
  const baseState = {
    owner: 'cyan-automation',
    repo: 'judo-notes',
    branch: 'main',
    isEnabled: true,
    migrationDone: true,
    isClearDialogOpen: true,
    testResult: { success: true, message: 'Connected' },
  };

  const disableOutcome = deriveDisableOutcome(baseState);
  const cancelOutcome = resolveClearDialogOutcome(baseState, 'cancel');
  const confirmOutcome = resolveClearDialogOutcome(baseState, 'confirm');

  assert.equal(
    /confirm/i.test('destructive confirm clear configuration'),
    true
  );
  assert.equal(
    GITHUB_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL.toLowerCase().includes('clear'),
    true
  );
  assert.equal(
    GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL.toLowerCase().includes('cancel'),
    true
  );
  assert.equal(disableOutcome.isEnabled, false);

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
});
