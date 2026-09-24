import { readFile } from 'node:fs/promises';
import {
  evaluateCategoryThresholds,
  evaluateNoulThresholds,
  type CategoryPredictionOutcome,
  type NoulPredictionOutcome,
} from '../src/lib/jev-evaluation';
import { SESSION_CATEGORIES, type SessionCategory } from '../src/lib/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseCategoryOutcomes(value: unknown): CategoryPredictionOutcome[] {
  if (!Array.isArray(value)) {
    throw new Error('Choice outcomes must be a JSON array');
  }

  return value.map((row, index) => {
    if (
      !isRecord(row) ||
      !SESSION_CATEGORIES.includes(row.predictedCategory as SessionCategory) ||
      !SESSION_CATEGORIES.includes(row.actualCategory as SessionCategory) ||
      typeof row.confidence !== 'number'
    ) {
      throw new Error(`Invalid Choice outcome at row ${index + 1}`);
    }
    return {
      predictedCategory: row.predictedCategory as SessionCategory,
      actualCategory: row.actualCategory as SessionCategory,
      confidence: row.confidence,
    };
  });
}

function parseNoulOutcomes(value: unknown): NoulPredictionOutcome[] {
  if (!Array.isArray(value)) {
    throw new Error('Noul outcomes must be a JSON array');
  }

  return value.map((row, index) => {
    if (
      !isRecord(row) ||
      typeof row.probability !== 'number' ||
      typeof row.actual !== 'boolean'
    ) {
      throw new Error(`Invalid Noul outcome at row ${index + 1}`);
    }
    return { probability: row.probability, actual: row.actual };
  });
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

async function run(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    throw new Error(
      'Usage: npm run jev:evaluate-thresholds -- /path/to/labeled-predictions.json'
    );
  }

  const contents = await readFile(path, 'utf8');
  const value: unknown = JSON.parse(contents);
  if (!isRecord(value) || !Array.isArray(value.outcomes)) {
    throw new Error('Input must contain a kind and an outcomes array');
  }
  ensureSingleResolvedModel(value.outcomes);

  const results =
    value.kind === 'choice'
      ? evaluateCategoryThresholds(parseCategoryOutcomes(value.outcomes))
      : value.kind === 'noul'
        ? evaluateNoulThresholds(parseNoulOutcomes(value.outcomes))
        : undefined;
  if (!results) throw new Error('Evaluation kind must be choice or noul');

  console.log(JSON.stringify(results, null, 2));
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
