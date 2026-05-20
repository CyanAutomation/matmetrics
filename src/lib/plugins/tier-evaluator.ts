import type {
  PluginMaturityCategory,
  PluginMaturityTier,
} from './types';

/**
 * Evaluates plugin maturity tier based on category scores and evidence.
 * Centralizes tier promotion rules for clarity and testability.
 */
export class TierEvaluator {
  private readonly SILVER_THRESHOLD = 70;
  private readonly GOLD_THRESHOLD = 85;
  private readonly CRITICAL_CATEGORIES: PluginMaturityCategory[] = [
    'contract_metadata',
    'runtime_integration',
    'feature_quality',
  ];

  /**
   * Evaluate the maturity tier based on scores and evidence
   */
  evaluateTier(
    categoryScores: Record<PluginMaturityCategory, number>,
    evidence?: Record<PluginMaturityCategory, string[]>
  ): PluginMaturityTier {
    const totalScore = Object.values(categoryScores).reduce((sum, score) => sum + score, 0);

    // Check Gold tier criteria
    if (this.shouldPromoteToGold(totalScore, categoryScores, evidence)) {
      return 'Gold';
    }

    // Check Silver tier criteria
    if (totalScore >= this.SILVER_THRESHOLD) {
      return 'Silver';
    }

    // Default to Bronze
    return 'Bronze';
  }

  /**
   * Check if plugin qualifies for Gold tier
   */
  private shouldPromoteToGold(
    totalScore: number,
    categoryScores: Record<PluginMaturityCategory, number>,
    evidence?: Record<PluginMaturityCategory, string[]>
  ): boolean {
    if (totalScore < this.GOLD_THRESHOLD) {
      return false;
    }

    if (!evidence) {
      return false;
    }

    // All critical categories must have evidence
    for (const category of this.CRITICAL_CATEGORIES) {
      const categoryEvidence = evidence[category];
      if (!categoryEvidence || categoryEvidence.length === 0) {
        return false;
      }

      // Check that evidence indicates explicit verification
      const hasExplicitEvidence = categoryEvidence.some(
        (e) =>
          e.toLowerCase().includes('explicit') ||
          e.toLowerCase().includes('verified') ||
          e.toLowerCase().includes('assertion')
      );

      if (!hasExplicitEvidence) {
        return false;
      }
    }

    // Check test coverage requirement for Gold
    const testEvidence = evidence.test_coverage;
    if (!testEvidence || testEvidence.length === 0) {
      return false;
    }

    // Additional heuristic: score should be reasonably balanced
    // No single category should be significantly weaker than others
    const scores = Object.values(categoryScores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const minScore = Math.min(...scores);

    if (minScore < avgScore * 0.5) {
      return false;
    }

    return true;
  }
}
