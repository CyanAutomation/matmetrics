/**
 * Test Coverage Scoring
 *
 * Evaluates the presence and quality of automated tests:
 * - Test files exist (heuristic or explicit)
 * - Explicit evidence mapping in manifest
 * - Test coverage quality indicators
 */

import type { PluginManifest } from '@/lib/plugins/types';
import type { CategoryScoringResult } from './types';

const pushUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) {
    values.push(value);
  }
};

export interface TestCoverageInput {
  testEvidenceFiles: string[];
  testEvidenceSource: 'explicit' | 'heuristic' | 'none';
  missingExplicitTestFiles: string[];
  manifest: PluginManifest;
  pluginId: string;
}

export async function scoreTestCoverage(
  input: TestCoverageInput
): Promise<CategoryScoringResult> {
  const {
    testEvidenceFiles,
    testEvidenceSource,
    missingExplicitTestFiles,
    manifest,
    pluginId,
  } = input;

  let score = 0;
  const evidence: string[] = [];
  const reasons: string[] = [];
  const nextActions: string[] = [];
  const blockers: string[] = [];

  // Score: Test evidence exists (12 points)
  if (testEvidenceFiles.length > 0) {
    score += 12;
    pushUnique(
      evidence,
      `Found automated test evidence in ${testEvidenceFiles.length} file(s).`
    );

    // Bonus: Explicit evidence mapping (4 points)
    if (testEvidenceSource === 'explicit') {
      score += 4;
      pushUnique(
        evidence,
        'Manifest explicitly maps plugin maturity checks to test evidence files.'
      );
    }
  } else {
    pushUnique(
      reasons,
      'No plugin-specific automated test evidence was found.'
    );
    pushUnique(
      nextActions,
      'Add plugin-specific tests for manifest, runtime wiring, and primary feature behavior.'
    );
  }

  // Check for missing explicit test files
  if (missingExplicitTestFiles.length > 0) {
    pushUnique(
      reasons,
      'Some explicit maturity evidence test files declared in manifest could not be found.'
    );
    pushUnique(
      nextActions,
      'Update `maturity.evidence.testFiles` so every declared path exists in the repo.'
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
