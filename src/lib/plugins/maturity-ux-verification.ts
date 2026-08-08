import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  PluginManifest,
  PluginMaturityEvidenceSource,
  PluginMaturityScorecard,
  PluginMaturityUxCriterion,
} from '@/lib/plugins/types';
import { fileExists, pushUnique } from './scoring';

type FeatureUxState = 'loading' | 'error' | 'empty' | 'destructiveAction';

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
const assertionAnchorPattern =
  /\b(expect\s*\(|assert\.[a-z]+|getBy[A-Z]\w*|findBy[A-Z]\w*|queryBy[A-Z]\w*)/;

const uxCriterionLabels: Record<PluginMaturityUxCriterion, string> = {
  loadingStatePresent: 'loading state present',
  errorStateWithRecovery: 'error state present with recovery',
  emptyStateWithCta: 'empty state present with CTA',
  destructiveActionSafety:
    'destructive action confirmation + cancellation path',
};

const toRepoRelativePath = (repoRoot: string, filePath: string): string =>
  path.relative(repoRoot, filePath).split(path.sep).join('/');

const resolveEvidenceFiles = async (
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

const findFilesAssertingState = async (
  testFiles: string[],
  state: FeatureUxState
): Promise<string[]> => {
  const matches: string[] = [];
  for (const file of testFiles) {
    if (fileAssertsUxState(await readFile(file, 'utf8'), state))
      matches.push(file);
  }
  return matches;
};

const findFilesAssertingCriterion = async (
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

type UxVerificationResult = {
  categoryScoreDelta: number;
  evidence: string[];
  reasons: string[];
  nextActions: string[];
  criteriaDetails: PluginMaturityScorecard['verificationDetails']['uxCriteria'];
};

export async function verifyMaturityUxCriteria({
  repoRoot,
  manifest,
  testEvidenceFiles,
  runtimeAssertionsSatisfied,
}: {
  repoRoot: string;
  manifest: PluginManifest;
  testEvidenceFiles: string[];
  runtimeAssertionsSatisfied: boolean;
}): Promise<UxVerificationResult> {
  const declaredEvidence = manifest.maturity?.evidence;
  const manifestUxStates = manifest.maturity?.uxStates;
  const manifestUxCriteria = manifest.maturity?.uxCriteria;
  const declaredStates = {
    loading: manifestUxStates?.loading === true,
    error: manifestUxStates?.error === true,
    empty: manifestUxStates?.empty === true,
    destructiveAction: manifestUxStates?.destructiveAction === true,
  };
  const assertedStates = {
    loading: await findFilesAssertingState(testEvidenceFiles, 'loading'),
    error: await findFilesAssertingState(testEvidenceFiles, 'error'),
    empty: await findFilesAssertingState(testEvidenceFiles, 'empty'),
    destructiveAction: await findFilesAssertingState(
      testEvidenceFiles,
      'destructiveAction'
    ),
  };
  const declaredCriteria = {
    loadingStatePresent: manifestUxCriteria?.loadingStatePresent === true,
    errorStateWithRecovery: manifestUxCriteria?.errorStateWithRecovery === true,
    emptyStateWithCta: manifestUxCriteria?.emptyStateWithCta === true,
    destructiveActionSafety:
      manifestUxCriteria?.destructiveActionSafety?.confirmation === true &&
      manifestUxCriteria?.destructiveActionSafety?.cancellation === true,
  };
  const relevance = {
    loadingStatePresent:
      declaredCriteria.loadingStatePresent || declaredStates.loading,
    errorStateWithRecovery:
      declaredCriteria.errorStateWithRecovery || declaredStates.error,
    emptyStateWithCta:
      declaredCriteria.emptyStateWithCta || declaredStates.empty,
    destructiveActionSafety:
      manifestUxCriteria?.destructiveActionSafety?.relevant ??
      declaredStates.destructiveAction ??
      assertedStates.destructiveAction.length > 0,
  };
  const criteria = Object.keys(
    uxCriterionLabels
  ) as PluginMaturityUxCriterion[];
  const criteriaDetails = Object.fromEntries(
    criteria.map((criterion) => [
      criterion,
      {
        label: uxCriterionLabels[criterion],
        relevant: relevance[criterion],
        declared: declaredCriteria[criterion],
        verified: false,
        source: 'none' as PluginMaturityEvidenceSource,
        files: [],
      },
    ])
  ) as unknown as PluginMaturityScorecard['verificationDetails']['uxCriteria'];
  const reasons: string[] = [];
  const nextActions: string[] = [];
  let metCriteriaCount = 0;
  let explicitCriteriaCount = 0;

  for (const criterion of criteria.filter((item) => relevance[item])) {
    const explicitFiles = await resolveEvidenceFiles(
      repoRoot,
      declaredEvidence?.uxCriteria?.[criterion] ?? []
    );
    const heuristicFiles =
      explicitFiles.length === 0
        ? await findFilesAssertingCriterion(testEvidenceFiles, criterion)
        : [];
    const verifiedFiles =
      explicitFiles.length > 0 ? explicitFiles : heuristicFiles;
    const source: PluginMaturityEvidenceSource =
      explicitFiles.length > 0
        ? 'explicit'
        : heuristicFiles.length > 0
          ? 'heuristic'
          : 'none';
    criteriaDetails[criterion] = {
      label: uxCriterionLabels[criterion],
      relevant: true,
      declared: declaredCriteria[criterion],
      verified: verifiedFiles.length > 0,
      source,
      files: verifiedFiles.map((file) => toRepoRelativePath(repoRoot, file)),
    };
    if (
      declaredCriteria[criterion] &&
      verifiedFiles.length > 0 &&
      runtimeAssertionsSatisfied
    ) {
      metCriteriaCount += 1;
      if (source === 'explicit') explicitCriteriaCount += 1;
      else
        pushUnique(
          nextActions,
          `Promote heuristic UX verification for ${uxCriterionLabels[criterion]} to explicit \`maturity.evidence.uxCriteria\` file mappings.`
        );
    } else {
      pushUnique(
        reasons,
        `Missing machine-checkable UX criterion: ${uxCriterionLabels[criterion]}.`
      );
      pushUnique(
        nextActions,
        `Record and test: ${uxCriterionLabels[criterion]}.`
      );
    }
  }

  const evidence: string[] = [];
  if (metCriteriaCount > 0)
    pushUnique(
      evidence,
      'Manifest UX criteria and automated tests jointly validate key UX safeguards.'
    );
  if (explicitCriteriaCount > 0)
    pushUnique(
      evidence,
      'Explicit UX evidence links criteria to concrete test files instead of relying only on heuristic detection.'
    );
  const missingCriteriaCount = criteria
    .filter((criterion) => relevance[criterion])
    .filter(
      (criterion) =>
        !declaredCriteria[criterion] ||
        !criteriaDetails[criterion].verified ||
        !runtimeAssertionsSatisfied
    ).length;
  return {
    categoryScoreDelta:
      metCriteriaCount * 2 +
      Math.min(2, explicitCriteriaCount) -
      missingCriteriaCount * 4,
    evidence,
    reasons,
    nextActions,
    criteriaDetails,
  };
}
