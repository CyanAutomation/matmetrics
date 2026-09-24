import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCategoryThresholds,
  evaluateNoulThresholds,
  JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD,
  shouldOfferCategorySuggestion,
  type CategoryPredictionOutcome,
} from './jev-evaluation';

const outcomes: CategoryPredictionOutcome[] = [
  {
    predictedCategory: 'Technical',
    actualCategory: 'Technical',
    confidence: 0.95,
  },
  {
    predictedCategory: 'Randori',
    actualCategory: 'Cardio',
    confidence: 0.85,
  },
  {
    predictedCategory: 'Shiai',
    actualCategory: 'Shiai',
    confidence: 0.75,
  },
];

test('category threshold evaluation reports accepted accuracy and coverage', () => {
  assert.deepEqual(evaluateCategoryThresholds(outcomes, [0.7, 0.8, 0.9]), [
    {
      threshold: 0.7,
      accepted: 3,
      correct: 2,
      accuracy: 2 / 3,
      coverage: 1,
    },
    {
      threshold: 0.8,
      accepted: 2,
      correct: 1,
      accuracy: 0.5,
      coverage: 2 / 3,
    },
    {
      threshold: 0.9,
      accepted: 1,
      correct: 1,
      accuracy: 1,
      coverage: 1 / 3,
    },
  ]);
});

test('category threshold evaluation represents no accepted predictions safely', () => {
  assert.deepEqual(evaluateCategoryThresholds(outcomes, [1])[0], {
    threshold: 1,
    accepted: 0,
    correct: 0,
    accuracy: null,
    coverage: 0,
  });
});

test('category apply threshold is centralized and includes its exact boundary', () => {
  assert.equal(JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD, 0.8);
  assert.equal(shouldOfferCategorySuggestion(0.799), false);
  assert.equal(shouldOfferCategorySuggestion(0.8), true);
  assert.equal(shouldOfferCategorySuggestion(1), true);
  assert.equal(shouldOfferCategorySuggestion(Number.NaN), false);
});

test('category threshold evaluation rejects invalid examples and cutoffs', () => {
  assert.throws(() => evaluateCategoryThresholds([], [0.8]), /example/i);
  assert.throws(
    () =>
      evaluateCategoryThresholds([{ ...outcomes[0], confidence: 1.1 }], [0.8]),
    /confidence/i
  );
  assert.throws(
    () => evaluateCategoryThresholds(outcomes, [1.1]),
    /threshold/i
  );
});

test('Noul threshold evaluation reports precision, recall, and coverage', () => {
  assert.deepEqual(
    evaluateNoulThresholds(
      [
        { probability: 0.98, actual: true },
        { probability: 0.85, actual: true },
        { probability: 0.9, actual: false },
        { probability: 0.4, actual: false },
      ],
      [0.8, 0.95]
    ),
    [
      {
        threshold: 0.8,
        accepted: 3,
        truePositives: 2,
        falsePositives: 1,
        precision: 2 / 3,
        recall: 1,
        coverage: 0.75,
      },
      {
        threshold: 0.95,
        accepted: 1,
        truePositives: 1,
        falsePositives: 0,
        precision: 1,
        recall: 0.5,
        coverage: 0.25,
      },
    ]
  );
});

test('Noul threshold evaluation handles empty positive or accepted sets', () => {
  assert.deepEqual(
    evaluateNoulThresholds(
      [
        { probability: 0.4, actual: false },
        { probability: 0.2, actual: false },
      ],
      [0.9]
    )[0],
    {
      threshold: 0.9,
      accepted: 0,
      truePositives: 0,
      falsePositives: 0,
      precision: null,
      recall: null,
      coverage: 0,
    }
  );
});
