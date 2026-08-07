/**
 * Tier Determination (Pure Functions)
 *
 * Determines plugin maturity tier (bronze, silver, gold) based on:
 * - Category scores and thresholds
 * - Validation errors and warnings
 * - Test coverage requirements
 * - Documentation completeness
 * - UX criteria verification
 *
 * All functions are pure with no side effects or file I/O.
 * All inputs must be pre-computed.
 */

import type {
  PluginMaturityCategory,
  PluginMaturityTier,
} from '@/lib/plugins/types';
import type { TierEvaluationResult } from './types';
import {
  addUnique,
  determineBaseTier,
  meetsGoldCategoryThresholds,
} from './tier-rules';

export interface TierDeterminationInput {
  /** Total score across all categories */
  totalScore: number;

  /** Category scores: Record<category, earned points> */
  categoryScores: Record<PluginMaturityCategory, number>;

  /** Whether plugin has manifest validation errors */
  hasValidationErrors: boolean;

  /** Whether plugin has capability/version blocking warnings */
  hasBlockingWarnings: boolean;

  /** Whether plugin has any automated test evidence */
  hasAnyTestEvidence: boolean;

  /** Whether plugin has README */
  hasReadme: boolean;

  /** Whether test evidence is explicit (not heuristic) */
  hasExplicitTestEvidence: boolean;

  /** Whether all relevant UX criteria are explicitly verified */
  allRelevantUxCriteriaExplicitlyVerified: boolean;

  /** Whether readme has advanced support docs (troubleshooting, known limitations) */
  hasGoldSupportDocs: boolean;

  /** Whether manifest explicitly marks tier as gold */
  isExplicitGoldReview: boolean;

  /** Validation issues for blocker extraction */
  validationIssues: Array<{
    severity: 'error' | 'warning';
    message: string;
  }>;

  /** Blocking warnings list */
  blockingWarnings: string[];
}

/**
 * Checks if Silver tier criteria are met.
 */
export function shouldBeSilver(
  totalScore: number,
  hasValidationErrors: boolean,
  hasBlockingWarnings: boolean,
  hasAnyTestEvidence: boolean,
  hasReadme: boolean
): boolean {
  return (
    totalScore >= 70 &&
    !hasValidationErrors &&
    !hasBlockingWarnings &&
    hasAnyTestEvidence &&
    hasReadme
  );
}

/**
 * Checks if Gold tier criteria are met.
 */
export function shouldBeGold(
  totalScore: number,
  hasValidationErrors: boolean,
  hasBlockingWarnings: boolean,
  hasAnyTestEvidence: boolean,
  hasReadme: boolean,
  hasExplicitTestEvidence: boolean,
  allRelevantUxCriteriaExplicitlyVerified: boolean,
  hasGoldRuntimeIntegration: boolean,
  hasGoldFeatureQuality: boolean,
  hasGoldOperabilityDocs: boolean,
  categoryScores: Record<PluginMaturityCategory, number>,
  hasGoldSupportDocs: boolean,
  isExplicitGoldReview: boolean
): boolean {
  return (
    totalScore >= 85 &&
    !hasValidationErrors &&
    !hasBlockingWarnings &&
    hasAnyTestEvidence &&
    hasReadme &&
    hasExplicitTestEvidence &&
    allRelevantUxCriteriaExplicitlyVerified &&
    hasGoldRuntimeIntegration &&
    hasGoldFeatureQuality &&
    hasGoldOperabilityDocs &&
    meetsGoldCategoryThresholds(categoryScores) &&
    hasGoldSupportDocs &&
    isExplicitGoldReview
  );
}

/**
 * Collects blocker messages based on tier determination input.
 */
export function collectBlockers(
  hasValidationErrors: boolean,
  hasBlockingWarnings: boolean,
  hasAnyTestEvidence: boolean,
  hasReadme: boolean,
  tier: PluginMaturityTier
): string[] {
  const blockers: string[] = [];

  if (hasValidationErrors) {
    blockers.push('Manifest validation errors cap the plugin at Bronze.');
  }

  if (hasBlockingWarnings) {
    blockers.push(
      'Capability or version warnings cap the plugin at Bronze until resolved.'
    );
  }

  if (!hasAnyTestEvidence) {
    blockers.push('Missing automated test evidence caps the plugin at Bronze.');
  }

  if (!hasReadme && tier >= 'silver') {
    blockers.push(
      'Missing plugin documentation prevents promotion beyond Bronze/Silver.'
    );
  }

  return blockers;
}

/**
 * Collects next action messages based on tier determination results.
 */
export function collectNextActions(
  tier: PluginMaturityTier,
  totalScore: number,
  isExplicitGoldReview: boolean,
  hasExplicitTestEvidence: boolean,
  allRelevantUxCriteriaExplicitlyVerified: boolean,
  hasGoldRuntimeIntegration: boolean,
  hasGoldFeatureQuality: boolean,
  hasGoldOperabilityDocs: boolean,
  hasGoldSupportDocs: boolean
): string[] {
  const nextActions: string[] = [];

  if (totalScore >= 85 && !isExplicitGoldReview) {
    if (tier !== 'gold') {
      addUnique(
        nextActions,
        'Gold requires an explicit Gold review recorded in manifest maturity metadata.'
      );
    }
  }

  if (totalScore >= 85 && isExplicitGoldReview && !hasExplicitTestEvidence) {
    if (tier !== 'gold') {
      addUnique(
        nextActions,
        'Gold requires explicit test evidence declared in manifest maturity metadata.'
      );
    }
  }

  if (
    totalScore >= 85 &&
    isExplicitGoldReview &&
    !allRelevantUxCriteriaExplicitlyVerified
  ) {
    if (tier !== 'gold') {
      addUnique(
        nextActions,
        'Gold requires explicit verification of all relevant UX criteria in manifest maturity metadata.'
      );
    }
  }

  if (tier === 'silver') {
    if (!hasGoldRuntimeIntegration) {
      addUnique(
        nextActions,
        'Improve runtime integration scoring (target: 18/20) for Gold tier.'
      );
    }

    if (!hasGoldFeatureQuality) {
      addUnique(
        nextActions,
        'Improve feature quality scoring (target: 20/25) for Gold tier.'
      );
    }

    if (!hasGoldOperabilityDocs) {
      addUnique(
        nextActions,
        'Improve documentation (target: 12/15 ops docs) for Gold tier.'
      );
    }

    if (!hasGoldSupportDocs) {
      addUnique(
        nextActions,
        'Add troubleshooting or known limitations section to README for Gold tier.'
      );
    }
  }

  return nextActions;
}

export interface TierDeterminationInput {
  /** Total score across all categories */
  totalScore: number;

  /** Category scores: Record<category, earned points> */
  categoryScores: Record<PluginMaturityCategory, number>;

  /** Whether plugin has manifest validation errors */
  hasValidationErrors: boolean;

  /** Whether plugin has capability/version blocking warnings */
  hasBlockingWarnings: boolean;

  /** Whether plugin has any automated test evidence */
  hasAnyTestEvidence: boolean;

  /** Whether plugin has README */
  hasReadme: boolean;

  /** Whether test evidence is explicit (not heuristic) */
  hasExplicitTestEvidence: boolean;

  /** Whether all relevant UX criteria are explicitly verified */
  allRelevantUxCriteriaExplicitlyVerified: boolean;

  /** Whether readme has advanced support docs (troubleshooting, known limitations) */
  hasGoldSupportDocs: boolean;

  /** Whether manifest explicitly marks tier as gold */
  isExplicitGoldReview: boolean;

  /** Validation issues for blocker extraction */
  validationIssues: Array<{
    severity: 'error' | 'warning';
    message: string;
  }>;

  /** Blocking warnings list */
  blockingWarnings: string[];
}

export function determineTier(
  input: TierDeterminationInput
): TierEvaluationResult {
  const {
    totalScore,
    categoryScores,
    hasValidationErrors,
    hasBlockingWarnings,
    hasAnyTestEvidence,
    hasReadme,
    hasExplicitTestEvidence,
    allRelevantUxCriteriaExplicitlyVerified,
    hasGoldSupportDocs,
    isExplicitGoldReview,
  } = input;

  const hasGoldOperabilityDocs = categoryScores.operability_docs >= 12;
  const hasGoldRuntimeIntegration = categoryScores.runtime_integration >= 18;
  const hasGoldFeatureQuality = categoryScores.feature_quality >= 20;

  // Start with Bronze tier (always achievable if manifest parses)
  let tier: PluginMaturityTier = determineBaseTier(
    totalScore,
    hasAnyTestEvidence,
    hasReadme
  );
  if (hasValidationErrors || hasBlockingWarnings) {
    tier = 'bronze';
  }

  // Determine Silver tier using extracted function
  if (
    shouldBeSilver(
      totalScore,
      hasValidationErrors,
      hasBlockingWarnings,
      hasAnyTestEvidence,
      hasReadme
    )
  ) {
    tier = 'silver';
  }

  // Determine Gold tier using extracted function
  if (
    shouldBeGold(
      totalScore,
      hasValidationErrors,
      hasBlockingWarnings,
      hasAnyTestEvidence,
      hasReadme,
      hasExplicitTestEvidence,
      allRelevantUxCriteriaExplicitlyVerified,
      hasGoldRuntimeIntegration,
      hasGoldFeatureQuality,
      hasGoldOperabilityDocs,
      categoryScores,
      hasGoldSupportDocs,
      isExplicitGoldReview
    )
  ) {
    tier = 'gold';
  }

  // Collect blockers using extracted function
  const blockers = collectBlockers(
    hasValidationErrors,
    hasBlockingWarnings,
    hasAnyTestEvidence,
    hasReadme,
    tier
  );

  // Collect next actions using extracted function
  const nextActions = collectNextActions(
    tier,
    totalScore,
    isExplicitGoldReview,
    hasExplicitTestEvidence,
    allRelevantUxCriteriaExplicitlyVerified,
    hasGoldRuntimeIntegration,
    hasGoldFeatureQuality,
    hasGoldOperabilityDocs,
    hasGoldSupportDocs
  );

  return {
    tier,
    blockers,
    nextActions,
  };
}
