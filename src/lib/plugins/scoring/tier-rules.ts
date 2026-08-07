import type {
  PluginMaturityCategory,
  PluginMaturityTier,
} from '@/lib/plugins/types';

export const GOLD_THRESHOLDS: Record<PluginMaturityCategory, number> = {
  contract_metadata: 10,
  runtime_integration: 18,
  feature_quality: 20,
  test_coverage: 15,
  operability_docs: 12,
};

export function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

export function determineBaseTier(
  totalScore: number,
  hasAnyTestEvidence: boolean,
  hasReadme: boolean
): PluginMaturityTier {
  if (totalScore >= 70 && hasAnyTestEvidence && hasReadme) return 'silver';
  return 'bronze';
}

export function meetsGoldCategoryThresholds(
  categoryScores: Record<PluginMaturityCategory, number>
): boolean {
  return (
    categoryScores.runtime_integration >= GOLD_THRESHOLDS.runtime_integration &&
    categoryScores.feature_quality >= GOLD_THRESHOLDS.feature_quality &&
    categoryScores.operability_docs >= GOLD_THRESHOLDS.operability_docs
  );
}
