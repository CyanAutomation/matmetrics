import {
  evaluateCategoryThresholdGrid,
  evaluateCategoryThresholds,
  evaluateNoulThresholds,
  evaluateScoreThresholds,
  type CategoryPredictionOutcome,
  type NoulPredictionOutcome,
  type ScorePredictionOutcome,
} from '../src/lib/jev-evaluation';
import { SESSION_CATEGORIES, type SessionCategory } from '../src/lib/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidOutcome(kind: string, index: number): Error {
  return new Error(`Invalid ${kind} outcome at row ${index + 1}`);
}

function parseSessionCategory(
  value: unknown,
  index: number
): SessionCategory {
  if (!SESSION_CATEGORIES.includes(value as SessionCategory)) {
    throw invalidOutcome('Choice', index);
  }
  return value as SessionCategory;
}

function parseOutcomeNumber(value: unknown, kind: string, index: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidOutcome(kind, index);
  }
  return value;
}

function parseCategoryOutcome(
  row: unknown,
  index: number
): CategoryPredictionOutcome {
  if (!isRecord(row)) throw invalidOutcome('Choice', index);
  const categoryFitProbability = row.categoryFitProbability;

  return {
    predictedCategory: parseSessionCategory(row.predictedCategory, index),
    actualCategory: parseSessionCategory(row.actualCategory, index),
    confidence: parseOutcomeNumber(row.confidence, 'Choice', index),
    ...(categoryFitProbability === undefined
      ? {}
      : {
          categoryFitProbability: parseOutcomeNumber(
            categoryFitProbability,
            'Choice',
            index
          ),
        }),
  };
}

function parseCategoryOutcomes(value: unknown): CategoryPredictionOutcome[] {
  if (!Array.isArray(value)) {
    throw new Error('Choice outcomes must be a JSON array');
  }
  return value.map(parseCategoryOutcome);
}

function parseNoulOutcome(row: unknown, index: number): NoulPredictionOutcome {
  if (!isRecord(row)) throw invalidOutcome('Noul', index);
  if (typeof row.actual !== 'boolean') throw invalidOutcome('Noul', index);
  return {
    probability: parseOutcomeNumber(row.probability, 'Noul', index),
    actual: row.actual,
  };
}

function parseNoulOutcomes(value: unknown): NoulPredictionOutcome[] {
  if (!Array.isArray(value)) {
    throw new Error('Noul outcomes must be a JSON array');
  }
  return value.map(parseNoulOutcome);
}

function parseScoreOutcome(row: unknown, index: number): ScorePredictionOutcome {
  if (!isRecord(row)) throw invalidOutcome('Score', index);
  if (typeof row.actual !== 'boolean') throw invalidOutcome('Score', index);
  return {
    score: parseOutcomeNumber(row.score, 'Score', index),
    actual: row.actual,
  };
}

function parseScoreOutcomes(value: unknown): ScorePredictionOutcome[] {
  if (!Array.isArray(value)) {
    throw new Error('Score outcomes must be a JSON array');
  }
  return value.map(parseScoreOutcome);
}

function parseThresholds(value: unknown, name: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
    throw new Error(`${name} must be an array of numbers`);
  }
  return value as number[];
}

function ensureSingleResolvedModel(value: unknown[]): void {
  const modelRows = value.filter(
    (row) => isRecord(row) && typeof row.resolvedModel === 'string'
  );
  const models = new Set(
    modelRows.map((row) => (row as Record<string, unknown>).resolvedModel)
  );

  if (
    models.size > 1 ||
    (models.size === 1 && modelRows.length !== value.length)
  ) {
    throw new Error('Use one resolved JEV model version per evaluation file');
  }
}

function parseEvaluationDocument(value: unknown): Record<string, unknown> & {
  outcomes: unknown[];
} {
  if (!isRecord(value) || !Array.isArray(value.outcomes)) {
    throw new Error('Input must contain a kind and an outcomes array');
  }
  ensureSingleResolvedModel(value.outcomes);
  return value as Record<string, unknown> & { outcomes: unknown[] };
}

function evaluateChoiceInput(input: Record<string, unknown> & { outcomes: unknown[] }) {
  const outcomes = parseCategoryOutcomes(input.outcomes);
  const confidenceThresholds = parseThresholds(
    input.confidenceThresholds,
    'confidenceThresholds'
  );
  const categoryFitThresholds = parseThresholds(
    input.categoryFitThresholds,
    'categoryFitThresholds'
  );
  const hasFitProbability = outcomes.every(
    (outcome) => outcome.categoryFitProbability !== undefined
  );

  if (hasFitProbability) {
    return evaluateCategoryThresholdGrid(
      outcomes,
      confidenceThresholds,
      categoryFitThresholds
    );
  }
  return evaluateCategoryThresholds(outcomes, confidenceThresholds);
}

export function evaluateThresholdInput(value: unknown) {
  const input = parseEvaluationDocument(value);
  switch (input.kind) {
    case 'choice':
      return evaluateChoiceInput(input);
    case 'noul':
      return evaluateNoulThresholds(parseNoulOutcomes(input.outcomes));
    case 'score':
      return evaluateScoreThresholds(parseScoreOutcomes(input.outcomes));
    default:
      throw new Error('Evaluation kind must be choice, noul, or score');
  }
}
