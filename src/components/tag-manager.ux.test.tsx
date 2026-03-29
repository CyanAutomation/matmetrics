import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeleteConfirmationCopy,
  deriveDeleteDialogActions,
  resolveDeleteDialogCancel,
  runDeleteConfirmation,
} from './tag-manager';

test('loading state is reflected as disabled actions and loading labels during async destructive flow', () => {
  const analyzingState = {
    deletingTag: 'uchi-mata',
    deleteAnalysis: null,
    isAnalyzingDelete: true,
    isApplyingDelete: false,
  };

  const analyzingActions = deriveDeleteDialogActions(analyzingState);

  assert.equal(analyzingActions.mode, 'analyze');
  assert.equal(analyzingActions.primaryLabel, 'Analyzing...');
  assert.equal(analyzingActions.cancelDisabled, true);
  assert.equal(analyzingActions.primaryDisabled, true);

  const applyingState = {
    deletingTag: 'uchi-mata',
    deleteAnalysis: {
      affectedSessionCount: 2,
      changedTagCount: 3,
      conflicts: [],
    },
    isAnalyzingDelete: false,
    isApplyingDelete: true,
  };

  const applyingActions = deriveDeleteDialogActions(applyingState);

  assert.equal(applyingActions.mode, 'apply');
  assert.equal(applyingActions.primaryLabel, 'Applying...');
  assert.equal(applyingActions.cancelDisabled, true);
  assert.equal(applyingActions.primaryDisabled, true);
});

test('destructive safety flow supports open copy, cancel no-op mutation, and confirm invokes destructive handler path', async () => {
  const openState = {
    deletingTag: 'seoi-nage',
    deleteAnalysis: {
      affectedSessionCount: 4,
      changedTagCount: 5,
      conflicts: [],
    },
    isAnalyzingDelete: false,
    isApplyingDelete: false,
  };

  const confirmationCopy = buildDeleteConfirmationCopy(
    openState.deletingTag,
    openState.deleteAnalysis
  );

  assert.match(confirmationCopy, /Are you sure you want to remove/i);
  assert.match(confirmationCopy, /cannot be undone/i);
  assert.match(confirmationCopy, /Impact: 4 session\(s\), 5 tag change\(s\)/i);

  const cancelResult = resolveDeleteDialogCancel(openState);
  assert.equal(cancelResult.deletingTag, null);
  assert.equal(cancelResult.deleteAnalysis, null);

  const blockedCancelResult = resolveDeleteDialogCancel({
    ...openState,
    isApplyingDelete: true,
  });
  assert.deepEqual(blockedCancelResult, {
    ...openState,
    isApplyingDelete: true,
  });

  let destructiveInvocations = 0;
  const deleteResult = await runDeleteConfirmation({
    deletingTag: openState.deletingTag,
    deleteAnalysis: openState.deleteAnalysis,
    deleteTag: async (tag) => {
      destructiveInvocations += 1;
      assert.equal(tag, 'seoi-nage');
      return {
        affectedSessionCount: 4,
        changedTagCount: 5,
        conflicts: [],
      };
    },
  });

  assert.equal(destructiveInvocations, 1);
  assert.deepEqual(deleteResult, openState.deleteAnalysis);

  const skippedResult = await runDeleteConfirmation({
    deletingTag: openState.deletingTag,
    deleteAnalysis: {
      affectedSessionCount: 0,
      changedTagCount: 0,
      conflicts: [{ message: 'Cannot delete' }],
    },
    deleteTag: async () => {
      destructiveInvocations += 1;
      return {
        affectedSessionCount: 0,
        changedTagCount: 0,
        conflicts: [],
      };
    },
  });

  assert.equal(skippedResult, null);
  assert.equal(destructiveInvocations, 1);
});
