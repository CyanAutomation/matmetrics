import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_VIDEO_LIBRARY_PREFERENCES,
  normalizeLastAuditRun,
  normalizeSessionTypePreferences,
  normalizeExpectedVideoCategories,
  normalizeTrainingPlanPreferences,
} from '@/lib/user-preferences';

test('normalizeSessionTypePreferences preserves valid enabled types and always enables Technical', () => {
  assert.deepEqual(
    normalizeSessionTypePreferences({
      enabledCategories: ['S&C', 'Cardio', 'Technical', 'Cardio'],
    }),
    { enabledCategories: ['Technical', 'Cardio', 'S&C'] }
  );

  assert.deepEqual(
    normalizeSessionTypePreferences({ enabledCategories: ['Randori'] }),
    { enabledCategories: ['Technical', 'Randori'] }
  );
});

test('normalizeSessionTypePreferences defaults legacy preferences to every session type', () => {
  assert.deepEqual(normalizeSessionTypePreferences(undefined), {
    enabledCategories: ['Technical', 'Randori', 'Shiai', 'Cardio', 'S&C'],
  });
});

test('normalizeExpectedVideoCategories keeps valid categories in canonical order', () => {
  assert.deepEqual(
    normalizeExpectedVideoCategories(['Shiai', 'Technical', 'Shiai']),
    ['Technical', 'Shiai']
  );
});

test('normalizeTrainingPlanPreferences keeps personal targets and migrates legacy monthly targets', () => {
  assert.deepEqual(
    normalizeTrainingPlanPreferences({
      categories: {
        Technical: {
          targetSessionsPerMonth: 3.6,
        },
        Randori: {
          targetSessions: 2,
          cadence: 'month',
        },
        Shiai: {
          targetSessions: 1,
          cadence: 'week',
        },
        Cardio: {
          targetSessions: 0,
          cadence: 'month',
        },
        'S&C': {
          targetSessions: 0,
          cadence: 'month',
        },
      },
    }),
    {
      categories: {
        Technical: {
          targetSessions: 4,
          cadence: 'month',
        },
        Randori: {
          targetSessions: 2,
          cadence: 'month',
        },
        Shiai: {
          targetSessions: 1,
          cadence: 'week',
        },
        Cardio: {
          targetSessions: 0,
          cadence: 'month',
        },
        'S&C': {
          targetSessions: 0,
          cadence: 'month',
        },
      },
    }
  );
});

test('normalizeExpectedVideoCategories falls back to default when invalid or empty', () => {
  // Product requirement: Technical sessions are expected to include video by default.
  assert.deepEqual(
    normalizeExpectedVideoCategories([]),
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories
  );
  assert.deepEqual(
    normalizeExpectedVideoCategories(['not-a-category']),
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories
  );
  assert.deepEqual(
    normalizeExpectedVideoCategories(undefined),
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories
  );

  const defaultBeforeMutation = [
    ...DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories,
  ];
  const normalized = normalizeExpectedVideoCategories(undefined);
  assert.notStrictEqual(
    normalized,
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories
  );
  normalized.push('Randori');
  assert.deepEqual(
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories,
    defaultBeforeMutation
  );
});

test('normalizeLastAuditRun preserves valid semantic availability summaries', () => {
  assert.deepEqual(
    normalizeLastAuditRun({
      sessions: [],
      ranAt: '2026-10-02T12:00:00.000Z',
      semanticAudit: {
        status: 'partial',
        assessedSessions: 4,
        failedSessions: 1,
      },
    }),
    {
      sessions: [],
      ranAt: '2026-10-02T12:00:00.000Z',
      semanticAudit: {
        status: 'partial',
        assessedSessions: 4,
        failedSessions: 1,
      },
    }
  );
});

test('normalizeLastAuditRun ignores malformed or legacy semantic summaries', () => {
  const legacy = normalizeLastAuditRun({ sessions: [], ranAt: '2026-10-02' });
  assert.deepEqual(legacy, { sessions: [], ranAt: '2026-10-02' });

  const malformed = normalizeLastAuditRun({
    sessions: [],
    ranAt: '2026-10-02',
    semanticAudit: {
      status: 'failed',
      assessedSessions: -1,
      failedSessions: Number.NaN,
    },
  });
  assert.deepEqual(malformed, { sessions: [], ranAt: '2026-10-02' });
});
