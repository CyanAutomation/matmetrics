import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCategoryThresholds,
  evaluateNoulThresholds,
  evaluateScoreThresholds,
  JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD,
  shouldOfferCategorySuggestion,
  type CategoryPredictionOutcome,
} from './jev-evaluation';
import {
  JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD,
  JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD,
  JEV_FATIGUE_NUDGE_SCORE_THRESHOLD,
  JEV_INJURY_NUDGE_PROBABILITY_THRESHOLD,
  JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD,
  JEV_TRANSFORM_FIDELITY_CONCERN_THRESHOLD,
  hasClearSessionCategoryFit,
  shouldFlagTransformedDescription,
  shouldPromptForReflection,
  shouldPromptForTechniqueDetail,
  shouldShowRecoveryNudge,
} from './jev-policy';

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

test('category threshold evaluation also gates on category fit when supplied', () => {
  assert.deepEqual(
    evaluateCategoryThresholds(
      [
        {
          predictedCategory: 'Technical',
          actualCategory: 'Technical',
          confidence: 0.95,
          categoryFitProbability: 0.96,
        },
        {
          predictedCategory: 'Randori',
          actualCategory: 'Cardio',
          confidence: 0.99,
          categoryFitProbability: 0.42,
        },
        {
          predictedCategory: 'Shiai',
          actualCategory: 'Shiai',
          confidence: 0.85,
          categoryFitProbability: 0.8,
        },
      ],
      [0.8]
    ),
    [
      {
        threshold: 0.8,
        accepted: 2,
        correct: 2,
        accuracy: 1,
        coverage: 2 / 3,
      },
    ]
  );
});

test('category threshold evaluation rejects partially recorded fit probabilities', () => {
  assert.throws(
    () =>
      evaluateCategoryThresholds(
        [
          {
            predictedCategory: 'Technical',
            actualCategory: 'Technical',
            confidence: 0.95,
            categoryFitProbability: 0.96,
          },
          outcomes[1],
        ],
        [0.8]
      ),
    /present on every row/i
  );
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
  assert.equal(JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD, 0.8);
  assert.equal(JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD, 0.9);
  assert.equal(JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD, 0.5);
  assert.equal(JEV_FATIGUE_NUDGE_SCORE_THRESHOLD, 1);
  assert.equal(JEV_INJURY_NUDGE_PROBABILITY_THRESHOLD, 0.5);
  assert.equal(JEV_TRANSFORM_FIDELITY_CONCERN_THRESHOLD, 0.5);
  assert.equal(shouldOfferCategorySuggestion(0.8, 0.8), true);
  assert.equal(shouldOfferCategorySuggestion(0.799, 1), false);
  assert.equal(shouldOfferCategorySuggestion(1, 0.799), false);
  assert.equal(shouldOfferCategorySuggestion(1, 1), true);
  assert.equal(shouldOfferCategorySuggestion(Number.NaN, 1), false);
  assert.equal(shouldOfferCategorySuggestion(1, Number.NaN), false);
  assert.equal(hasClearSessionCategoryFit(0.8), true);
  assert.equal(hasClearSessionCategoryFit(0.799), false);
  assert.equal(shouldPromptForTechniqueDetail(0.49), true);
  assert.equal(shouldPromptForTechniqueDetail(0.5), false);
  assert.equal(shouldPromptForReflection(0.49), true);
  assert.equal(shouldPromptForReflection(0.5), false);
  assert.equal(shouldShowRecoveryNudge(1, 0), true);
  assert.equal(shouldShowRecoveryNudge(0.99, 0.5), true);
  assert.equal(shouldShowRecoveryNudge(0.99, 0.49), false);
  assert.equal(shouldFlagTransformedDescription(0.5), true);
  assert.equal(shouldFlagTransformedDescription(0.49), false);
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

test('Score threshold evaluation reports precision, recall, and coverage', () => {
  assert.deepEqual(
    evaluateScoreThresholds(
      [
        { score: 1.8, actual: true },
        { score: 1.2, actual: true },
        { score: 1.1, actual: false },
        { score: 0.3, actual: false },
      ],
      [1, 1.5]
    ),
    [
      {
        threshold: 1,
        accepted: 3,
        truePositives: 2,
        falsePositives: 1,
        precision: 2 / 3,
        recall: 1,
        coverage: 0.75,
      },
      {
        threshold: 1.5,
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

test('Score threshold evaluation rejects values outside the score scale', () => {
  assert.throws(
    () => evaluateScoreThresholds([{ score: 2.1, actual: true }], [1]),
    /score/i
  );
  assert.throws(
    () => evaluateScoreThresholds([{ score: 1, actual: true }], [2.1]),
    /threshold/i
  );
});
