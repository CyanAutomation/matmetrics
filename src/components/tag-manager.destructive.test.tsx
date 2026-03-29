import assert from 'node:assert/strict';
import test from 'node:test';

import type { TagOperationSummary } from '@/lib/tags';
import {
  buildDeleteConfirmationCopy,
  deriveDeleteDialogActions,
  resolveDeleteDialogCancel,
  runDeleteConfirmation,
} from './tag-manager';

type DeleteDialogState = Parameters<typeof deriveDeleteDialogActions>[0];

function createDeleteSummary(
  overrides: Partial<TagOperationSummary> = {}
): TagOperationSummary {
  return {
    dryRun: false,
    affectedSessionCount: 2,
    changedTagCount: 3,
    affectedSessionIds: ['session-1', 'session-2'],
    failedSessionIds: [],
    affectedTags: ['uchi-mata'],
    conflicts: [],
    ...overrides,
  };
}

test('delete flow requires explicit confirmation before destructive apply', async () => {
  const initialState: DeleteDialogState = {
    deletingTag: null,
    deleteAnalysis: null,
    isAnalyzingDelete: false,
    isApplyingDelete: false,
  };

  // 1) user initiates delete
  const initiatedState = {
    ...initialState,
    deletingTag: 'uchi-mata',
  };

  // 2) confirmation modal copy appears for initiated deletion
  const confirmationCopy = buildDeleteConfirmationCopy(
    initiatedState.deletingTag,
    initiatedState.deleteAnalysis
  );
  assert.match(confirmationCopy, /Are you sure you want to remove/i);
  assert.match(confirmationCopy, /This cannot be undone/i);

  // 3) apply is blocked until confirmation/analyze produces safe result
  const actionsBeforeAnalysis = deriveDeleteDialogActions(initiatedState);
  assert.equal(actionsBeforeAnalysis.mode, 'analyze');
  assert.equal(actionsBeforeAnalysis.primaryLabel, 'Analyze');

  let deleteInvocations = 0;
  const preConfirmResult = await runDeleteConfirmation({
    deletingTag: initiatedState.deletingTag,
    deleteAnalysis: initiatedState.deleteAnalysis,
    deleteTag: async () => {
      deleteInvocations += 1;
      return createDeleteSummary({
        affectedSessionCount: 1,
        changedTagCount: 1,
        affectedSessionIds: ['session-1'],
      });
    },
  });

  assert.equal(preConfirmResult, null);
  assert.equal(deleteInvocations, 0);

  // 4) destructive action executes only after confirm (analysis exists, no conflicts)
  const confirmedState: DeleteDialogState = {
    ...initiatedState,
    deleteAnalysis: createDeleteSummary(),
  };

  const actionsAfterAnalysis = deriveDeleteDialogActions(confirmedState);
  assert.equal(actionsAfterAnalysis.mode, 'apply');
  assert.equal(actionsAfterAnalysis.primaryLabel, 'Apply');

  const confirmedResult = await runDeleteConfirmation({
    deletingTag: confirmedState.deletingTag,
    deleteAnalysis: confirmedState.deleteAnalysis,
    deleteTag: async (tag) => {
      deleteInvocations += 1;
      assert.equal(tag, 'uchi-mata');
      return createDeleteSummary();
    },
  });

  assert.equal(deleteInvocations, 1);
  assert.deepEqual(confirmedResult, confirmedState.deleteAnalysis);
});

test('canceling delete confirmation clears pending destructive state when idle', () => {
  const cancelResult = resolveDeleteDialogCancel({
    deletingTag: 'seoi-nage',
    deleteAnalysis: createDeleteSummary({
      changedTagCount: 2,
      affectedTags: ['seoi-nage'],
    }),
    isAnalyzingDelete: false,
    isApplyingDelete: false,
  });

  assert.equal(cancelResult.deletingTag, null);
  assert.equal(cancelResult.deleteAnalysis, null);
});
