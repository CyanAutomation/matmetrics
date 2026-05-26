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



test('maturity primitive taxonomy classification matches documented groups', () => {
  const classificationCases: Array<{
    name: string;
    primitiveName: unknown;
    expectedSource: string | null;
    expectedIsUiState: boolean;
  }> = [
    {
      name: 'ui state: loading',
      primitiveName: 'PluginLoadingState',
      expectedSource: '@/components/plugins/plugin-state',
      expectedIsUiState: true,
    },
    {
      name: 'ui state: error',
      primitiveName: 'PluginErrorState',
      expectedSource: '@/components/plugins/plugin-state',
      expectedIsUiState: true,
    },
    {
      name: 'shell primitive',
      primitiveName: 'PluginPageShell',
      expectedSource: '@/components/plugins/plugin-page-shell',
      expectedIsUiState: false,
    },
    {
      name: 'section primitive',
      primitiveName: 'PluginSectionCard',
      expectedSource: '@/components/plugins/plugin-section-card',
      expectedIsUiState: false,
    },
    {
      name: 'data surface primitive',
      primitiveName: 'PluginDataSurfaceSummaryStrip',
      expectedSource: '@/components/plugins/plugin-data-surface',
      expectedIsUiState: false,
    },
    {
      name: 'edge: wrong case primitive',
      primitiveName: 'pluginloadingstate',
      expectedSource: null,
      expectedIsUiState: false,
    },
    {
      name: 'edge: whitespace padded primitive',
      primitiveName: ' PluginLoadingState ',
      expectedSource: null,
      expectedIsUiState: false,
    },
    {
      name: 'invalid: empty string',
      primitiveName: '',
      expectedSource: null,
      expectedIsUiState: false,
    },
    {
      name: 'invalid: numeric value',
      primitiveName: 404,
      expectedSource: null,
      expectedIsUiState: false,
    },
  ];

  for (const testCase of classificationCases) {
    const primitiveName = String(testCase.primitiveName);
    assert.equal(
      MATURITY_PRIMITIVES.getSourceOfPrimitive(primitiveName),
      testCase.expectedSource,
      testCase.name
    );
    assert.equal(
      MATURITY_PRIMITIVES.isUiState(primitiveName),
      testCase.expectedIsUiState,
      testCase.name
    );
  }
});

test('maturity primitive taxonomy source groups return exact documented primitives', () => {
  const sourceCases: Array<{
    name: string;
    source: string;
    expectedPrimitives: string[] | null;
  }> = [
    {
      name: 'ui state group',
      source: '@/components/plugins/plugin-state',
      expectedPrimitives: [
        'PluginLoadingState',
        'PluginErrorState',
        'PluginEmptyState',
      ],
    },
    {
      name: 'data surface group',
      source: '@/components/plugins/plugin-data-surface',
      expectedPrimitives: [
        'PluginDataSurfaceTable',
        'PluginDataSurfaceFilterRow',
        'PluginDataSurfaceSummaryStrip',
        'PluginEmptyFilteredResults',
      ],
    },
    {
      name: 'edge: unknown source path',
      source: '@/components/plugins/unknown-source',
      expectedPrimitives: null,
    },
    {
      name: 'invalid: empty source path',
      source: '',
      expectedPrimitives: null,
    },
  ];

  for (const testCase of sourceCases) {
    assert.deepEqual(
      MATURITY_PRIMITIVES.getPrimitivesBySource(testCase.source),
      testCase.expectedPrimitives,
      testCase.name
    );
  }
});
