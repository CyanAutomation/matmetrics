import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_VIDEO_LIBRARY_PREFERENCES,
  normalizeExpectedVideoCategories,
} from '@/lib/user-preferences';

test('video library defaults include technical expected category', () => {
  assert.deepEqual(DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories, [
    'Technical',
  ]);
});

test('normalizeExpectedVideoCategories keeps valid categories in canonical order', () => {
  assert.deepEqual(
    normalizeExpectedVideoCategories(['Shiai', 'Technical', 'Shiai']),
    ['Technical', 'Shiai']
  );
});

test('normalizeExpectedVideoCategories falls back to default when invalid or empty', () => {
  assert.deepEqual(normalizeExpectedVideoCategories([]), ['Technical']);
  assert.deepEqual(normalizeExpectedVideoCategories(['not-a-category']), [
    'Technical',
  ]);
  assert.deepEqual(normalizeExpectedVideoCategories(undefined), ['Technical']);
});
