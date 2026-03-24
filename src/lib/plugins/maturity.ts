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
  componentId.replace(/_/g, '-');

const pluginComponentRegistrationPattern =
  /\.?registerPluginComponent(?:\?\.)?\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g;

const extractRegisteredPluginComponents = (entryContents: string): string[] => {
  const componentIds = new Set<string>();

  for (const match of entryContents.matchAll(pluginComponentRegistrationPattern)) {
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

const findTestEvidenceFiles = async (
  repoRoot: string,
  pluginId: string,
  componentBasenames: string[]
): Promise<string[]> => {
  const candidateRoots = [
    path.join(repoRoot, 'plugins', pluginId),
    path.join(repoRoot, 'src', 'components'),
    path.join(repoRoot, 'src', 'lib', 'plugins'),
    path.join(repoRoot, 'src', 'tests'),
  ];
  const matches: string[] = [];

  for (const root of candidateRoots) {
    if (!(await fileExists(root))) {
      continue;
    }

    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const name = entry.name;
      const lowerName = name.toLowerCase();
      const mentionsPlugin =
        lowerName.includes(pluginId) ||
        componentBasenames.some((basename) => lowerName.includes(basename));
      const isTestFile =
        lowerName.endsWith('.test.ts') ||
        lowerName.endsWith('.test.tsx') ||
        lowerName.endsWith('.spec.ts') ||
        lowerName.endsWith('.spec.tsx');

      if (isTestFile && mentionsPlugin) {
        matches.push(path.join(root, name));
      }
    }
  }

  if (matches.length > 0) {
    return matches;
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
    const contents = await readFile(fallbackFile, 'utf8');
    if (contents.includes(pluginId)) {
      matches.push(fallbackFile);
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
  const componentIds = manifest.uiExtensions.flatMap((extension) => {
    const maybeComponent =
      'component' in extension.config ? extension.config.component : undefined;
    return typeof maybeComponent === 'string' && maybeComponent.trim()
      ? [maybeComponent]
      : [];
  });
  const componentBasenames = componentIds.map(componentIdToComponentBasename);

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

    const registeredPluginComponents =
      extractRegisteredPluginComponents(entryContents);
    const missingComponentRegistrations = componentIds.filter(
      (componentId) => !registeredPluginComponents.includes(componentId)
    );
    if (componentIds.length === 0 || missingComponentRegistrations.length === 0) {
      categoryScores.runtime_integration += 4;
      pushUnique(
        evidence,
        'Plugin entry registers declared component renderers.'
      );
    } else {
      pushUnique(
        reasons,
        'Plugin entry does not register all manifest component ids.'
      );
      pushUnique(
        nextActions,
        'Register every declared component id in the plugin entry module.'
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

  const missingComponentFiles: string[] = [];
  let existingComponentCount = 0;
  let matureComponentSignals = 0;
  for (const componentBasename of componentBasenames) {
    const componentPath = path.join(
      repoRoot,
      'src',
      'components',
      `${componentBasename}.tsx`
    );
    if (!(await fileExists(componentPath))) {
      missingComponentFiles.push(componentBasename);
      continue;
    }

    existingComponentCount += 1;
    const componentContents = await readFile(componentPath, 'utf8');
    if (
      componentContents.includes('Alert') ||
      componentContents.includes('toast') ||
      componentContents.includes('disabled') ||
      componentContents.includes('Dialog')
    ) {
      matureComponentSignals += 1;
    }
  }

  if (
    existingComponentCount === componentBasenames.length &&
    componentBasenames.length > 0
  ) {
    categoryScores.feature_quality += 10;
    pushUnique(
      evidence,
      'Plugin-backed UI components exist for declared component ids.'
    );
  } else if (componentBasenames.length > 0) {
    if (componentIds.length > 0 && !(await fileExists(pluginEntryPath))) {
      pushUnique(
        reasons,
        'Some declared plugin components do not map to checked-in UI modules.'
      );
      pushUnique(nextActions, 'Keep component ids and component files aligned.');
    } else if (missingComponentFiles.length > 0) {
      pushUnique(
        reasons,
        'Some registered plugin component UI modules are missing from src/components.'
      );
      pushUnique(
        nextActions,
        'Add missing component files to improve maintainability and traceability.'
      );
    }
  }

  if (matureComponentSignals > 0) {
    categoryScores.feature_quality += clampScore(
      matureComponentSignals * 5,
      10
    );
    pushUnique(
      evidence,
      'Plugin-backed UI includes at least some user-state handling such as alerts, toasts, or guarded dialogs.'
    );
  } else {
    pushUnique(
      reasons,
      'Plugin-backed UI has little visible evidence of robust user-state handling.'
    );
    pushUnique(
      nextActions,
      'Add explicit loading, error, empty, and destructive-action handling where relevant.'
    );
  }

  const testEvidenceFiles = await findTestEvidenceFiles(
    repoRoot,
    manifest.id,
    componentBasenames
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
