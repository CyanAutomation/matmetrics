import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  PluginManifest,
  PluginMaturityCategory,
  PluginMaturityScorecard,
  PluginValidationIssue,
} from '@/lib/plugins/types';
import {
  scoreContractMetadata,
  scoreRuntimeIntegration,
  scoreFeatureQuality,
  scoreTestCoverage,
  scoreOperabilityDocs,
  determineTier,
  pushUnique,
  fileExists,
  componentIdToComponentBasename,
  getManifestComponentIds,
  mergeCategoryScore,
  mergeCategoryScoringResults,
  extractRegisteredPluginComponents,
  normalizeHeading,
} from '@/lib/plugins/scoring';
import {
  MATURITY_CATEGORY_LABELS,
  MATURITY_CATEGORY_MAXIMUMS,
} from './maturity-scorecard-config';
import { parseReadmeSections } from './maturity-readme';
import { verifyMaturityUxCriteria } from './maturity-ux-verification';
import { discoverMaturityTestEvidence } from './maturity-test-evidence';
import {
  normalizeMaturityCategoryScores,
  totalMaturityScore,
} from './maturity-scorecard';

type ScorePluginMaturityOptions = {
  manifest: PluginManifest;
  validationIssues: PluginValidationIssue[];
  pluginDirectoryName?: string;
  pluginsRoot?: string;
  autoDisabledWithWarnings?: string[];
};

type CategoryAccumulator = Record<PluginMaturityCategory, number>;

const toRepoRelativePath = (repoRoot: string, filePath: string): string =>
  path.relative(repoRoot, filePath).split(path.sep).join('/');

/** Scores a plugin's maturity across contract, runtime, features, tests, and docs. */
export const scorePluginMaturity = async ({
  manifest,
  validationIssues,
  pluginDirectoryName,
  pluginsRoot = path.join(process.cwd(), 'plugins'),
  autoDisabledWithWarnings = [],
}: ScorePluginMaturityOptions): Promise<PluginMaturityScorecard> => {
  const categoryScores: CategoryAccumulator = {
    contract_metadata: 0,
    runtime_integration: 0,
    feature_quality: 0,
    test_coverage: 0,
    operability_docs: 0,
  };

  const evidence: string[] = [];
  const reasons: string[] = [];
  const nextActions: string[] = [];

  const pluginDir = path.join(pluginsRoot, pluginDirectoryName ?? manifest.id);
  const repoRoot = path.dirname(pluginsRoot);
  const pluginReadmePath = path.join(pluginDir, 'README.md');
  const pluginEntryPath = path.join(pluginDir, 'src', 'index.ts');
  const componentIds = getManifestComponentIds(manifest);
  const componentBasenames = componentIds.map(componentIdToComponentBasename);
  const unresolvedRuntimeComponentWarnings = validationIssues.filter(
    (issue) =>
      issue.severity === 'warning' &&
      issue.path.includes('.config.component') &&
      issue.message.includes('no dashboard renderer is registered')
  );

  // Collect shared discovery data before running independent category scorers.
  const pluginEntryExists = await fileExists(pluginEntryPath);
  const registeredPluginComponents = pluginEntryExists
    ? extractRegisteredPluginComponents(await readFile(pluginEntryPath, 'utf8'))
    : [];

  // Call the independent filesystem/manifest scorers in parallel. Test
  // coverage is intentionally evaluated below after evidence discovery.
  const [
    contractMetadataResult,
    runtimeIntegrationResult,
    featureQualityResult,
    operabilityDocsResult,
  ] = await Promise.all([
    scoreContractMetadata(manifest),
    scoreRuntimeIntegration(
      manifest,
      validationIssues,
      pluginDirectoryName,
      pluginsRoot,
      autoDisabledWithWarnings
    ),
    scoreFeatureQuality(
      manifest,
      pluginDirectoryName,
      pluginsRoot,
      registeredPluginComponents
    ),
    scoreOperabilityDocs(manifest, pluginDirectoryName, pluginsRoot),
  ]);

  const categoryResults = [
    contractMetadataResult,
    runtimeIntegrationResult,
    featureQualityResult,
    operabilityDocsResult,
  ];
  mergeCategoryScore(
    categoryScores,
    'contract_metadata',
    contractMetadataResult
  );
  mergeCategoryScore(
    categoryScores,
    'runtime_integration',
    runtimeIntegrationResult
  );
  mergeCategoryScore(categoryScores, 'feature_quality', featureQualityResult);
  mergeCategoryScore(categoryScores, 'operability_docs', operabilityDocsResult);
  mergeCategoryScoringResults(
    categoryResults,
    categoryScores,
    evidence,
    reasons,
    nextActions
  );

  const { testEvidenceFiles, testEvidenceSource, missingExplicitTestFiles } =
    await discoverMaturityTestEvidence({
      repoRoot,
      manifest,
      componentBasenames,
      componentIds,
    });
  // Score test coverage using the new scorer
  const testCoverageResultFinal = await scoreTestCoverage({
    testEvidenceFiles,
    testEvidenceSource,
    missingExplicitTestFiles,
    manifest,
    pluginId: manifest.id,
  });

  categoryScores.test_coverage = testCoverageResultFinal.score;
  for (const item of testCoverageResultFinal.evidence) {
    pushUnique(evidence, item);
  }
  for (const item of testCoverageResultFinal.reasons) {
    pushUnique(reasons, item);
  }
  for (const item of testCoverageResultFinal.nextActions) {
    pushUnique(nextActions, item);
  }

  const uxVerification = await verifyMaturityUxCriteria({
    repoRoot,
    manifest,
    testEvidenceFiles,
    runtimeAssertionsSatisfied:
      componentIds.length > 0 &&
      componentBasenames.length > 0 &&
      testEvidenceFiles.length > 0 &&
      unresolvedRuntimeComponentWarnings.length === 0,
  });
  categoryScores.feature_quality += uxVerification.categoryScoreDelta;
  for (const item of uxVerification.evidence) pushUnique(evidence, item);
  for (const item of uxVerification.reasons) pushUnique(reasons, item);
  for (const item of uxVerification.nextActions) pushUnique(nextActions, item);
  const criteriaDetails = uxVerification.criteriaDetails;

  if (
    testEvidenceFiles.some((filePath) =>
      filePath.includes(path.join('src', 'tests'))
    ) ||
    testEvidenceFiles.some((filePath) =>
      filePath.includes(path.join('src', 'lib', 'plugins'))
    )
  ) {
    categoryScores.test_coverage += 4;
  }
  if (
    testEvidenceFiles.some((filePath) =>
      filePath.includes(path.join('plugins', manifest.id))
    ) ||
    testEvidenceFiles.some((filePath) =>
      filePath.includes(path.join('src', 'components'))
    )
  ) {
    categoryScores.test_coverage += 4;
  }

  // Documentation scoring is already performed by scoreOperabilityDocs above.
  // Reusing its result avoids scoring the same README twice and keeps the
  // coordinator responsible only for assembling the final scorecard.
  const detectedReadmeSections = pluginReadmePath
    ? await (async () => {
        if (!(await fileExists(pluginReadmePath))) return [];
        return parseReadmeSections(await readFile(pluginReadmePath, 'utf8'));
      })()
    : [];

  const normalizedCategoryScores = normalizeMaturityCategoryScores(
    categoryScores,
    MATURITY_CATEGORY_LABELS,
    MATURITY_CATEGORY_MAXIMUMS
  );
  const totalScore = totalMaturityScore(normalizedCategoryScores);

  const hasValidationErrors = validationIssues.some(
    (issue) => issue.severity === 'error'
  );

  // Compute blockingWarnings for tier determination
  const blockingWarnings = [
    ...validationIssues
      .filter((issue) => issue.severity === 'warning')
      .map((issue) => issue.message),
    ...autoDisabledWithWarnings,
  ];

  const hasBlockingWarnings =
    blockingWarnings.length > 0 ||
    validationIssues.some(
      (issue) =>
        issue.severity === 'warning' &&
        (issue.message.includes('requires capability') ||
          issue.message.includes('requires matmetrics version'))
    );
  const hasAnyTestEvidence = testEvidenceFiles.length > 0;
  const hasReadme = await fileExists(pluginReadmePath);
  const isExplicitGoldReview = manifest.maturity?.tier === 'gold';
  const allRelevantUxCriteriaExplicitlyVerified = Object.values(criteriaDetails)
    .filter((criterion) => criterion.relevant)
    .every(
      (criterion) => criterion.verified && criterion.source === 'explicit'
    );
  const hasExplicitTestEvidence = testEvidenceSource === 'explicit';
  const normalizedReadmeSections = detectedReadmeSections.map(normalizeHeading);
  const hasGoldSupportDocs =
    normalizedReadmeSections.includes('troubleshooting') ||
    normalizedReadmeSections.includes('known limitations and dependencies');

  const tierResult = determineTier({
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
    validationIssues: validationIssues
      .filter(
        (issue) => issue.severity === 'error' || issue.severity === 'warning'
      )
      .map((issue) => ({
        severity: issue.severity as 'error' | 'warning',
        message: issue.message,
      })),
    blockingWarnings,
  });

  const tier = tierResult.tier;

  // Merge tier determination blockers and next actions
  for (const item of tierResult.nextActions) {
    pushUnique(nextActions, item);
    // Also add Gold requirement messages to reasons for user explanation
    if (item.includes('Gold requires')) {
      pushUnique(reasons, item);
    }
  }
  for (const item of tierResult.blockers) {
    pushUnique(reasons, item);
  }

  if (
    totalScore >= 85 &&
    isExplicitGoldReview &&
    !tierResult.nextActions.some((action) =>
      action.includes('runtime integration')
    )
  ) {
    pushUnique(
      reasons,
      'Gold requires a higher runtime integration floor than Silver.'
    );
  }
  if (
    totalScore >= 85 &&
    isExplicitGoldReview &&
    !tierResult.nextActions.some((action) => action.includes('feature quality'))
  ) {
    pushUnique(
      reasons,
      'Gold requires a higher feature quality floor than Silver.'
    );
  }
  if (
    totalScore >= 85 &&
    isExplicitGoldReview &&
    !tierResult.nextActions.some((action) => action.includes('operability'))
  ) {
    pushUnique(
      reasons,
      'Gold requires stronger operability documentation than Silver.'
    );
  }
  if (totalScore >= 85 && isExplicitGoldReview && !hasGoldSupportDocs) {
    pushUnique(
      reasons,
      'Gold requires an operational support section such as Troubleshooting or Known Limitations and Dependencies.'
    );
    pushUnique(
      nextActions,
      'Add `## Troubleshooting` or `## Known Limitations and Dependencies` to the plugin README before Gold promotion.'
    );
  }

  return {
    score: totalScore,
    tier,
    categoryScores: normalizedCategoryScores,
    reasons: reasons.slice(0, 5),
    nextActions: nextActions.slice(0, 5),
    evidence: evidence.slice(0, 5),
    verificationDetails: {
      testEvidenceSource,
      testEvidenceFiles: testEvidenceFiles.map((filePath) =>
        toRepoRelativePath(repoRoot, filePath)
      ),
      readmeSections: detectedReadmeSections,
      uxCriteria: criteriaDetails,
    },
    declaredTier: manifest.maturity?.tier,
  };
};
