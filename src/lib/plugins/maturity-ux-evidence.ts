import { readFile } from 'node:fs/promises';

import type { PluginMaturityUxCriterion } from '@/lib/plugins/types';
import {
  assertionAnchorPattern,
  uxCancelPatterns,
  uxConfirmationPatterns,
  uxCtaPatterns,
  uxRecoveryPatterns,
  uxStatePatterns,
  type FeatureUxState,
} from './maturity-ux-patterns';

const fileAssertsPatternInWindow = (
  contents: string,
  patterns: RegExp[],
  includeBroadWindow = false
): boolean => {
  if (!assertionAnchorPattern.test(contents)) return false;
  const lines = contents.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const window = [
      lines[index - 1] ?? '',
      lines[index] ?? '',
      lines[index + 1] ?? '',
    ].join(' ');
    if (
      assertionAnchorPattern.test(window) &&
      patterns.some((pattern) => pattern.test(window))
    ) {
      return true;
    }
  }
  if (includeBroadWindow) {
    for (const match of contents.matchAll(/expect\s*\([\s\S]{0,180}\)/g)) {
      if (patterns.some((pattern) => pattern.test(match[0]))) return true;
    }
  }
  return false;
};

const fileAssertsUxState = (contents: string, state: FeatureUxState) =>
  fileAssertsPatternInWindow(contents, uxStatePatterns[state], true);

const fileAssertsWithAssertion = (contents: string, patterns: RegExp[]) =>
  fileAssertsPatternInWindow(contents, patterns);

const findMatchingFiles = async (
  testFiles: string[],
  predicate: (contents: string) => boolean
): Promise<string[]> => {
  const matches: string[] = [];
  for (const file of testFiles) {
    if (predicate(await readFile(file, 'utf8'))) matches.push(file);
  }
  return matches;
};

const criterionMatchers: Record<
  PluginMaturityUxCriterion,
  (contents: string) => boolean
> = {
  loadingStatePresent: (contents) => fileAssertsUxState(contents, 'loading'),
  errorStateWithRecovery: (contents) =>
    fileAssertsWithAssertion(contents, uxStatePatterns.error) &&
    fileAssertsWithAssertion(contents, uxRecoveryPatterns),
  emptyStateWithCta: (contents) =>
    fileAssertsWithAssertion(contents, uxStatePatterns.empty) &&
    fileAssertsWithAssertion(contents, uxCtaPatterns),
  destructiveActionSafety: (contents) =>
    fileAssertsWithAssertion(contents, uxStatePatterns.destructiveAction) &&
    fileAssertsWithAssertion(contents, uxConfirmationPatterns) &&
    fileAssertsWithAssertion(contents, uxCancelPatterns),
};

export const findFilesAssertingState = async (
  testFiles: string[],
  state: FeatureUxState
): Promise<string[]> => {
  return findMatchingFiles(testFiles, (contents) =>
    fileAssertsUxState(contents, state)
  );
};

export const findFilesAssertingCriterion = async (
  testFiles: string[],
  criterion: PluginMaturityUxCriterion
): Promise<string[]> => {
  return findMatchingFiles(testFiles, criterionMatchers[criterion]);
};
