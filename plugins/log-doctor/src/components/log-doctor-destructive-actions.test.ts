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
  assert.equal(canConfirmApplyFixes(''), false);
  assert.equal(canConfirmApplyFixes('apply now'), false);
  assert.equal(canConfirmApplyFixes('APPLY'), true);
  assert.equal(canConfirmApplyFixes('  apply  '), true);
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

  const resolved = resolveResetDiagnosticsSnapshot(current, false);

  assert.equal(resolved.previous, null);
  assert.equal(resolved.next, current);
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

  const resolved = resolveResetDiagnosticsSnapshot(current, true);
  const empty = createEmptyDiagnosticsSnapshot();

  assert.deepEqual(resolved.next, empty);
  assert.notEqual(resolved.previous, null);
  assert.deepEqual(resolved.previous?.selectedPaths, current.selectedPaths);
  assert.notEqual(resolved.previous?.selectedPaths, current.selectedPaths);
});
