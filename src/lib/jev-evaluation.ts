import { JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD } from './jev-policy';
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
  categoryFitProbability?: number;
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

export type BinaryThresholdEvaluation = {
  threshold: number;
  accepted: number;
  truePositives: number;
  falsePositives: number;
  precision: number | null;
  recall: number | null;
  coverage: number;
};

export type NoulThresholdEvaluation = BinaryThresholdEvaluation;

export type ScorePredictionOutcome = {
  score: number;
  actual: boolean;
};

export type ScoreThresholdEvaluation = BinaryThresholdEvaluation;

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
    if (
      outcome.categoryFitProbability !== undefined &&
      (!Number.isFinite(outcome.categoryFitProbability) ||
        outcome.categoryFitProbability < 0 ||
        outcome.categoryFitProbability > 1)
    ) {
      throw new Error('Category fit probability must be between 0 and 1');
    }
  }

  const fitRows = outcomes.filter(
    (outcome) => outcome.categoryFitProbability !== undefined
  ).length;
  if (fitRows > 0 && fitRows !== outcomes.length) {
    throw new Error('Category fit probabilities must be present on every row');
  }

  for (const threshold of thresholds) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error('Category threshold must be between 0 and 1');
    }
  }

  return thresholds.map((threshold) => {
    const accepted = outcomes.filter(
      (outcome) =>
        outcome.confidence >= threshold &&
        (outcome.categoryFitProbability === undefined ||
          outcome.categoryFitProbability >=
            JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD)
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

export const DEFAULT_JEV_SCORE_THRESHOLDS = [0.5, 1, 1.5] as const;

export function evaluateScoreThresholds(
  outcomes: ScorePredictionOutcome[],
  thresholds: readonly number[] = DEFAULT_JEV_SCORE_THRESHOLDS
): ScoreThresholdEvaluation[] {
  if (outcomes.length === 0) {
    throw new Error('At least one Score evaluation example is required');
  }

  for (const outcome of outcomes) {
    if (typeof outcome.actual !== 'boolean') {
      throw new Error('Score evaluation labels must be boolean');
    }
    if (
      !Number.isFinite(outcome.score) ||
      outcome.score < 0 ||
      outcome.score > 2
    ) {
      throw new Error('Score values must be between 0 and 2');
    }
  }

  for (const threshold of thresholds) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 2) {
      throw new Error('Score threshold must be between 0 and 2');
    }
  }

  const positiveCount = outcomes.filter((outcome) => outcome.actual).length;

  return thresholds.map((threshold) => {
    const accepted = outcomes.filter((outcome) => outcome.score >= threshold);
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
