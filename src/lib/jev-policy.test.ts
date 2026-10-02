import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD,
  JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD,
  JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD,
  JEV_EFFORT_CONFLICT_PROBABILITY_THRESHOLD,
  JEV_RECURRING_THEME_PROBABILITY_THRESHOLD,
  JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD,
  JEV_USEFUL_DETAIL_PROBABILITY_THRESHOLD,
  hasSufficientTechniqueSupport,
  shouldFlagEffortConflict,
  shouldIncludeRecurringTheme,
  shouldFlagUnsupportedTechniqueTag,
  shouldOfferCategorySuggestion,
  shouldPromptForReflection,
  shouldPromptForUsefulDetail,
} from './jev-policy';

test('session audit policy uses the existing centrally governed JEV thresholds', () => {
  assert.equal(JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD, 0.8);
  assert.equal(JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD, 0.8);
  assert.equal(JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD, 0.9);
  assert.equal(JEV_USEFUL_DETAIL_PROBABILITY_THRESHOLD, 0.5);
  assert.equal(JEV_EFFORT_CONFLICT_PROBABILITY_THRESHOLD, 0.8);
  assert.equal(JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD, 0.5);

  assert.equal(shouldOfferCategorySuggestion(0.8, 0.8), true);
  assert.equal(shouldOfferCategorySuggestion(0.79, 0.9), false);
  assert.equal(shouldOfferCategorySuggestion(0.9, 0.79), false);
  assert.equal(shouldFlagUnsupportedTechniqueTag(0.89), true);
  assert.equal(shouldFlagUnsupportedTechniqueTag(0.9), false);
  assert.equal(hasSufficientTechniqueSupport(0.9), true);
  assert.equal(hasSufficientTechniqueSupport(0.89), false);
  assert.equal(shouldFlagEffortConflict(0.8), true);
  assert.equal(shouldFlagEffortConflict(0.79), false);
  assert.equal(shouldPromptForUsefulDetail(0.49), true);
  assert.equal(shouldPromptForUsefulDetail(0.5), false);
  assert.equal(shouldPromptForReflection(0.49), true);
  assert.equal(shouldPromptForReflection(0.5), false);
});

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

test('semantic audit examples keep mixed or vague entries advisory', () => {
  assert.equal(
    shouldPromptForUsefulDetail(0.49),
    true,
    'vague entries should only receive a low-severity detail suggestion'
  );
  assert.equal(
    shouldOfferCategorySuggestion(0.79, 0.95),
    false,
    'a high category-fit probability without confidence should not suggest a mismatch'
  );
  assert.equal(
    shouldFlagEffortConflict(0.79),
    false,
    'a near-threshold effort probability should not be flagged'
  );
});
