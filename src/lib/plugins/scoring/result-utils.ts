import type { PluginMaturityCategory } from '@/lib/plugins/types';
import type { CategoryScoringResult } from './types';
import { pushUnique } from './utils';

export type CategoryScoreAccumulator = Record<PluginMaturityCategory, number>;

export const mergeCategoryScoringResults = (
  results: readonly CategoryScoringResult[],
  categoryScores: CategoryScoreAccumulator,
  evidence: string[],
  reasons: string[],
  nextActions: string[]
): void => {
  for (const result of results) {
    for (const item of result.evidence) pushUnique(evidence, item);
    for (const item of result.reasons) pushUnique(reasons, item);
    for (const item of result.nextActions) pushUnique(nextActions, item);
  }
};

export const mergeCategoryScore = (
  categoryScores: CategoryScoreAccumulator,
  category: PluginMaturityCategory,
  result: CategoryScoringResult
): void => {
  categoryScores[category] = result.score;
};
