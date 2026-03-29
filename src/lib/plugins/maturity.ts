import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  PluginManifest,
  PluginMaturityCategory,
  PluginMaturityCategoryScore,
  PluginMaturityScorecard,
  PluginMaturityTier,
  PluginValidationIssue,
} from '@/lib/plugins/types';

type ScorePluginMaturityOptions = {
  manifest: PluginManifest;
  validationIssues: PluginValidationIssue[];
  pluginDirectoryName?: string;
  pluginsRoot?: string;
  autoDisabledWithWarnings?: string[];
};

type CategoryAccumulator = Record<PluginMaturityCategory, number>;

const categoryLabels: Record<PluginMaturityCategory, string> = {
  contract_metadata: 'Contract & Metadata',
  runtime_integration: 'Runtime Integration',
  feature_quality: 'Feature Quality',
  test_coverage: 'Test Coverage',
  operability_docs: 'Operability & Docs',
};

const categoryMaximums: Record<PluginMaturityCategory, number> = {
  contract_metadata: 20,
  runtime_integration: 20,
  feature_quality: 25,
  test_coverage: 20,
  operability_docs: 15,
};

const componentIdToComponentBasename = (componentId: string): string =>
  componentId.trim().toLowerCase().replace(/_/g, '-');

const toComponentFileName = (componentId: string): string =>
  `${componentIdToComponentBasename(componentId)}.tsx`;

const pluginComponentRegistrationPattern =
  /\.?registerPluginComponent(?:\?\.)?\s*\(\s*['"]([^'"]+)['"]\s*,/g;

const extractRegisteredPluginComponents = (entryContents: string): string[] => {
  const componentIds = new Set<string>();

  for (const match of entryContents.matchAll(
    pluginComponentRegistrationPattern
  )) {
    const maybeComponentId = match[1]?.trim();
    if (maybeComponentId) {
      componentIds.add(maybeComponentId);
    }
  }

  return [...componentIds];
};

const fileExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const clampScore = (score: number, max: number): number =>
  Math.max(0, Math.min(max, score));

const pushUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) {
    values.push(value);
  }
};

const capabilityCandidateRoots: Record<string, string[]> = {
  tag_mutation: [path.join('src', 'lib', 'tags')],
};

type FeatureUxState = 'loading' | 'error' | 'empty' | 'destructiveAction';
type FeatureUxCriterion =
  | 'loadingStatePresent'
  | 'errorStateWithRecovery'
  | 'emptyStateWithCta'
  | 'destructiveActionSafety';

const uxStatePatterns: Record<FeatureUxState, RegExp[]> = {
  loading: [
    /\bloading\b/i,
    /\bisLoading\b/i,
    /\bpending\b/i,
    /\bspinner\b/i,
    /\bskeleton\b/i,
  ],
  error: [/\berror\b/i, /\bfails?\b/i, /\bfailure\b/i, /\balert\b/i],
  empty: [/\bempty\b/i, /\bno data\b/i, /\bno results\b/i, /\bzero state\b/i],
  destructiveAction: [
    /\bdestructive\b/i,
    /\bconfirm(?:ation)?\b/i,
    /\bdelete(?:d|ion)?\b/i,
    /\breset(?:ting)?\b/i,
    /\bremove\b/i,
    /\bdanger\b/i,
  ],
};

const uxRecoveryPatterns = [
  /\bretry\b/i,
  /\brecover(?:y)?\b/i,
  /\brefresh\b/i,
  /\btry again\b/i,
];

const uxCtaPatterns = [
  /\bcta\b/i,
  /\baction\b/i,
  /\badd\b/i,
  /\bcreate\b/i,
  /\bconfigure\b/i,
  /\bretry\b/i,
  /\bsync\b/i,
];

const uxCancelPatterns = [/\bcancel(?:ed|lation)?\b/i, /\bundo\b/i];
const uxConfirmationPatterns = [/\bconfirm(?:ation)?\b/i];

const uxCriterionLabels: Record<FeatureUxCriterion, string> = {
  loadingStatePresent: 'loading state present',
  errorStateWithRecovery: 'error state present with recovery',
  emptyStateWithCta: 'empty state present with CTA',
  destructiveActionSafety:
    'destructive action confirmation + cancellation path',
};

const assertionAnchorPattern =
  /\b(expect\s*\(|assert\.[a-z]+|getBy[A-Z]\w*|findBy[A-Z]\w*|queryBy[A-Z]\w*)/;

const fileAssertsUxState = (
  fileContents: string,
  state: FeatureUxState
): boolean => {
  if (!assertionAnchorPattern.test(fileContents)) {
    return false;
  }

  const lines = fileContents.split('\n');
  const patterns = uxStatePatterns[state];

  for (let index = 0; index < lines.length; index += 1) {
    const localWindow = [
      lines[index - 1] ?? '',
      lines[index] ?? '',
      lines[index + 1] ?? '',
    ].join(' ');
    if (
      assertionAnchorPattern.test(localWindow) &&
      patterns.some((pattern) => pattern.test(localWindow))
    ) {
      return true;
    }
  }

  const broadWindowPattern = /expect\s*\([\s\S]{0,180}\)/g;
  for (const match of fileContents.matchAll(broadWindowPattern)) {
    if (patterns.some((pattern) => pattern.test(match[0]))) {
      return true;
    }
  }

  return false;
};

const fileAssertsPatternWithAssertion = (
  fileContents: string,
  patterns: RegExp[]
): boolean => {
  if (!assertionAnchorPattern.test(fileContents)) {
    return false;
  }

  const lines = fileContents.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const localWindow = [
      lines[index - 1] ?? '',
      lines[index] ?? '',
      lines[index + 1] ?? '',
    ].join(' ');
    if (
      assertionAnchorPattern.test(localWindow) &&
      patterns.some((pattern) => pattern.test(localWindow))
    ) {
      return true;
    }
  }

  return false;
};

const collectTestFiles = async (root: string): Promise<string[]> => {
  const results: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTestFiles(entryPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const lowerName = entry.name.toLowerCase();
    const isTestFile =
      lowerName.endsWith('.test.ts') ||
      lowerName.endsWith('.test.tsx') ||
      lowerName.endsWith('.spec.ts') ||
      lowerName.endsWith('.spec.tsx');

    if (isTestFile) {
      results.push(entryPath);
    }
  }

  return results;
};

const findTestEvidenceFiles = async (
  repoRoot: string,
  pluginId: string,
  componentBasenames: string[],
  componentIds: string[],
  capabilities: string[]
): Promise<string[]> => {
  const candidateRoots = [
    path.join(repoRoot, 'plugins', pluginId),
    path.join(repoRoot, 'src', 'components'),
    path.join(repoRoot, 'src', 'lib', 'plugins'),
    path.join(repoRoot, 'src', 'tests'),
  ];
  for (const capability of capabilities) {
    const capabilityRoots = capabilityCandidateRoots[capability] ?? [];
    for (const relativeRoot of capabilityRoots) {
      candidateRoots.push(path.join(repoRoot, relativeRoot));
    }
  }

  const searchTerms = [
    pluginId,
    ...componentBasenames,
    ...componentIds,
    ...capabilities,
  ].map((term) => term.toLowerCase());
  const roots = [...new Set(candidateRoots)];
  const matches: string[] = [];

  for (const root of roots) {
    if (!(await fileExists(root))) {
      continue;
    }

    const testFiles = await collectTestFiles(root);
    for (const testFile of testFiles) {
      const lowerName = path.basename(testFile).toLowerCase();
      const mentionsPlugin =
        lowerName.includes(pluginId.toLowerCase()) ||
        componentBasenames.some((basename) => lowerName.includes(basename));

      if (mentionsPlugin) {
        pushUnique(matches, testFile);
        continue;
      }

      const contents = (await readFile(testFile, 'utf8')).toLowerCase();
      const mentionsPluginInContent = searchTerms.some((term) =>
        contents.includes(term)
      );
      if (mentionsPluginInContent) {
        pushUnique(matches, testFile);
      }
    }
  }

  const fallbackFiles = [
    path.join(
      repoRoot,
      'src',
      'tests',
      'api-plugins-discovered-dashboard-tabs-route.test.ts'
    ),
    path.join(repoRoot, 'src', 'tests', 'api-plugins-routes.test.ts'),
  ];

  for (const fallbackFile of fallbackFiles) {
    if (!(await fileExists(fallbackFile))) {
      continue;
    }
    const contents = (await readFile(fallbackFile, 'utf8')).toLowerCase();
    const hasFallbackMatch = searchTerms.some((term) =>
      contents.includes(term)
    );
    if (hasFallbackMatch) {
      pushUnique(matches, fallbackFile);
    }
  }

  return matches;
};

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
  const pluginComponentsRoot = path.join(pluginDir, 'src', 'components');
  const componentIds = manifest.uiExtensions.flatMap((extension) => {
    const maybeComponent =
      'component' in extension.config ? extension.config.component : undefined;
    return typeof maybeComponent === 'string' && maybeComponent.trim()
      ? [maybeComponent]
      : [];
  });
  const componentBasenames = componentIds.map(componentIdToComponentBasename);
  const unresolvedRuntimeComponentWarnings = validationIssues.filter(
    (issue) =>
      issue.severity === 'warning' &&
      issue.path.includes('.config.component') &&
      issue.message.includes('no dashboard renderer is registered')
  );

  categoryScores.contract_metadata += 8;
  pushUnique(evidence, 'Manifest passes required schema validation.');

  if (manifest.enabled === true || manifest.enabled === false) {
    categoryScores.contract_metadata += 2;
  }

  if ((manifest.capabilities ?? []).length > 0) {
    categoryScores.contract_metadata += 2;
    pushUnique(evidence, 'Manifest declares explicit capabilities.');
  }

  if (
    manifest.maturity?.tier &&
    manifest.maturity.notes &&
    manifest.maturity.lastReviewedAt
  ) {
    categoryScores.contract_metadata += 2;
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

  if (manifest.uiExtensions.length > 0) {
    categoryScores.runtime_integration += 4;
  }

  if (await fileExists(pluginEntryPath)) {
    categoryScores.runtime_integration += 6;
    pushUnique(
      evidence,
      'Plugin entry module exists under plugins/<id>/src/index.ts.'
    );
    const entryContents = await readFile(pluginEntryPath, 'utf8');
    const hasExtensionRegistrations = manifest.uiExtensions.every((extension) =>
      entryContents.includes(extension.id)
    );
    if (hasExtensionRegistrations) {
      categoryScores.runtime_integration += 4;
      pushUnique(
        evidence,
        'Plugin entry registers its declared extension ids.'
      );
    } else {
      pushUnique(
        reasons,
        'Plugin entry does not obviously register all declared extensions.'
      );
      pushUnique(
        nextActions,
        'Align plugin entry registration calls with the manifest.'
      );
    }

    if (
      componentIds.length === 0 ||
      unresolvedRuntimeComponentWarnings.length === 0
    ) {
      categoryScores.runtime_integration += 4;
      pushUnique(
        evidence,
        'Declared manifest components resolve to registered renderers after plugin bootstrap.'
      );
    } else {
      pushUnique(
        reasons,
        'Some manifest component ids do not resolve to registered renderers at runtime.'
      );
      pushUnique(
        nextActions,
        'Register each declared manifest component id during plugin bootstrap.'
      );
    }

    const registeredPluginComponents =
      extractRegisteredPluginComponents(entryContents);
    const missingComponentRegistrations = componentIds.filter(
      (componentId) => !registeredPluginComponents.includes(componentId)
    );
    if (
      componentIds.length === 0 ||
      missingComponentRegistrations.length === 0
    ) {
      pushUnique(
        evidence,
        'Static plugin-entry scan aligns registerPluginComponent calls with manifest component ids.'
      );
    } else {
      pushUnique(
        reasons,
        'Static plugin-entry scan did not find all manifest component ids (supplemental signal only).'
      );
      pushUnique(
        nextActions,
        'Keep registerPluginComponent calls aligned with manifest component ids for maintainability.'
      );
    }
  } else {
    pushUnique(reasons, 'Plugin entry module is missing.');
    pushUnique(nextActions, 'Add plugins/<id>/src/index.ts for each plugin.');
  }

  const blockingWarnings = [
    ...validationIssues
      .filter((issue) => issue.severity === 'warning')
      .map((issue) => issue.message),
    ...autoDisabledWithWarnings,
  ];
  if (blockingWarnings.length === 0) {
    categoryScores.runtime_integration += 6;
  } else {
    pushUnique(
      reasons,
      'Plugin has capability or compatibility warnings that reduce safe runtime confidence.'
    );
    pushUnique(
      nextActions,
      'Resolve manifest warnings before promoting the plugin beyond Bronze.'
    );
  }

  if (componentIds.length > 0) {
    categoryScores.feature_quality += 5;
  }

  const pluginEntryExists = await fileExists(pluginEntryPath);
  const registeredPluginComponents = pluginEntryExists
    ? extractRegisteredPluginComponents(await readFile(pluginEntryPath, 'utf8'))
    : [];
  const missingComponentEvidence: string[] = [];
  let resolvedComponentCount = 0;

  for (const componentId of componentIds) {
    const componentFileName = toComponentFileName(componentId);
    const pluginLocalComponentPath = path.join(
      pluginComponentsRoot,
      componentFileName
    );
    const sharedComponentPath = path.join(
      repoRoot,
      'src',
      'components',
      componentFileName
    );
    const [pluginLocalExists, sharedExists] = await Promise.all([
      fileExists(pluginLocalComponentPath),
      fileExists(sharedComponentPath),
    ]);
    const hasRuntimeRegistration =
      pluginEntryExists && registeredPluginComponents.includes(componentId);

    if (pluginLocalExists || sharedExists || hasRuntimeRegistration) {
      resolvedComponentCount += 1;
      continue;
    }

    missingComponentEvidence.push(componentId);
  }

  if (
    resolvedComponentCount === componentIds.length &&
    componentIds.length > 0
  ) {
    categoryScores.feature_quality += 10;
    pushUnique(
      evidence,
      'Declared components resolve through plugin-local files, shared components, or runtime registration evidence.'
    );
  } else if (missingComponentEvidence.length > 0) {
    pushUnique(
      reasons,
      'Some declared plugin components could not be resolved from plugin-local files, shared components, or runtime registration.'
    );
    pushUnique(
      nextActions,
      'For each declared component, add plugins/<id>/src/components/<component>.tsx, add src/components/<component>.tsx, or register it in plugins/<id>/src/index.ts.'
    );
  }

  const testEvidenceFiles = await findTestEvidenceFiles(
    repoRoot,
    manifest.id,
    componentBasenames,
    componentIds,
    manifest.capabilities ?? []
  );
  if (testEvidenceFiles.length > 0) {
    categoryScores.test_coverage += 12;
    pushUnique(
      evidence,
      `Found automated test evidence in ${testEvidenceFiles.length} file(s).`
    );
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

  const runtimeAssertionsSatisfied =
    componentIds.length > 0 &&
    componentBasenames.length > 0 &&
    resolvedComponentCount === componentIds.length &&
    unresolvedRuntimeComponentWarnings.length === 0;
  const manifestUxStates = manifest.maturity?.uxStates;
  const manifestUxCriteria = manifest.maturity?.uxCriteria;
  const declaredUxStates = {
    loading: manifestUxStates?.loading === true,
    error: manifestUxStates?.error === true,
    empty: manifestUxStates?.empty === true,
    destructiveAction: manifestUxStates?.destructiveAction === true,
  };

  const assertedUxStates = {
    loading: false,
    error: false,
    empty: false,
    destructiveAction: false,
  };
  for (const testEvidenceFile of testEvidenceFiles) {
    const testFileContents = await readFile(testEvidenceFile, 'utf8');
    for (const state of Object.keys(assertedUxStates) as FeatureUxState[]) {
      if (assertedUxStates[state]) {
        continue;
      }
      assertedUxStates[state] = fileAssertsUxState(testFileContents, state);
    }
  }
  const assertedUxCriteria = {
    loadingStatePresent: assertedUxStates.loading,
    errorStateWithRecovery: false,
    emptyStateWithCta: false,
    destructiveActionSafety: false,
  };
  for (const testEvidenceFile of testEvidenceFiles) {
    const testFileContents = await readFile(testEvidenceFile, 'utf8');
    if (!assertedUxCriteria.errorStateWithRecovery) {
      assertedUxCriteria.errorStateWithRecovery =
        fileAssertsPatternWithAssertion(
          testFileContents,
          uxStatePatterns.error
        ) &&
        fileAssertsPatternWithAssertion(testFileContents, uxRecoveryPatterns);
    }
    if (!assertedUxCriteria.emptyStateWithCta) {
      assertedUxCriteria.emptyStateWithCta =
        fileAssertsPatternWithAssertion(
          testFileContents,
          uxStatePatterns.empty
        ) && fileAssertsPatternWithAssertion(testFileContents, uxCtaPatterns);
    }
    if (!assertedUxCriteria.destructiveActionSafety) {
      assertedUxCriteria.destructiveActionSafety =
        fileAssertsPatternWithAssertion(
          testFileContents,
          uxStatePatterns.destructiveAction
        ) &&
        fileAssertsPatternWithAssertion(
          testFileContents,
          uxConfirmationPatterns
        ) &&
        fileAssertsPatternWithAssertion(testFileContents, uxCancelPatterns);
    }
  }

  const declaredUxCriteria = {
    loadingStatePresent: manifestUxCriteria?.loadingStatePresent === true,
    errorStateWithRecovery: manifestUxCriteria?.errorStateWithRecovery === true,
    emptyStateWithCta: manifestUxCriteria?.emptyStateWithCta === true,
    destructiveActionSafety:
      manifestUxCriteria?.destructiveActionSafety?.confirmation === true &&
      manifestUxCriteria?.destructiveActionSafety?.cancellation === true,
  };
  const destructiveActionRelevant =
    manifestUxCriteria?.destructiveActionSafety?.relevant ??
    declaredUxStates.destructiveAction ??
    assertedUxStates.destructiveAction;
  const loadingStateUniversallyRequired = false;
  const loadingStateRelevant =
    loadingStateUniversallyRequired ||
    declaredUxCriteria.loadingStatePresent ||
    declaredUxStates.loading;
  const errorStateRelevant =
    declaredUxCriteria.errorStateWithRecovery || declaredUxStates.error;
  const emptyStateRelevant =
    declaredUxCriteria.emptyStateWithCta || declaredUxStates.empty;
  const uxCriterionRelevance: Record<FeatureUxCriterion, boolean> = {
    loadingStatePresent: loadingStateRelevant,
    errorStateWithRecovery: errorStateRelevant,
    emptyStateWithCta: emptyStateRelevant,
    destructiveActionSafety: destructiveActionRelevant,
  };

  const allCriteria = [
    'loadingStatePresent',
    'errorStateWithRecovery',
    'emptyStateWithCta',
    'destructiveActionSafety',
  ] as const;
  const criteriaToEvaluate = allCriteria.filter(
    (criterion): criterion is FeatureUxCriterion =>
      uxCriterionRelevance[criterion]
  );

  let metCriteriaCount = 0;
  const missingUxCriteria: FeatureUxCriterion[] = [];

  for (const criterion of criteriaToEvaluate) {
    const isDeclared = declaredUxCriteria[criterion];
    const isAsserted = assertedUxCriteria[criterion];
    if (isDeclared && isAsserted && runtimeAssertionsSatisfied) {
      metCriteriaCount += 1;
      continue;
    }

    missingUxCriteria.push(criterion);
    pushUnique(
      reasons,
      `Missing machine-checkable UX criterion: ${uxCriterionLabels[criterion]}.`
    );
    pushUnique(
      nextActions,
      `Record and test: ${uxCriterionLabels[criterion]}.`
    );
  }

  if (metCriteriaCount > 0) {
    categoryScores.feature_quality += metCriteriaCount * 2;
    pushUnique(
      evidence,
      'Manifest UX criteria and automated tests jointly validate key UX safeguards.'
    );
  }

  if (missingUxCriteria.length > 0) {
    categoryScores.feature_quality -= missingUxCriteria.length * 4;
  }

  if (
    testEvidenceFiles.some((filePath) =>
      filePath.includes(path.join('src', 'tests'))
    ) ||
    testEvidenceFiles.some((filePath) =>
      filePath.includes(path.join('src', 'lib', 'plugins'))
    )
  ) {
    categoryScores.test_coverage += 8;
  }

  if (await fileExists(pluginReadmePath)) {
    categoryScores.operability_docs += 8;
    pushUnique(evidence, 'Plugin README is present.');
  } else {
    pushUnique(reasons, 'Plugin README is missing.');
    pushUnique(
      nextActions,
      'Add a README for each plugin with usage and verification steps.'
    );
  }

  if (manifest.maturity?.notes && manifest.maturity.lastReviewedAt) {
    categoryScores.operability_docs += 2;
  }

  const normalizedCategoryScores = Object.fromEntries(
    (Object.keys(categoryMaximums) as PluginMaturityCategory[]).map(
      (category) => [
        category,
        {
          label: categoryLabels[category],
          earned: clampScore(
            categoryScores[category],
            categoryMaximums[category]
          ),
          possible: categoryMaximums[category],
        } satisfies PluginMaturityCategoryScore,
      ]
    )
  ) as Record<PluginMaturityCategory, PluginMaturityCategoryScore>;

  const totalScore = (
    Object.keys(normalizedCategoryScores) as PluginMaturityCategory[]
  ).reduce(
    (sum, category) => sum + normalizedCategoryScores[category].earned,
    0
  );

  const hasValidationErrors = validationIssues.some(
    (issue) => issue.severity === 'error'
  );
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

  let tier: PluginMaturityTier = 'bronze';
  if (
    totalScore >= 85 &&
    !hasValidationErrors &&
    !hasBlockingWarnings &&
    hasAnyTestEvidence &&
    hasReadme &&
    isExplicitGoldReview
  ) {
    tier = 'gold';
  } else if (
    totalScore >= 70 &&
    !hasValidationErrors &&
    !hasBlockingWarnings &&
    hasAnyTestEvidence &&
    hasReadme
  ) {
    tier = 'silver';
  }

  if (hasValidationErrors) {
    pushUnique(reasons, 'Manifest validation errors cap the plugin at Bronze.');
  }
  if (hasBlockingWarnings) {
    pushUnique(
      reasons,
      'Capability or version warnings cap the plugin at Bronze until resolved.'
    );
  }
  if (!hasAnyTestEvidence) {
    pushUnique(
      reasons,
      'Missing automated test evidence caps the plugin at Bronze.'
    );
  }
  if (!hasReadme) {
    pushUnique(
      reasons,
      'Missing plugin documentation prevents promotion beyond Bronze/Silver.'
    );
  }
  if (totalScore >= 85 && !isExplicitGoldReview) {
    pushUnique(
      reasons,
      'Gold requires an explicit Gold review recorded in manifest maturity metadata.'
    );
    pushUnique(
      nextActions,
      'Only mark a plugin Gold after a deliberate review updates `maturity.tier` to `gold`.'
    );
  }

  return {
    score: totalScore,
    tier,
    categoryScores: normalizedCategoryScores,
    reasons: reasons.slice(0, 5),
    nextActions: nextActions.slice(0, 5),
    evidence: evidence.slice(0, 5),
    declaredTier: manifest.maturity?.tier,
  };
};
