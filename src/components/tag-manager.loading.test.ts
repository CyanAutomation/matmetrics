import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveDeleteDialogActions,
  runDeleteConfirmation
} from './tag-manager';

type DeleteFlowState = {
  deletingTag: string | null;
  deleteAnalysis: {
    affectedSessionCount: number;
    changedTagCount: number;
    conflicts: Array<{ message: string }>;
  } | null;
  isAnalyzingDelete: boolean;
  isApplyingDelete: boolean;
  deleteError: string | null;
};

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
      state.deleteAnalysis = {
        affectedSessionCount: 3,
        changedTagCount: 4,
        conflicts: [],
      };
      state.isAnalyzingDelete = false;
    },
    analyzeFail(error: unknown) {
      state.deleteError =
        'Could not analyze this deletion. Review the tag and try again.';
      state.isAnalyzingDelete = false;
      return error;
    },
    async apply(deleteTag: (tag: string) => Promise<DeleteFlowState['deleteAnalysis']>) {
      state.isApplyingDelete = true;
      state.deleteError = null;

      try {
        await runDeleteConfirmation({
          deletingTag: state.deletingTag,
          deleteAnalysis: state.deleteAnalysis,
          deleteTag: async (tag) => {
            const result = await deleteTag(tag);
            return {
              affectedSessionCount: result?.affectedSessionCount ?? 0,
              changedTagCount: result?.changedTagCount ?? 0,
              conflicts: result?.conflicts ?? [],
            };
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

test('delete flow transitions idle → analyzing/applying → idle and recovers after failure', async () => {
  const harness = createDeleteFlowHarness();

  // idle -> analyzing -> idle
  harness.analyzeStart();
  assert.equal(harness.state.isAnalyzingDelete, true);
  harness.analyzeSuccess();
  assert.equal(harness.state.isAnalyzingDelete, false);

  // idle (ready to apply) -> applying -> idle with failure recovery
  const failure = await harness.apply(async () => {
    throw new Error('network issue');
  });

  assert.ok(failure instanceof Error);
  assert.equal(harness.state.isApplyingDelete, false);
  assert.equal(
    harness.state.deleteError,
    'Could not apply this deletion. Your tags are unchanged. Please try again.'
  );

  const postFailureActions = deriveDeleteDialogActions(harness.state);
  assert.equal(postFailureActions.primaryLabel, 'Apply');
  assert.equal(postFailureActions.primaryDisabled, false);
  assert.equal(postFailureActions.cancelDisabled, false);
});
