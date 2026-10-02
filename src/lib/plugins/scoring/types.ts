/**
 * Intermediate result types for plugin maturity scoring.
 * These types bundle related scoring outputs to avoid parallel accumulators.
 *
 * Instead of maintaining 4 parallel arrays (scores, evidence, reasons, nextActions),
 * each category scorer returns a single result type containing all related data.
 */

export type CategoryScoringResult = {
  /** Numeric score for this category (0 to category maximum) */
  score: number;

  /** Evidence supporting the score (positive findings) */
  evidence: string[];

  /** Reasons for missing points (gaps or deficiencies) */
  reasons: string[];

  /** Recommended next actions to improve score */
  nextActions: string[];

  /** Blocker issues that prevent higher tiers */
  blockers: string[];
};

export type TierEvaluationResult = {
  /** Plugin maturity tier: bronze, silver, or gold */
  tier: 'bronze' | 'silver' | 'gold';

  /** Conditions that prevent advancement to next tier */
  blockers: string[];

  /** Actions required to advance tier */
  nextActions: string[];
};
