import type {
  PluginMaturityCategory,
  PluginMaturityCategoryScore,
} from '@/lib/plugins/types';

export function normalizeMaturityCategoryScores(
  scores: Record<PluginMaturityCategory, number>,
  labels: Record<PluginMaturityCategory, string>,
  maximums: Record<PluginMaturityCategory, number>
): Record<PluginMaturityCategory, PluginMaturityCategoryScore> {
  return Object.fromEntries(
    (Object.keys(maximums) as PluginMaturityCategory[]).map((category) => [
      category,
      {
        label: labels[category],
        earned: Math.max(0, Math.min(maximums[category], scores[category])),
        possible: maximums[category],
      } satisfies PluginMaturityCategoryScore,
    ])
  ) as Record<PluginMaturityCategory, PluginMaturityCategoryScore>;
}

export function totalMaturityScore(
  scores: Record<PluginMaturityCategory, PluginMaturityCategoryScore>
): number {
  return (Object.keys(scores) as PluginMaturityCategory[]).reduce(
    (total, category) => total + scores[category].earned,
    0
  );
}
