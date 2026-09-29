import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JEV_RECURRING_THEME_PROBABILITY_THRESHOLD,
  shouldIncludeRecurringTheme,
} from './jev-policy';

test('recurring-theme policy includes probabilities at the provisional threshold', () => {
  assert.equal(JEV_RECURRING_THEME_PROBABILITY_THRESHOLD, 0.7);
  assert.equal(shouldIncludeRecurringTheme(0.7), true);
  assert.equal(shouldIncludeRecurringTheme(0.69), false);
  assert.equal(shouldIncludeRecurringTheme(1), true);
});

test('recurring-theme policy rejects probabilities outside the valid range', () => {
  assert.equal(shouldIncludeRecurringTheme(-0.01), false);
  assert.equal(shouldIncludeRecurringTheme(1.01), false);
  assert.equal(shouldIncludeRecurringTheme(Number.NaN), false);
  assert.equal(shouldIncludeRecurringTheme(Number.POSITIVE_INFINITY), false);
});
