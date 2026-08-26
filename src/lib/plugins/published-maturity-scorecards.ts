import publishedScorecards from '../../../docs/plugin-maturity-scorecards.json';

import type {
  PluginManifest,
  PluginMaturityScorecard,
  PluginMaturityTier,
} from '@/lib/plugins/types';
import {
  MATURITY_CATEGORY_LABELS,
  parseMaturityTier,
} from './maturity-scorecard-config';

type PublishedScorecard = {
  id: string;
  score: number;
  tier: string;
  declaredTier?: string;
};

/**
 * Returns the build-generated maturity summary used by the interactive plugin
 * list. Full maturity scoring walks source and test files, so it deliberately
 * remains a CI/build concern rather than work performed on every page load.
 */
export const getPublishedPluginMaturity = (
  manifest: PluginManifest
): PluginMaturityScorecard => {
  const published = (publishedScorecards.plugins as PublishedScorecard[]).find(
    (entry) => entry.id === manifest.id
  );

  const tier = published
    ? parseMaturityTier(published.tier)
    : (manifest.maturity?.tier ?? 'bronze');
  const declaredTier = published?.declaredTier
    ? parseMaturityTier(published.declaredTier)
    : manifest.maturity?.tier;
  const evidenceFiles = manifest.maturity?.evidence?.testFiles ?? [];

  return {
    score: published?.score ?? 0,
    tier,
    declaredTier,
    categoryScores: Object.fromEntries(
      Object.entries(MATURITY_CATEGORY_LABELS).map(([key, label]) => [
        key,
        { label, earned: 0, possible: 0 },
      ])
    ) as PluginMaturityScorecard['categoryScores'],
    reasons: [],
    nextActions: [],
    evidence: [
      published
        ? `Published maturity review${manifest.maturity?.lastReviewedAt ? ` from ${manifest.maturity.lastReviewedAt}` : ''}.`
        : 'No published maturity review is available for this plugin.',
    ],
    verificationDetails: {
      testEvidenceSource: evidenceFiles.length > 0 ? 'explicit' : 'none',
      testEvidenceFiles: evidenceFiles,
      readmeSections: [],
      uxCriteria: {
        loadingStatePresent: {
          label: 'loading state present',
          relevant: manifest.maturity?.uxCriteria?.loadingStatePresent === true,
          declared: manifest.maturity?.uxCriteria?.loadingStatePresent === true,
          verified: evidenceFiles.length > 0,
          source: evidenceFiles.length > 0 ? 'explicit' : 'none',
          files:
            manifest.maturity?.evidence?.uxCriteria?.loadingStatePresent ?? [],
        },
        errorStateWithRecovery: {
          label: 'error state present with recovery',
          relevant:
            manifest.maturity?.uxCriteria?.errorStateWithRecovery === true,
          declared:
            manifest.maturity?.uxCriteria?.errorStateWithRecovery === true,
          verified: evidenceFiles.length > 0,
          source: evidenceFiles.length > 0 ? 'explicit' : 'none',
          files:
            manifest.maturity?.evidence?.uxCriteria?.errorStateWithRecovery ??
            [],
        },
        emptyStateWithCta: {
          label: 'empty state with CTA',
          relevant: manifest.maturity?.uxCriteria?.emptyStateWithCta === true,
          declared: manifest.maturity?.uxCriteria?.emptyStateWithCta === true,
          verified: evidenceFiles.length > 0,
          source: evidenceFiles.length > 0 ? 'explicit' : 'none',
          files:
            manifest.maturity?.evidence?.uxCriteria?.emptyStateWithCta ?? [],
        },
        destructiveActionSafety: {
          label: 'destructive action confirmation + cancellation path',
          relevant:
            manifest.maturity?.uxCriteria?.destructiveActionSafety?.relevant ===
            true,
          declared:
            manifest.maturity?.uxCriteria?.destructiveActionSafety
              ?.confirmation === true &&
            manifest.maturity?.uxCriteria?.destructiveActionSafety
              ?.cancellation === true,
          verified: evidenceFiles.length > 0,
          source: evidenceFiles.length > 0 ? 'explicit' : 'none',
          files:
            manifest.maturity?.evidence?.uxCriteria?.destructiveActionSafety ??
            [],
        },
      },
    },
  };
};
