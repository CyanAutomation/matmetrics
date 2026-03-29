import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canConfirmApplyFixes,
  createEmptyDiagnosticsSnapshot,
  createUiState,
  resolveResetDiagnosticsSnapshot,
  type DiagnosticsSnapshot,
} from './log-doctor-state';

test('apply confirmation requires strong APPLY phrase', () => {
  const confirmRejectedWhenEmpty = canConfirmApplyFixes('');
  const confirmRejectedWhenWeakPhrase = canConfirmApplyFixes('apply now');
  const confirmAcceptedWhenStrongPhrase = canConfirmApplyFixes('APPLY');
  const confirmAcceptedWhenTrimmed = canConfirmApplyFixes('  apply  ');

  assert.equal(confirmRejectedWhenEmpty, false, 'confirm phrase is required');
  assert.equal(
    confirmRejectedWhenWeakPhrase,
    false,
    'confirmation rejects weak apply phrase'
  );
  assert.equal(
    confirmAcceptedWhenStrongPhrase,
    true,
    'confirm accepts destructive apply keyword'
  );
  assert.equal(
    confirmAcceptedWhenTrimmed,
    true,
    'confirmation accepts trimmed apply keyword'
  );
});

test('canceling reset confirmation does not mutate diagnostics state', () => {
  const current: DiagnosticsSnapshot = {
    scanResult: {
      success: true,
      message: 'ok',
      summary: { totalFiles: 1, validFiles: 0, invalidFiles: 1 },
      files: [{ path: 'data/2026/03/test.md', status: 'invalid' }],
    },
    fixResult: null,
    selectedPaths: ['data/2026/03/test.md'],
    uiState: createUiState('scan', 'success'),
    errorMessage: 'previous error',
  };

  const cancelResetResolution = resolveResetDiagnosticsSnapshot(current, false);
  const cancelConfirmed = false;

  assert.equal(cancelConfirmed, false, 'cancel keeps reset confirmation closed');
  assert.equal(
    cancelResetResolution.previous,
    null,
    'cancelled reset does not create undo snapshot'
  );
  assert.equal(
    cancelResetResolution.next,
    current,
    'cancel path preserves destructive reset state'
  );
});

test('confirming reset returns empty state and keeps undo snapshot', () => {
  const current: DiagnosticsSnapshot = {
    scanResult: {
      success: true,
      message: 'ok',
      summary: { totalFiles: 2, validFiles: 1, invalidFiles: 1 },
      files: [
        { path: 'data/2026/03/valid.md', status: 'valid' },
        { path: 'data/2026/03/invalid.md', status: 'invalid' },
      ],
    },
    fixResult: null,
    selectedPaths: ['data/2026/03/invalid.md'],
    uiState: createUiState('preview', 'success'),
    errorMessage: null,
  };

  const confirmResetResolution = resolveResetDiagnosticsSnapshot(current, true);
  const empty = createEmptyDiagnosticsSnapshot();
  const resetConfirmationAccepted = true;
  const destructiveResetKeepsUndoSnapshot =
    confirmResetResolution.previous !== null;

  assert.equal(
    resetConfirmationAccepted,
    true,
    'confirmation accepts destructive reset'
  );
  assert.deepEqual(
    confirmResetResolution.next,
    empty,
    'confirmed reset clears diagnostics snapshot'
  );
  assert.equal(
    destructiveResetKeepsUndoSnapshot,
    true,
    'destructive reset keeps undo for cancel recovery'
  );
  assert.deepEqual(
    confirmResetResolution.previous?.selectedPaths,
    current.selectedPaths
  );
  assert.notEqual(
    confirmResetResolution.previous?.selectedPaths,
    current.selectedPaths
  );
});
