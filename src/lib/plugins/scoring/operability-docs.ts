/**
 * Operability & Docs Scoring
 *
 * Evaluates the quality and completeness of plugin documentation:
 * - README presence and content
 * - Usage documentation
 * - Verification/testing steps
 * - Troubleshooting and support docs
 * - Maturity review notes
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { PluginManifest } from '@/lib/plugins/types';
import type { CategoryScoringResult } from './types';
import { pushUnique, fileExists, normalizeHeading } from './utils';

const parseReadmeSections = (contents: string): string[] => {
  const headings = new Set<string>();
  for (const match of contents.matchAll(/^##\s+(.+)$/gm)) {
    const heading = match[1]?.trim();
    if (heading) {
      headings.add(heading);
    }
  }
  return [...headings];
};

export async function scoreOperabilityDocs(
  manifest: PluginManifest,
  pluginDirectoryName: string | undefined,
  pluginsRoot: string
): Promise<CategoryScoringResult> {
  let score = 0;
  const evidence: string[] = [];
  const reasons: string[] = [];
  const nextActions: string[] = [];
  const blockers: string[] = [];

  const pluginDir = path.join(pluginsRoot, pluginDirectoryName ?? manifest.id);
  const pluginReadmePath = path.join(pluginDir, 'README.md');

  // Check for README
  if (await fileExists(pluginReadmePath)) {
    score += 4;
    pushUnique(evidence, 'Plugin README is present.');

    const readmeContents = await readFile(pluginReadmePath, 'utf8');
    const detectedReadmeSections = parseReadmeSections(readmeContents);
    const normalizedReadmeSections =
      detectedReadmeSections.map(normalizeHeading);

    // Check for Usage section (2 points)
    if (normalizedReadmeSections.includes('usage')) {
      score += 2;
      pushUnique(evidence, 'Plugin README documents usage guidance.');
    } else {
      pushUnique(reasons, 'Plugin README is missing a Usage section.');
      pushUnique(
        nextActions,
        'Add a `## Usage` section to each plugin README with operator steps.'
      );
    }

    // Check for Verification section (2 points)
    if (normalizedReadmeSections.includes('verification')) {
      score += 2;
      pushUnique(evidence, 'Plugin README documents verification steps.');
    } else {
      pushUnique(reasons, 'Plugin README is missing a Verification section.');
      pushUnique(
        nextActions,
        'Add a `## Verification` section to each plugin README with exact test commands.'
      );
    }

    // Check for advanced support sections (2 points)
    if (
      normalizedReadmeSections.includes('troubleshooting') ||
      normalizedReadmeSections.includes('known limitations and dependencies')
    ) {
      score += 2;
      pushUnique(
        evidence,
        'Plugin README includes operational support sections beyond baseline usage/verification.'
      );
    }
  } else {
    pushUnique(reasons, 'Plugin README is missing.');
    pushUnique(
      nextActions,
      'Add a README for each plugin with usage and verification steps.'
    );
  }

  // Check for maturity review notes (2 points)
  if (manifest.maturity?.notes && manifest.maturity.lastReviewedAt) {
    score += 2;
  }

  // Clamp score to category maximum (15)
  score = Math.max(0, Math.min(15, score));

  return {
    score,
    evidence,
    reasons,
    nextActions,
    blockers,
  };
}
