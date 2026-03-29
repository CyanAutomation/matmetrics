import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LogDoctorStatusAlerts } from './log-doctor';
import { createUiState } from './log-doctor-state';

test('LogDoctorStatusAlerts error snapshot renders one detailed error block with retry action', () => {
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

  const detailedErrorCount =
    markup.match(/Downstream service unavailable/g)?.length ?? 0;

  assert.equal(detailedErrorCount, 1);
  assert.match(markup, /An actionable error is shown below/);
  assert.match(markup, /Log Doctor error/);
  assert.match(markup, /aria-label="Retry log doctor scan"/);
});
