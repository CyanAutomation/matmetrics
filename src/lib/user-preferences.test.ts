import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_VIDEO_LIBRARY_PREFERENCES,
  normalizeExpectedVideoCategories,
} from '@/lib/user-preferences';

test('normalizeExpectedVideoCategories keeps valid categories in canonical order', () => {
  assert.deepEqual(
    normalizeExpectedVideoCategories(['Shiai', 'Technical', 'Shiai']),
    ['Technical', 'Shiai']
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
