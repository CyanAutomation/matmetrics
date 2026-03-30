import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AuditSessionResult } from './log-doctor-state';
import { AuditResults } from './log-doctor-audit-results';

test('AuditResults renders plain-language groups, helper text, and edit CTA', () => {
  const results: AuditSessionResult[] = [
    {
      sessionId: 'session-1',
      sessionDate: '2026-03-10',
      reviewedAt: undefined,
      ignoredRules: [],
      flags: [
        {
          code: 'empty_description',
          severity: 'warning',
          message: 'Description is empty.',
        },
        {
          code: 'duration_outlier',
          severity: 'info',
          message: 'Duration is far from your typical range.',
        },
      ],
    },
  ];

  const markup = renderToStaticMarkup(
    <AuditResults results={results} onReview={() => undefined} />
  );

  assert.match(markup, /Missing details/);
  assert.match(markup, /Unusual values/);
  assert.match(markup, /How to fix this:/);
  assert.match(markup, /Open session to edit/);
  assert.match(markup, /Severity: warning/);
});
