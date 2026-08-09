import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  PluginManifest,
  PluginMaturityEvidenceSource,
} from '@/lib/plugins/types';
import {
  componentIdToComponentBasename,
  fileExists,
  getManifestComponentIds,
  pushUnique,
} from '@/lib/plugins/scoring';

export type MaturityTestEvidence = {
  testEvidenceFiles: string[];
  testEvidenceSource: PluginMaturityEvidenceSource;
  missingExplicitTestFiles: string[];
};

const capabilityCandidateRoots: Record<string, string[]> = {
  tag_mutation: [path.join('src', 'lib', 'tags')],
};

const toRepoRelativePath = (repoRoot: string, filePath: string): string =>
  path.relative(repoRoot, filePath).split(path.sep).join('/');

const fromRepoRelativePath = (repoRoot: string, relativePath: string): string =>
  path.join(repoRoot, ...relativePath.split('/'));

const collectTestFiles = async (root: string): Promise<string[]> => {
  const results: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTestFiles(entryPath)));
      continue;
    }

    if (!entry.isFile()) continue;

    const lowerName = entry.name.toLowerCase();
    if (
      lowerName.endsWith('.test.ts') ||
      lowerName.endsWith('.test.tsx') ||
      lowerName.endsWith('.spec.ts') ||
      lowerName.endsWith('.spec.tsx')
    ) {
      results.push(entryPath);
    }
  }

  return results;
};

const resolveExplicitEvidenceFiles = async (
  repoRoot: string,
  relativePaths: string[]
): Promise<string[]> => {
  const resolved: string[] = [];
  for (const relativePath of relativePaths) {
    const normalized = relativePath.trim();
    if (!normalized) continue;

    const absolutePath = fromRepoRelativePath(repoRoot, normalized);
    if (await fileExists(absolutePath)) resolved.push(absolutePath);
  }
  return resolved;
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
    for (const relativeRoot of capabilityCandidateRoots[capability] ?? []) {
      candidateRoots.push(path.join(repoRoot, relativeRoot));
    }
  }

  const searchTerms = [
    pluginId,
    ...componentBasenames,
    ...componentIds,
    ...capabilities,
  ].map((term) => term.toLowerCase());
  const matches: string[] = [];

  for (const root of [...new Set(candidateRoots)]) {
    if (!(await fileExists(root))) continue;

    for (const testFile of await collectTestFiles(root)) {
      const lowerName = path.basename(testFile).toLowerCase();
      if (
        lowerName.includes(pluginId.toLowerCase()) ||
        componentBasenames.some((basename) => lowerName.includes(basename))
      ) {
        pushUnique(matches, testFile);
        continue;
      }

      const contents = (await readFile(testFile, 'utf8')).toLowerCase();
      if (searchTerms.some((term) => contents.includes(term))) {
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
    if (!(await fileExists(fallbackFile))) continue;
    const contents = (await readFile(fallbackFile, 'utf8')).toLowerCase();
    if (searchTerms.some((term) => contents.includes(term))) {
      pushUnique(matches, fallbackFile);
    }
  }

  return matches;
};

export const discoverMaturityTestEvidence = async ({
  repoRoot,
  manifest,
  componentBasenames = getManifestComponentIds(manifest).map(
    componentIdToComponentBasename
  ),
  componentIds = getManifestComponentIds(manifest),
}: {
  repoRoot: string;
  manifest: PluginManifest;
  componentBasenames?: string[];
  componentIds?: string[];
}): Promise<MaturityTestEvidence> => {
  const declaredTestFiles = manifest.maturity?.evidence?.testFiles ?? [];
  const explicitTestEvidenceFiles = await resolveExplicitEvidenceFiles(
    repoRoot,
    declaredTestFiles
  );
  const missingExplicitTestFiles = declaredTestFiles.filter(
    (relativePath) =>
      !explicitTestEvidenceFiles.some(
        (absolutePath) =>
          toRepoRelativePath(repoRoot, absolutePath) === relativePath
      )
  );
  const heuristicTestEvidenceFiles =
    explicitTestEvidenceFiles.length === 0
      ? await findTestEvidenceFiles(
          repoRoot,
          manifest.id,
          componentBasenames,
          componentIds,
          manifest.capabilities ?? []
        )
      : [];
  const testEvidenceFiles =
    explicitTestEvidenceFiles.length > 0
      ? explicitTestEvidenceFiles
      : heuristicTestEvidenceFiles;

  return {
    testEvidenceFiles,
    testEvidenceSource:
      explicitTestEvidenceFiles.length > 0
        ? 'explicit'
        : heuristicTestEvidenceFiles.length > 0
          ? 'heuristic'
          : 'none',
    missingExplicitTestFiles,
  };
};
