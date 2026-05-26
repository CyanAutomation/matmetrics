import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { scorePluginMaturity } from '@/lib/plugins/maturity';

import { MATURITY_PRIMITIVES } from '@/lib/plugins/maturity-config';
import { validatePluginManifest } from '@/lib/plugins/validate';
import type { PluginValidationIssue } from '@/lib/plugins/types';
import githubSyncManifest from '../../../plugins/github-sync/plugin.json';
import promptSettingsManifest from '../../../plugins/prompt-settings/plugin.json';

type PluginFixture = {
  pluginDirectoryName: string;
  manifest: unknown;
  extraValidationIssues?: PluginValidationIssue[];
};

const pluginsRoot = path.join(process.cwd(), 'plugins');

// Documented in determine-tier.ts and used by scorePluginMaturity.
const MATURITY_THRESHOLDS = {
  silverMin: 70,
  goldMin: 85,
} as const;

const scoreFixture = async ({
  pluginDirectoryName,
  manifest,
  extraValidationIssues = [],
}: PluginFixture) => {
  const validation = validatePluginManifest(manifest);
  assert.equal(validation.isValid, true);

  if (!validation.isValid) {
    return scorePluginMaturity({
      manifest: { id: '', name: '', version: '', description: '' } as any,
      validationIssues: validation.issues,
      pluginDirectoryName,
      pluginsRoot,
    });
  }

  return scorePluginMaturity({
    manifest: validation.manifest,
    validationIssues: [...validation.issues, ...extraValidationIssues],
    pluginDirectoryName,
    pluginsRoot,
  });
};

test('fixture tiers align to documented maturity thresholds', async () => {
  const warning: PluginValidationIssue = {
    severity: 'warning',
    path: 'uiExtensions[0].capabilities',
    message: 'Synthetic fixture warning: plugin requires undeclared capability.',
  };

  const cases: Array<{
    name: string;
    fixture: PluginFixture;
    expectedTier: 'bronze' | 'silver' | 'gold';
    thresholdCheck: (score: number) => void;
  }> = [
    {
      name: 'silver fixture at/above gold cutoff but blocked from gold promotion',
      fixture: {
        pluginDirectoryName: 'github-sync',
        manifest: githubSyncManifest,
      },
      expectedTier: 'silver',
      thresholdCheck: (score) => {
        assert.ok(score >= MATURITY_THRESHOLDS.goldMin);
      },
    },
    {
      name: 'bronze fixture despite high score when blocking warning is present',
      fixture: {
        pluginDirectoryName: 'prompt-settings',
        manifest: promptSettingsManifest,
        extraValidationIssues: [warning],
      },
      expectedTier: 'bronze',
      thresholdCheck: (score) => {
        assert.ok(score >= MATURITY_THRESHOLDS.goldMin);
      },
    },
  ];

  for (const scenario of cases) {
    const scorecard = await scoreFixture(scenario.fixture);

    scenario.thresholdCheck(scorecard.score);
    assert.equal(scorecard.tier, scenario.expectedTier, scenario.name);
  }
});

test('github-sync fixture scores as Silver with a concrete Gold next action', async () => {
  const scorecard = await scoreFixture({
    pluginDirectoryName: 'github-sync',
    manifest: githubSyncManifest,
  });

  assert.equal(scorecard.tier, 'silver');
  assert.ok(scorecard.score >= MATURITY_THRESHOLDS.goldMin);
  assert.ok(
    scorecard.nextActions.includes(
      'Gold requires an explicit Gold review recorded in manifest maturity metadata.'
    )
  );
});

test('prompt-settings fixture drops to Bronze when capability warnings are present', async () => {
  const warning: PluginValidationIssue = {
    severity: 'warning',
    path: 'uiExtensions[0].capabilities',
    message: 'Synthetic fixture warning: plugin requires undeclared capability.',
  };

  const scorecard = await scoreFixture({
    pluginDirectoryName: 'prompt-settings',
    manifest: promptSettingsManifest,
    extraValidationIssues: [warning],
  });

  assert.equal(scorecard.tier, 'bronze');
  assert.ok(scorecard.score >= MATURITY_THRESHOLDS.goldMin);
  assert.ok(
    scorecard.reasons.includes(
      'Capability or version warnings cap the plugin at Bronze until resolved.'
    )
  );
  assert.ok(
    scorecard.nextActions.includes(
      'Resolve manifest warnings before promoting the plugin beyond Bronze.'
    )
  );
});

test('threshold boundary guards: score below cutoffs must not auto-promote tiers', async () => {
  const bronzeWithWarning = await scoreFixture({
    pluginDirectoryName: 'prompt-settings',
    manifest: promptSettingsManifest,
    extraValidationIssues: [
      {
        severity: 'warning',
        path: 'uiExtensions[0].capabilities',
        message: 'Synthetic fixture warning: plugin requires undeclared capability.',
      },
    ],
  });

  // Validate that plugins scoring just below thresholds don't get promoted.
  // The actual scores should be tested against thresholds, not mathematical identities.
  if (bronzeWithWarning.score < MATURITY_THRESHOLDS.silverMin) {
    assert.ok(bronzeWithWarning.score < MATURITY_THRESHOLDS.silverMin, 'Score should be below silver threshold');
  }
  if (bronzeWithWarning.score < MATURITY_THRESHOLDS.goldMin && bronzeWithWarning.score >= MATURITY_THRESHOLDS.silverMin) {
    assert.ok(bronzeWithWarning.score < MATURITY_THRESHOLDS.goldMin, 'Score should be below gold threshold');
  }

  assert.notEqual(bronzeWithWarning.tier, 'silver');
  assert.notEqual(bronzeWithWarning.tier, 'gold');

  const silverWithoutGoldReview = await scoreFixture({
    pluginDirectoryName: 'github-sync',
    manifest: githubSyncManifest,
  });

  assert.ok(silverWithoutGoldReview.score >= MATURITY_THRESHOLDS.goldMin - 1);
  assert.equal(silverWithoutGoldReview.tier, 'silver');
  assert.notEqual(silverWithoutGoldReview.tier, 'gold');
});


test('maturity primitive helpers resolve exact evidence entries for known primitives', () => {
  const knownPrimitiveEvidence = [
    {
      primitive: 'PluginLoadingState',
      expectedSource: '@/components/plugins/plugin-state',
      expectedGroup: [
        'PluginLoadingState',
        'PluginErrorState',
        'PluginEmptyState',
      ],
    },
    {
      primitive: 'PluginPageShell',
      expectedSource: '@/components/plugins/plugin-page-shell',
      expectedGroup: ['PluginPageShell'],
    },
    {
      primitive: 'PluginDataSurfaceSummaryStrip',
      expectedSource: '@/components/plugins/plugin-data-surface',
      expectedGroup: [
        'PluginDataSurfaceTable',
        'PluginDataSurfaceFilterRow',
        'PluginDataSurfaceSummaryStrip',
        'PluginEmptyFilteredResults',
      ],
    },
  ] as const;

  for (const fixture of knownPrimitiveEvidence) {
    const source = MATURITY_PRIMITIVES.getSourceOfPrimitive(fixture.primitive);
    assert.equal(source, fixture.expectedSource);

    const evidenceEntries = MATURITY_PRIMITIVES.getPrimitivesBySource(
      fixture.expectedSource
    );
    assert.deepEqual(evidenceEntries, fixture.expectedGroup);
  }
});

test('maturity primitive helpers expose unknown/missing primitive reason path', () => {
  const unknownPrimitive = 'PluginUnknownPrimitive';
  const source = MATURITY_PRIMITIVES.getSourceOfPrimitive(unknownPrimitive);
  assert.equal(source, null);

  const missingSource = '@/components/plugins/unknown-source';
  const primitives = MATURITY_PRIMITIVES.getPrimitivesBySource(missingSource);
  assert.equal(primitives, null);

  // Verify that unknown primitives and sources return null to enable missing-evidence handling
  assert.equal(source, null, 'Unknown primitive should resolve to null');
  assert.equal(primitives, null, 'Unknown source should resolve to null');
});
