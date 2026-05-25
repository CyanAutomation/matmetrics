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

/**
 * Shared types for intermediate computation states.
 * These help decompose large functions into focused, testable pieces.
 */

export type PluginFileDiscoveryState = {
  hasReadme: boolean;
  hasTests: boolean;
  hasEntry: boolean;
  components: { id: string; file: string }[];
  additionalDocs: string[];
};

export type UxVerificationDetail = {
  criterion: string;
  met: boolean;
  evidence?: string[];
};

export type ComponentVerificationResult = {
  componentId: string;
  met: UxVerificationDetail[];
  missing: UxVerificationDetail[];
};
