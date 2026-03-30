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

test('canceling delete confirmation preserves data and dismisses dialog', async () => {
  const sessions = [
    { id: 'session-1', techniques: ['seoi-nage', 'uchi-mata'] },
    { id: 'session-2', techniques: ['seoi-nage'] },
  ];
  const tags = ['seoi-nage', 'uchi-mata'];
  const sessionsBeforeCancel = structuredClone(sessions);
  const tagsBeforeCancel = [...tags];

  const deleteFlowState: DeleteDialogState = {
    deletingTag: 'seoi-nage',
    deleteAnalysis: createDeleteSummary({
      affectedSessionCount: 2,
      changedTagCount: 2,
      affectedSessionIds: ['session-1', 'session-2'],
      affectedTags: ['seoi-nage'],
    }),
    isAnalyzingDelete: false,
    isApplyingDelete: false,
  };

  const cancelResult = resolveDeleteDialogCancel(deleteFlowState);
  let deleteInvocations = 0;
  const postCancelAttempt = await runDeleteConfirmation({
    deletingTag: cancelResult.deletingTag,
    deleteAnalysis: cancelResult.deleteAnalysis,
    deleteTag: async (tag) => {
      deleteInvocations += 1;

      for (const session of sessions) {
        session.techniques = session.techniques.filter(
          (technique) => technique !== tag
        );
      }
      const nextTags = tags.filter((existingTag) => existingTag !== tag);
      tags.splice(0, tags.length, ...nextTags);

      return createDeleteSummary();
    },
  });

  assert.deepEqual(sessions, sessionsBeforeCancel);
  assert.deepEqual(tags, tagsBeforeCancel);
  assert.equal(deleteInvocations, 0);
  assert.equal(postCancelAttempt, null);

  assert.equal(cancelResult.deletingTag, null);
  assert.equal(cancelResult.deleteAnalysis, null);
});
