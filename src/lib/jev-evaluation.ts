import { SESSION_CATEGORIES, type SessionCategory } from './types';

export {
  JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD,
  shouldOfferCategorySuggestion,
} from './jev-policy';

export const DEFAULT_JEV_EVALUATION_THRESHOLDS = [
  0.5, 0.6, 0.7, 0.8, 0.9,
] as const;

export type CategoryPredictionOutcome = {
  predictedCategory: SessionCategory;
  actualCategory: SessionCategory;
  confidence: number;
};

export type CategoryThresholdEvaluation = {
  threshold: number;
  accepted: number;
  correct: number;
  accuracy: number | null;
  coverage: number;
};

export type NoulPredictionOutcome = {
  probability: number;
  actual: boolean;
};

export type NoulThresholdEvaluation = {
  threshold: number;
  accepted: number;
  truePositives: number;
  falsePositives: number;
  precision: number | null;
  recall: number | null;
  coverage: number;
};

function isSessionCategory(value: unknown): value is SessionCategory {
  return SESSION_CATEGORIES.includes(value as SessionCategory);
}

export function evaluateCategoryThresholds(
  outcomes: CategoryPredictionOutcome[],
  thresholds: readonly number[] = DEFAULT_JEV_EVALUATION_THRESHOLDS
): CategoryThresholdEvaluation[] {
  if (outcomes.length === 0) {
    throw new Error('At least one category evaluation example is required');
  }

  for (const outcome of outcomes) {
    if (
      !isSessionCategory(outcome.predictedCategory) ||
      !isSessionCategory(outcome.actualCategory)
    ) {
      throw new Error(
        'Category evaluation examples contain an invalid category'
      );
    }
    if (
      !Number.isFinite(outcome.confidence) ||
      outcome.confidence < 0 ||
      outcome.confidence > 1
    ) {
      throw new Error('Category confidence must be between 0 and 1');
    }
  }

  for (const threshold of thresholds) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error('Category threshold must be between 0 and 1');
    }
  }

  return thresholds.map((threshold) => {
    const accepted = outcomes.filter(
      (outcome) => outcome.confidence >= threshold
    );
    const correct = accepted.filter(
      (outcome) => outcome.predictedCategory === outcome.actualCategory
    ).length;

    return {
      threshold,
      accepted: accepted.length,
      correct,
      accuracy: accepted.length === 0 ? null : correct / accepted.length,
      coverage: accepted.length / outcomes.length,
    };
  });
}

export function evaluateNoulThresholds(
  outcomes: NoulPredictionOutcome[],
  thresholds: readonly number[] = DEFAULT_JEV_EVALUATION_THRESHOLDS
): NoulThresholdEvaluation[] {
  if (outcomes.length === 0) {
    throw new Error('At least one Noul evaluation example is required');
  }

  for (const outcome of outcomes) {
    if (typeof outcome.actual !== 'boolean') {
      throw new Error('Noul evaluation labels must be boolean');
    }
    if (
      !Number.isFinite(outcome.probability) ||
      outcome.probability < 0 ||
      outcome.probability > 1
    ) {
      throw new Error('Noul probability must be between 0 and 1');
    }
  }

  for (const threshold of thresholds) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error('Noul threshold must be between 0 and 1');
    }
  }

  const positiveCount = outcomes.filter((outcome) => outcome.actual).length;

  return thresholds.map((threshold) => {
    const accepted = outcomes.filter(
      (outcome) => outcome.probability >= threshold
    );
    const truePositives = accepted.filter((outcome) => outcome.actual).length;
    const falsePositives = accepted.length - truePositives;

    return {
      threshold,
      accepted: accepted.length,
      truePositives,
      falsePositives,
      precision: accepted.length === 0 ? null : truePositives / accepted.length,
      recall: positiveCount === 0 ? null : truePositives / positiveCount,
      coverage: accepted.length / outcomes.length,
    };
  });
}
