import assert from 'node:assert/strict';
import test from 'node:test';

import type { TagOperationSummary } from '@/lib/tags';
import {
  buildDeleteConfirmationCopy,
  buildErrorRecoveryDescription,
  deriveDeleteDialogActions,
  deriveTagManagerEmptyState,
  resolveDeleteDialogCancel,
  runDeleteConfirmation,
  TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL,
  TAG_MANAGER_EMPTY_SEARCH_CTA_LABEL,
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

test('loading state is reflected as disabled actions and loading labels during async destructive flow', () => {
  const analyzingState: DeleteDialogState = {
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

  const applyingState: DeleteDialogState = {
    deletingTag: 'uchi-mata',
    deleteAnalysis: createDeleteSummary(),
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
  const openState: DeleteDialogState = {
    deletingTag: 'seoi-nage',
    deleteAnalysis: createDeleteSummary({
      affectedSessionCount: 4,
      changedTagCount: 5,
      affectedSessionIds: ['session-1', 'session-2', 'session-3', 'session-4'],
      affectedTags: ['seoi-nage'],
    }),
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
      return createDeleteSummary({
        affectedSessionCount: 4,
        changedTagCount: 5,
        affectedSessionIds: ['session-1', 'session-2', 'session-3', 'session-4'],
        affectedTags: ['seoi-nage'],
      });
    },
  });

  assert.equal(destructiveInvocations, 1);
  assert.deepEqual(deleteResult, openState.deleteAnalysis);

  const skippedResult = await runDeleteConfirmation({
    deletingTag: openState.deletingTag,
    deleteAnalysis: createDeleteSummary({
      affectedSessionCount: 0,
      changedTagCount: 0,
      affectedSessionIds: [],
      affectedTags: ['seoi-nage'],
      conflicts: [{ code: 'tag_not_found', message: 'Cannot delete' }],
    }),
    deleteTag: async () => {
      destructiveInvocations += 1;
      return createDeleteSummary({
        affectedSessionCount: 0,
        changedTagCount: 0,
        affectedSessionIds: [],
      });
    },
  });

  assert.equal(skippedResult, null);
  assert.equal(destructiveInvocations, 1);
});

test('error criterion anchor: recovery hint is user-visible with refresh and retry affordance wording', () => {
  const description = buildErrorRecoveryDescription(
    'Could not analyze this rename. Check the tag name and try again.'
  );

  assert.match(description, /try again/i);
  assert.match(description, /refresh/i);
  assert.match(description, /retry/i);
});

test('empty criterion anchor: empty state exposes clear call-to-action labels for search and history states', () => {
  const searchEmptyState = deriveTagManagerEmptyState('uchi');
  const historyEmptyState = deriveTagManagerEmptyState('');

  assert.match(searchEmptyState.message, /no tags match your search/i);
  assert.equal(searchEmptyState.ctaLabel, TAG_MANAGER_EMPTY_SEARCH_CTA_LABEL);
  assert.equal(searchEmptyState.action, 'clearSearch');

  assert.match(historyEmptyState.message, /no technique tags found in your history/i);
  assert.equal(historyEmptyState.ctaLabel, TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL);
  assert.equal(historyEmptyState.action, 'refreshTags');
});
