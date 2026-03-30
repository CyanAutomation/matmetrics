import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUDIT_FLAG_PRESENTATION,
  groupAuditFlagsByHeading,
} from './log-doctor-audit-flag-content';

test('audit review content groups flags with plain-language headings and helper text', () => {
  const grouped = groupAuditFlagsByHeading([
    {
      code: 'empty_notes',
      severity: 'warning',
      message: 'Missing notes.',
    },
    {
      code: 'duration_outlier',
      severity: 'info',
      message: 'Duration is an outlier.',
    },
  ]);

  assert.deepEqual(Object.keys(grouped), ['Missing details', 'Unusual values']);
  assert.equal(
    AUDIT_FLAG_PRESENTATION.empty_notes.helperText,
    'Add quick notes on what felt good and what to improve next time.'
  );
  assert.equal(
    AUDIT_FLAG_PRESENTATION.duration_outlier.helperText,
    'Check the duration and update it if the value is accidentally too high or low.'
  );
});
