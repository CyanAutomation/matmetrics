/**
 * Contract & Metadata Scoring
 *
 * Evaluates the completeness and correctness of the plugin manifest.
 * - Schema validation (required)
 * - Explicit enabled/disabled flag
 * - Capability declarations
 * - Maturity metadata (tier, notes, review date)
 * - Evidence mapping for tests and UX criteria
 */

import type { PluginManifest } from '@/lib/plugins/types';
import type { CategoryScoringResult } from './types';

const pushUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) {
    values.push(value);
  }
};

export async function scoreContractMetadata(
  manifest: PluginManifest
): Promise<CategoryScoringResult> {
  let score = 0;
  const evidence: string[] = [];
  const reasons: string[] = [];
  const nextActions: string[] = [];
  const blockers: string[] = [];

  // Base score: manifest passes schema validation (always true if we got this far)
  score += 8;
  pushUnique(evidence, 'Manifest passes required schema validation.');

  // Check for explicit enabled/disabled flag
  if (manifest.enabled === true || manifest.enabled === false) {
    score += 2;
  }

  // Check for capability declarations
  if ((manifest.capabilities ?? []).length > 0) {
    score += 2;
    pushUnique(evidence, 'Manifest declares explicit capabilities.');
  }

  // Check for maturity metadata (tier, notes, review date)
  if (
    manifest.maturity?.tier &&
    manifest.maturity.notes &&
    manifest.maturity.lastReviewedAt
  ) {
    score += 2;
    pushUnique(
      evidence,
      'Manifest includes maturity metadata and review notes.'
    );
  } else {
    pushUnique(
      reasons,
      'Manifest is missing complete maturity review metadata.'
    );
    pushUnique(
      nextActions,
      'Add `maturity.tier`, `maturity.notes`, and `maturity.lastReviewedAt`.'
    );
  }

  // Check for explicit evidence mapping
  if (manifest.maturity?.evidence) {
    score += 2;
    pushUnique(
      evidence,
      'Manifest includes explicit maturity evidence for tests and verified UX criteria.'
    );
  }

  // Clamp score to category maximum (20)
  score = Math.max(0, Math.min(20, score));

  return {
    score,
    evidence,
    reasons,
    nextActions,
    blockers,
  };
}
