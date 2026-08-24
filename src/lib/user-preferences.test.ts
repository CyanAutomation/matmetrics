import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_VIDEO_LIBRARY_PREFERENCES,
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
