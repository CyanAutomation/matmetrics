import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { scorePluginMaturity } from '@/lib/plugins/maturity';

import { MATURITY_PRIMITIVES } from '@/lib/plugins/maturity-config';
import { determineTier } from '@/lib/plugins/scoring/determine-tier';
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

  return scorePluginMaturity({
    manifest: validation.manifest,
    validationIssues: [...validation.issues, ...extraValidationIssues],
    pluginDirectoryName,
    pluginsRoot,
  });
};

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
    message:
      'Synthetic fixture warning: plugin requires undeclared capability.',
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

test('tier determination honors Silver and Gold score boundaries', () => {
  const categoryScores = {
    contract_metadata: 20,
    runtime_integration: 20,
    feature_quality: 25,
    test_coverage: 20,
    operability_docs: 15,
  };
  const cases = [
    {
      name: 'immediately below Silver',
      score: MATURITY_THRESHOLDS.silverMin - 1,
      expectedTier: 'bronze',
    },
    {
      name: 'at Silver',
      score: MATURITY_THRESHOLDS.silverMin,
      expectedTier: 'silver',
    },
    {
      name: 'immediately above Silver',
      score: MATURITY_THRESHOLDS.silverMin + 1,
      expectedTier: 'silver',
    },
    {
      name: 'immediately below Gold',
      score: MATURITY_THRESHOLDS.goldMin - 1,
      expectedTier: 'silver',
    },
    {
      name: 'at Gold',
      score: MATURITY_THRESHOLDS.goldMin,
      expectedTier: 'gold',
    },
    {
      name: 'immediately above Gold',
      score: MATURITY_THRESHOLDS.goldMin + 1,
      expectedTier: 'gold',
    },
  ] as const;

  for (const testCase of cases) {
    const result = determineTier({
      totalScore: testCase.score,
      categoryScores,
      hasValidationErrors: false,
      hasBlockingWarnings: false,
      hasAnyTestEvidence: true,
      hasReadme: true,
      hasExplicitTestEvidence: true,
      allRelevantUxCriteriaExplicitlyVerified: true,
      hasGoldSupportDocs: true,
      isExplicitGoldReview: true,
      validationIssues: [],
      blockingWarnings: [],
    });

    assert.equal(result.tier, testCase.expectedTier, testCase.name);
  }
});

test('maturity primitive taxonomy classification matches documented groups', () => {
  const primitiveCases: Array<{
    name: string;
    primitiveName: unknown;
    expectedSource: string | null;
    expectedIsUiState: boolean;
    expectedSourcePrimitives?: string[] | null;
  }> = [
    {
      name: 'ui state: loading',
      primitiveName: 'PluginLoadingState',
      expectedSource: '@/components/plugins/plugin-state',
      expectedIsUiState: true,
      expectedSourcePrimitives: [
        'PluginLoadingState',
        'PluginErrorState',
        'PluginEmptyState',
      ],
    },
    {
      name: 'ui state: error',
      primitiveName: 'PluginErrorState',
      expectedSource: '@/components/plugins/plugin-state',
      expectedIsUiState: true,
      expectedSourcePrimitives: [
        'PluginLoadingState',
        'PluginErrorState',
        'PluginEmptyState',
      ],
    },
    {
      name: 'shell primitive',
      primitiveName: 'PluginPageShell',
      expectedSource: '@/components/plugins/plugin-page-shell',
      expectedIsUiState: false,
      expectedSourcePrimitives: ['PluginPageShell'],
    },
    {
      name: 'section primitive',
      primitiveName: 'PluginSectionCard',
      expectedSource: '@/components/plugins/plugin-section-card',
      expectedIsUiState: false,
      expectedSourcePrimitives: ['PluginSectionCard'],
    },
    {
      name: 'data surface primitive',
      primitiveName: 'PluginDataSurfaceSummaryStrip',
      expectedSource: '@/components/plugins/plugin-data-surface',
      expectedIsUiState: false,
      expectedSourcePrimitives: [
        'PluginDataSurfaceTable',
        'PluginDataSurfaceFilterRow',
        'PluginDataSurfaceSummaryStrip',
        'PluginEmptyFilteredResults',
      ],
    },
    {
      name: 'edge: wrong case primitive',
      primitiveName: 'pluginloadingstate',
      expectedSource: null,
      expectedIsUiState: false,
      expectedSourcePrimitives: null,
    },
    {
      name: 'edge: whitespace padded primitive',
      primitiveName: ' PluginLoadingState ',
      expectedSource: null,
      expectedIsUiState: false,
      expectedSourcePrimitives: null,
    },
    {
      name: 'invalid: empty string',
      primitiveName: '',
      expectedSource: null,
      expectedIsUiState: false,
      expectedSourcePrimitives: null,
    },
    {
      name: 'invalid: numeric value',
      primitiveName: 404,
      expectedSource: null,
      expectedIsUiState: false,
      expectedSourcePrimitives: null,
    },
  ];

  for (const testCase of primitiveCases) {
    const primitiveName = String(testCase.primitiveName);
    const source = MATURITY_PRIMITIVES.getSourceOfPrimitive(primitiveName);

    assert.equal(source, testCase.expectedSource, testCase.name);
    assert.equal(
      MATURITY_PRIMITIVES.isUiState(primitiveName),
      testCase.expectedIsUiState,
      testCase.name
    );

    if ('expectedSourcePrimitives' in testCase) {
      assert.deepEqual(
        source === null
          ? null
          : MATURITY_PRIMITIVES.getPrimitivesBySource(source),
        testCase.expectedSourcePrimitives,
        `${testCase.name}: source primitive roundtrip`
      );
    }
  }
  assert.equal(
    MATURITY_PRIMITIVES.getSourceOfPrimitive('UnknownPrimitive'),
    null,
    'unknown primitive should not map to a source'
  );
  assert.equal(
    MATURITY_PRIMITIVES.isUiState('UnknownPrimitive'),
    false,
    'unknown primitive should not be treated as ui state'
  );
  assert.deepEqual(
    MATURITY_PRIMITIVES.getPrimitivesBySource(
      '@/components/plugins/unknown-source'
    ),
    null,
    'unknown source path should return null'
  );
  assert.deepEqual(
    MATURITY_PRIMITIVES.getPrimitivesBySource(''),
    null,
    'empty source path should return null'
  );
});
