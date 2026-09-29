import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateThresholdInput } from './jev-threshold-evaluator';

test('evaluates choice inputs with confidence and category-fit thresholds', () => {
  const results = evaluateThresholdInput({
    kind: 'choice',
    outcomes: [
      {
        predictedCategory: 'Technical',
        actualCategory: 'Technical',
        confidence: 0.95,
        categoryFitProbability: 0.9,
      },
    ],
    confidenceThresholds: [0.8],
    categoryFitThresholds: [0.8],
  });

  assert.deepEqual(results, [
    {
      confidenceThreshold: 0.8,
      categoryFitThreshold: 0.8,
      accepted: 1,
      correct: 1,
      accuracy: 1,
      coverage: 1,
    },
  ]);
});

test('evaluates choice inputs without category-fit scores on one threshold grid', () => {
  const results = evaluateThresholdInput({
    kind: 'choice',
    outcomes: [
      {
        predictedCategory: 'Technical',
        actualCategory: 'Technical',
        confidence: 0.95,
      },
    ],
    confidenceThresholds: [0.8],
  });

  assert.deepEqual(results, [
    {
      threshold: 0.8,
      accepted: 1,
      correct: 1,
      accuracy: 1,
      coverage: 1,
    },
  ]);
});

test('evaluates Noul and score input kinds', () => {
  assert.ok(
    evaluateThresholdInput({
      kind: 'noul',
      outcomes: [{ probability: 0.9, actual: true }],
    }).length > 0
  );
  assert.ok(
    evaluateThresholdInput({
      kind: 'score',
      outcomes: [{ score: 0.9, actual: true }],
    }).length > 0
  );
});

test('rejects malformed inputs with useful row and field context', () => {
  assert.throws(
    () => evaluateThresholdInput({ kind: 'choice', outcomes: [{ confidence: 0.9 }] }),
    /Invalid Choice outcome at row 1/
  );
  assert.throws(
    () => evaluateThresholdInput({ kind: 'noul', outcomes: [{ probability: 0.2 }] }),
    /Invalid Noul outcome at row 1/
  );
  assert.throws(
    () => evaluateThresholdInput({ kind: 'score', outcomes: [{ score: 0.2 }] }),
    /Invalid Score outcome at row 1/
  );
  assert.throws(
    () =>
      evaluateThresholdInput({
        kind: 'choice',
        outcomes: [{
          predictedCategory: 'Technical',
          actualCategory: 'Technical',
          confidence: 0.9,
        }],
        confidenceThresholds: [1.1],
      }),
    /Category threshold must be between 0 and 1/
  );
});

test('rejects mixed resolved models and unsupported evaluation kinds', () => {
  assert.throws(
    () =>
      evaluateThresholdInput({
        kind: 'noul',
        outcomes: [
          { probability: 0.9, actual: true, resolvedModel: 'jev-a' },
          { probability: 0.2, actual: false, resolvedModel: 'jev-b' },
        ],
      }),
    /one resolved JEV model version/
  );
  assert.throws(
    () => evaluateThresholdInput({ kind: 'other', outcomes: [] }),
    /Evaluation kind must be choice, noul, or score/
  );
  assert.throws(
    () => evaluateThresholdInput({ kind: 'noul', outcomes: [] }),
    /At least one Noul evaluation example is required/
  );
});
