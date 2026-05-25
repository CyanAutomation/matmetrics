/**
 * Tier Determination (Pure Function)
 *
 * Determines plugin maturity tier (bronze, silver, gold) based on:
 * - Category scores and thresholds
 * - Validation errors and warnings
 * - Test coverage requirements
 * - Documentation completeness
 * - UX criteria verification
 *
 * This is a pure function with no side effects or file I/O.
 * All inputs must be pre-computed.
 */

import type { PluginMaturityCategory, PluginMaturityTier } from '@/lib/plugins/types';
import type { TierEvaluationResult } from './types';

const pushUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) {
    values.push(value);
  }
};

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
    validationIssues,
    blockingWarnings: inputBlockingWarnings,
  } = input;

  const blockers: string[] = [];
  const nextActions: string[] = [];

  const hasGoldOperabilityDocs = categoryScores.operability_docs >= 12;
  const hasGoldRuntimeIntegration = categoryScores.runtime_integration >= 18;
  const hasGoldFeatureQuality = categoryScores.feature_quality >= 20;

  // Start with Bronze tier (always achievable if manifest parses)
  let tier: PluginMaturityTier = 'bronze';

  // Determine Silver tier
  if (
    totalScore >= 70 &&
    !hasValidationErrors &&
    !hasBlockingWarnings &&
    hasAnyTestEvidence &&
    hasReadme
  ) {
    tier = 'silver';
  }

  // Determine Gold tier (more stringent)
  if (
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
    hasGoldSupportDocs
  ) {
    tier = 'gold';
  }

  // Build blockers list
  if (hasValidationErrors) {
    blockers.push('Manifest validation errors cap the plugin at Bronze.');
    pushUnique(
      nextActions,
      'Fix manifest validation errors to advance tier.'
    );
  }

  if (hasBlockingWarnings) {
    blockers.push(
      'Capability or version warnings cap the plugin at Bronze until resolved.'
    );
    pushUnique(
      nextActions,
      'Resolve capability/version warnings to advance tier.'
    );
  }

  if (!hasAnyTestEvidence) {
    blockers.push('Missing automated test evidence caps the plugin at Bronze.');
    pushUnique(
      nextActions,
      'Add automated tests to enable Silver tier and above.'
    );
  }

  if (!hasReadme) {
    if (tier === 'silver' || tier === 'gold') {
      blockers.push('README is required to reach Silver tier.');
      pushUnique(
        nextActions,
        'Add plugin README with usage and verification sections.'
      );
    }
  }

  if (tier === 'silver' && !hasExplicitTestEvidence) {
    pushUnique(
      nextActions,
      'Document test evidence explicitly in manifest `maturity.evidence.testFiles` to reach Gold.'
    );
  }

  if (tier === 'silver' && !allRelevantUxCriteriaExplicitlyVerified) {
    pushUnique(
      nextActions,
      'Verify all relevant UX criteria explicitly via manifest `maturity.evidence.uxCriteria` for Gold.'
    );
  }

  if (tier === 'silver' && !hasGoldRuntimeIntegration) {
    pushUnique(
      nextActions,
      'Improve runtime integration scoring (target: 18/20) for Gold tier.'
    );
  }

  if (tier === 'silver' && !hasGoldFeatureQuality) {
    pushUnique(
      nextActions,
      'Improve feature quality scoring (target: 20/25) for Gold tier.'
    );
  }

  if (tier === 'silver' && !hasGoldOperabilityDocs) {
    pushUnique(
      nextActions,
      'Improve documentation (target: 12/15 ops docs) for Gold tier.'
    );
  }

  if (tier === 'silver' && !hasGoldSupportDocs) {
    pushUnique(
      nextActions,
      'Add troubleshooting or known limitations section to README for Gold tier.'
    );
  }

  return {
    tier,
    blockers,
    nextActions,
  };
}
