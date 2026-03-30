import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LogDoctorStatusAlerts } from './log-doctor-status-alerts';
import { createUiState } from './log-doctor-state';

test('LogDoctorStatusAlerts exposes one actionable alert, retry control, and recovery guidance in error state', () => {
  const uiState = createUiState('scan', 'error', {
    reason: 'Downstream service unavailable',
  });

  const markup = renderToStaticMarkup(
    <LogDoctorStatusAlerts
      uiState={uiState}
      errorMessage="Downstream service unavailable"
      onRetry={() => undefined}
    />
  );

  const actionableAlerts = markup.match(/<h3[^>]*>Log Doctor error<\/h3>/g) ?? [];

  assert.equal(actionableAlerts.length, 1, 'expected a single actionable alert');
  assert.match(markup, /An actionable error is shown below\. Use Retry to run the scan again\./);
  assert.match(markup, /Log Doctor error/);
  assert.match(markup, /<button[^>]*aria-label="Retry log doctor scan"[^>]*>/);
  assert.match(markup, />Retry<\/button>/);
});
