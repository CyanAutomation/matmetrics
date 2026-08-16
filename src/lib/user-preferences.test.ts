import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_VIDEO_LIBRARY_PREFERENCES,
  normalizeExpectedVideoCategories,
  normalizeTrainingPlanPreferences,
} from '@/lib/user-preferences';

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
