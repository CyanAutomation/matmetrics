import { readFile } from 'node:fs/promises';

import { normalizeHeading } from './scoring';
import { parseReadmeSections } from './maturity-readme';

export type OperabilityEvidence = {
  score: number;
  sections: string[];
  evidence: string[];
  reasons: string[];
  nextActions: string[];
};

export async function scoreOperabilityEvidence(
  readmePath: string,
  hasReadme: boolean,
  hasReviewMetadata: boolean
): Promise<OperabilityEvidence> {
  const result: OperabilityEvidence = {
    score: hasReviewMetadata ? 2 : 0,
    sections: [],
    evidence: [],
    reasons: [],
    nextActions: [],
  };

  if (!hasReadme) {
    result.reasons.push('Plugin README is missing.');
    result.nextActions.push(
      'Add a README for each plugin with usage and verification steps.'
    );
    return result;
  }

  result.sections = parseReadmeSections(await readFile(readmePath, 'utf8'));
  const normalized = result.sections.map(normalizeHeading);
  result.score += 4;
  result.evidence.push('Plugin README is present.');

  if (normalized.includes('usage')) {
    result.score += 2;
    result.evidence.push('Plugin README documents usage guidance.');
  } else {
    result.reasons.push('Plugin README is missing a Usage section.');
    result.nextActions.push(
      'Add a `## Usage` section to each plugin README with operator steps.'
    );
  }
  if (normalized.includes('verification')) {
    result.score += 2;
    result.evidence.push('Plugin README documents verification steps.');
  } else {
    result.reasons.push('Plugin README is missing a Verification section.');
    result.nextActions.push(
      'Add a `## Verification` section to each plugin README with exact test commands.'
    );
  }
  if (
    normalized.includes('troubleshooting') ||
    normalized.includes('known limitations and dependencies')
  ) {
    result.score += 2;
    result.evidence.push(
      'Plugin README includes operational support sections beyond baseline usage/verification.'
    );
  }
  return result;
}
