import path from 'node:path';

import { fileExists } from './scoring';

/**
 * Converts an absolute file path to a repo-relative path.
 * Used for display and configuration in manifests.
 */
export const toRepoRelativePath = (repoRoot: string, filePath: string): string =>
  path.relative(repoRoot, filePath).split(path.sep).join('/');

/**
 * Resolves manifest evidence file paths to absolute file paths.
 * Filters out non-existent files and normalizes paths.
 */
export const resolveEvidenceFiles = async (
  repoRoot: string,
  relativePaths: string[]
): Promise<string[]> => {
  const files: string[] = [];
  for (const relativePath of relativePaths) {
    const normalized = relativePath.trim();
    if (!normalized) continue;
    const absolutePath = path.join(repoRoot, ...normalized.split('/'));
    if (await fileExists(absolutePath)) files.push(absolutePath);
  }
  return files;
};
