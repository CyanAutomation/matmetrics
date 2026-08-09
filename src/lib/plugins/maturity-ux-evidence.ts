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

export const findFilesAssertingState = async (
  testFiles: string[],
  state: FeatureUxState
): Promise<string[]> => {
  const matches: string[] = [];
  for (const file of testFiles) {
    if (fileAssertsUxState(await readFile(file, 'utf8'), state)) {
      matches.push(file);
    }
  }
  return matches;
};

export const findFilesAssertingCriterion = async (
  testFiles: string[],
  criterion: PluginMaturityUxCriterion
): Promise<string[]> => {
  const matches: string[] = [];
  for (const file of testFiles) {
    const contents = await readFile(file, 'utf8');
    const matched =
      criterion === 'loadingStatePresent'
        ? fileAssertsUxState(contents, 'loading')
        : criterion === 'errorStateWithRecovery'
          ? fileAssertsWithAssertion(contents, uxStatePatterns.error) &&
            fileAssertsWithAssertion(contents, uxRecoveryPatterns)
          : criterion === 'emptyStateWithCta'
            ? fileAssertsWithAssertion(contents, uxStatePatterns.empty) &&
              fileAssertsWithAssertion(contents, uxCtaPatterns)
            : fileAssertsWithAssertion(
                contents,
                uxStatePatterns.destructiveAction
              ) &&
              fileAssertsWithAssertion(contents, uxConfirmationPatterns) &&
              fileAssertsWithAssertion(contents, uxCancelPatterns);
    if (matched) matches.push(file);
  }
  return matches;
};
