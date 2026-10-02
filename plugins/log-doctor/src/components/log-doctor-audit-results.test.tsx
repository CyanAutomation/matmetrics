import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AuditSessionResult } from './log-doctor-state';
import { AuditResults } from './log-doctor-audit-results';
import type { AuditRunResult } from '@/lib/types';

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

  assert.match(markup, /What to fix now/);
  assert.match(markup, /How to fix this:/);
  assert.match(markup, /Open session to edit/);
  assert.match(markup, /Severity: warning/);
});

test('AuditResults explains incomplete semantic checks without naming providers', () => {
  const results: AuditSessionResult[] = [
    {
      sessionId: 'session-1',
      sessionDate: '2026-03-10',
      ignoredRules: [],
      flags: [
        {
          code: 'category_mismatch',
          severity: 'warning',
          message: 'This session may fit Randori better than Technical.',
        },
        {
          code: 'missing_reflection',
          severity: 'info',
          message: 'Consider recording what worked.',
        },
      ],
    },
  ];
  const semanticAudit: AuditRunResult['semanticAudit'] = {
    status: 'partial',
    assessedSessions: 1,
    failedSessions: 1,
  };
  const markup = renderToStaticMarkup(
    <AuditResults
      results={results}
      semanticAudit={semanticAudit}
      onReview={() => undefined}
    />
  );

  assert.match(markup, /Some semantic checks could not be completed/);
  assert.match(markup, /failed for 1 session\./);
  assert.match(markup, /Exact checks still ran for every session/);
  assert.match(markup, /Possible session type mismatch/);
  assert.match(markup, /Reflection suggestion/);
  assert.match(markup, /Consider:/);
  assert.doesNotMatch(markup, /JEV|TypeSafe|OpenRouter|model/i);
});
