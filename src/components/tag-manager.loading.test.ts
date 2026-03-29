import assert from 'node:assert/strict';
import test from 'node:test';

import type { TagOperationSummary } from '@/lib/tags';
import {
  deriveDeleteDialogActions,
  runDeleteConfirmation
} from './tag-manager';

type DeleteDialogState = Parameters<typeof deriveDeleteDialogActions>[0];
type DeleteFlowState = DeleteDialogState & {
  deleteError: string | null;
};

function createDeleteSummary(
  overrides: Partial<TagOperationSummary> = {}
): TagOperationSummary {
  return {
    dryRun: false,
    affectedSessionCount: 3,
    changedTagCount: 4,
    affectedSessionIds: ['session-1', 'session-2', 'session-3'],
    failedSessionIds: [],
    affectedTags: ['uchi-mata'],
    conflicts: [],
    ...overrides,
  };
}

function createDeleteFlowHarness() {
  const state: DeleteFlowState = {
    deletingTag: 'uchi-mata',
    deleteAnalysis: null,
    isAnalyzingDelete: false,
    isApplyingDelete: false,
    deleteError: null,
  };

  return {
    state,
    analyzeStart() {
      state.isAnalyzingDelete = true;
      state.deleteError = null;
    },
    analyzeSuccess() {
      state.deleteAnalysis = createDeleteSummary();
      state.isAnalyzingDelete = false;
    },
    analyzeFail(error: unknown) {
      state.deleteError =
        'Could not analyze this deletion. Review the tag and try again.';
      state.isAnalyzingDelete = false;
      return error;
    },
    async apply(deleteTag: (tag: string) => Promise<TagOperationSummary>) {
      state.isApplyingDelete = true;
      state.deleteError = null;

      try {
        await runDeleteConfirmation({
          deletingTag: state.deletingTag,
          deleteAnalysis: state.deleteAnalysis,
          deleteTag: async (tag) => {
            const result = await deleteTag(tag);
            return result;
          },
        });
      } catch (error) {
        state.deleteError =
          'Could not apply this deletion. Your tags are unchanged. Please try again.';
        return error;
      } finally {
        state.isApplyingDelete = false;
      }

      return null;
    },
  };
}

test('delete flow exposes loading labels and disabled actions while async work is in progress', () => {
  const harness = createDeleteFlowHarness();

  const idleActions = deriveDeleteDialogActions(harness.state);
  assert.equal(idleActions.primaryLabel, 'Analyze');
  assert.equal(idleActions.primaryDisabled, false);
  assert.equal(idleActions.cancelDisabled, false);

  harness.analyzeStart();
  const analyzingActions = deriveDeleteDialogActions(harness.state);
  assert.equal(analyzingActions.primaryLabel, 'Analyzing...');
  assert.equal(analyzingActions.primaryDisabled, true);
  assert.equal(analyzingActions.cancelDisabled, true);

  harness.analyzeSuccess();
  const readyToApplyActions = deriveDeleteDialogActions(harness.state);
  assert.equal(readyToApplyActions.primaryLabel, 'Apply');
  assert.equal(readyToApplyActions.primaryDisabled, false);
  assert.equal(readyToApplyActions.cancelDisabled, false);

  harness.state.isApplyingDelete = true;
  const applyingActions = deriveDeleteDialogActions(harness.state);
  assert.equal(applyingActions.primaryLabel, 'Applying...');
  assert.equal(applyingActions.primaryDisabled, true);
  assert.equal(applyingActions.cancelDisabled, true);
});

test('delete flow surfaces recoverable errors and supports retry after apply failure', async () => {
  const harness = createDeleteFlowHarness();

  // idle -> analyzing -> idle
  harness.analyzeStart();
  assert.equal(harness.state.isAnalyzingDelete, true);
  harness.analyzeSuccess();
  assert.equal(harness.state.isAnalyzingDelete, false);

  // ready to apply -> applying -> idle with recoverable failure
  const failure = await harness.apply(async () => {
    throw new Error('network issue');
  });

  assert.ok(failure instanceof Error);
  assert.equal(harness.state.isApplyingDelete, false);
  assert.ok(harness.state.deleteError);
  assert.match(harness.state.deleteError, /could not apply/i);
  assert.match(harness.state.deleteError, /unchanged/i);
  assert.match(harness.state.deleteError, /try again/i);

  // recovery action remains present and actionable
  const retryActions = deriveDeleteDialogActions(harness.state);
  assert.equal(retryActions.primaryLabel, 'Apply');
  assert.equal(retryActions.primaryDisabled, false);
  assert.equal(retryActions.cancelDisabled, false);

  // retry path transitions applying state correctly and clears prior error on retry start
  const retryResult = await harness.apply(async () => createDeleteSummary());

  assert.equal(retryResult, null);
  assert.equal(harness.state.isApplyingDelete, false);
  assert.equal(harness.state.deleteError, null);
});
