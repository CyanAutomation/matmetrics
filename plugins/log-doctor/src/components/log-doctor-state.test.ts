import assert from 'node:assert/strict';
import test from 'node:test';

import { createUiState } from './log-doctor-state';

test('createUiState returns idle state copy', () => {
  const state = createUiState('scan', 'idle');
  assert.equal(state.phase, 'idle');
  assert.equal(state.operation, null);
  assert.match(state.message, /Select a source/i);
});

test('createUiState returns loading state with long-running messaging', () => {
  const state = createUiState('scan', 'loading');
  assert.equal(state.phase, 'loading');
  assert.equal(state.operation, 'scan');
  assert.match(state.message, /can take up to 30 seconds/i);
});

test('createUiState returns empty state for no logs and no findings', () => {
  const logsEmpty = createUiState('scan', 'empty', { hasLogs: false });
  assert.equal(logsEmpty.phase, 'empty');
  assert.match(logsEmpty.message, /No logs were found/i);

  const findingsEmpty = createUiState('preview', 'empty', {
    hasFindings: false,
  });
  assert.equal(findingsEmpty.phase, 'empty');
  assert.match(findingsEmpty.message, /No findings/i);
});

test('createUiState returns error state with concise reason and recovery step', () => {
  const state = createUiState('preview', 'error', {
    reason: '403 Forbidden',
  });
  assert.equal(state.phase, 'error');
  assert.match(state.message, /403 Forbidden/);
  assert.match(state.message, /Next step:/);
});

test('createUiState returns success state', () => {
  const state = createUiState('apply', 'success');
  assert.equal(state.phase, 'success');
  assert.equal(state.operation, 'apply');
  assert.match(state.message, /Findings ready/i);
});

test('createUiState interruption flow uses cancellation next step guidance', () => {
  const state = createUiState('scan', 'error', {
    reason: 'Request canceled',
  });

  assert.equal(state.phase, 'error');
  assert.match(state.message, /Request canceled/);
  assert.match(state.message, /Run the check again when you are ready/i);
});

test('createUiState error for config issues uses server/proxy guidance', () => {
  const state = createUiState('scan', 'error', {
    reason:
      'Missing MATMETRICS_GO_PROXY_BASE_URL while forwarding request to upstream proxy',
  });

  assert.equal(state.phase, 'error');
  assert.match(state.message, /MATMETRICS_GO_PROXY_BASE_URL/);
  assert.match(state.message, /Check server\/proxy configuration and retry/i);
});

test('createUiState error for generic preview failures keeps refresh guidance', () => {
  const state = createUiState('preview', 'error', {
    reason: 'Preview generation failed for selected markdown file.',
  });

  assert.equal(state.phase, 'error');
  assert.match(state.message, /Preview generation failed/);
  assert.match(state.message, /Refresh logs and retry/i);
});
