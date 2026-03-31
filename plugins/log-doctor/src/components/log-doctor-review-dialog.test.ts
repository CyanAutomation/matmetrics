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

  assert.deepEqual(Object.keys(grouped), ['What to fix now']);
  assert.equal(
    AUDIT_FLAG_PRESENTATION.empty_notes.helperText,
    'Add notes about what felt good and what to change next time.'
  );
  assert.equal(
    AUDIT_FLAG_PRESENTATION.duration_outlier.helperText,
    'Double-check the session time and correct it if it looks too high or too low.'
  );
});
