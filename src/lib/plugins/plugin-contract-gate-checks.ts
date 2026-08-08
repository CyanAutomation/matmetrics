import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  PluginManifest,
  PluginValidationIssue,
} from '@/lib/plugins/types';
import {
  UX_STATE_EVIDENCE_CRITERIA,
  TEST_FILE_PATTERN,
  extractDeclaredComponentIds,
  extractDisallowedEntrypointComponentImports,
  extractRuntimeRegisteredComponentIds,
  exists,
  hasRequiredReadmeSections,
  toComponentFileName,
} from './plugin-contract-gate-utils';

export type ContractGateContext = {
  pluginsRoot: string;
  directoryName: string;
  manifest: Pick<PluginManifest, 'uiExtensions' | 'uiContract' | 'maturity'>;
  explicitRuntimeRegistrations?: ReadonlySet<string>;
};

export const discoverContractArtifacts = async (
  context: ContractGateContext
) => {
  const pluginRoot = path.join(context.pluginsRoot, context.directoryName);
  const [manifestExists, indexExists, readmeExists] = await Promise.all([
    exists(path.join(pluginRoot, 'plugin.json')),
    exists(path.join(pluginRoot, 'src', 'index.ts')),
    exists(path.join(pluginRoot, 'README.md')),
  ]);

  return {
    pluginRoot,
    manifestExists,
    indexExists,
    readmeExists,
    packagedRuntime:
      process.env.MATMETRICS_PLUGIN_CONTRACT_RUNTIME_MODE === 'packaged',
  };
};

export const validateRequiredArtifacts = ({
  directoryName,
  artifacts,
}: {
  directoryName: string;
  artifacts: Awaited<ReturnType<typeof discoverContractArtifacts>>;
}): PluginValidationIssue[] => {
  const unavailable =
    artifacts.packagedRuntime &&
    artifacts.manifestExists &&
    !artifacts.indexExists &&
    !artifacts.readmeExists;
  const issues: PluginValidationIssue[] = [];

  if (unavailable) {
    issues.push({
      severity: 'warning',
      path: 'contractGate.artifactsUnavailable',
      message:
        'Plugin source artifacts are unavailable in packaged runtime (missing src/index.ts and README.md). Contract gate checks are non-blocking in this environment.',
    });
  }
  if (!artifacts.indexExists && !unavailable) {
    issues.push({
      severity: 'error',
      path: 'contractGate.entrypoint',
      message: `Missing required entrypoint: plugins/${directoryName}/src/index.ts`,
    });
  }
  if (!artifacts.readmeExists && !unavailable) {
    issues.push({
      severity: 'error',
      path: 'contractGate.readme',
      message: `Missing required docs: plugins/${directoryName}/README.md (must include UI Ownership, Usage, and Verification sections).`,
    });
  }
  return issues;
};

export const inspectEntrypoint = async ({
  directoryName,
  indexPath,
  explicitRuntimeRegistrations,
}: {
  directoryName: string;
  indexPath: string;
  explicitRuntimeRegistrations?: ReadonlySet<string>;
}) => {
  const runtimeRegisteredComponentIds = new Set<string>(
    explicitRuntimeRegistrations ?? []
  );
  const issues: PluginValidationIssue[] = [];
  if (!(await exists(indexPath)))
    return { runtimeRegisteredComponentIds, issues };

  try {
    const source = await readFile(indexPath, 'utf8');
    for (const id of extractRuntimeRegisteredComponentIds(source))
      runtimeRegisteredComponentIds.add(id);
    const disallowedImports =
      extractDisallowedEntrypointComponentImports(source);
    if (disallowedImports.length) {
      issues.push({
        severity: 'error',
        path: 'contractGate.entrypointOwnership',
        message: `plugins/${directoryName}/src/index.ts must render plugin UI from plugin-local modules (./components/*). Move imports ${disallowedImports.map((value) => `"${value}"`).join(', ')} into plugins/${directoryName}/src/components and keep only shared primitives under src/components/plugins.`,
      });
    }
  } catch {
    // Other artifact checks provide the actionable contract diagnostics.
  }
  return { runtimeRegisteredComponentIds, issues };
};

export const validateDeclaredComponents = async ({
  context,
  artifacts,
  runtimeRegisteredComponentIds,
}: {
  context: ContractGateContext;
  artifacts: Awaited<ReturnType<typeof discoverContractArtifacts>>;
  runtimeRegisteredComponentIds: Set<string>;
}): Promise<PluginValidationIssue[]> => {
  if (
    artifacts.packagedRuntime &&
    artifacts.manifestExists &&
    !artifacts.indexExists &&
    !artifacts.readmeExists
  )
    return [];
  const issues: PluginValidationIssue[] = [];
  for (const declared of extractDeclaredComponentIds(context.manifest)) {
    const expectedPath = path.join(
      artifacts.pluginRoot,
      'src',
      'components',
      toComponentFileName(declared.componentId)
    );
    if (
      !(await exists(expectedPath)) &&
      !runtimeRegisteredComponentIds.has(declared.componentId)
    ) {
      issues.push({
        severity: 'error',
        path: declared.path,
        message: `Extension "${declared.extensionId}" declares component "${declared.componentId}" but no file exists at plugins/${context.directoryName}/src/components/${toComponentFileName(declared.componentId)} and no explicit runtime registration was found in src/index.ts.`,
      });
    }
  }
  return issues;
};

export const validateUxEvidence = async ({
  context,
  artifacts,
}: {
  context: ContractGateContext;
  artifacts: Awaited<ReturnType<typeof discoverContractArtifacts>>;
}): Promise<PluginValidationIssue[]> => {
  if (
    artifacts.packagedRuntime &&
    artifacts.manifestExists &&
    !artifacts.indexExists &&
    !artifacts.readmeExists
  )
    return [];
  const repoRoot = path.dirname(context.pluginsRoot);
  const issues: PluginValidationIssue[] = [];
  for (const requiredState of context.manifest.uiContract?.requiredUxStates ??
    []) {
    const criterion = UX_STATE_EVIDENCE_CRITERIA[requiredState];
    const evidencePath = `maturity.evidence.uxCriteria.${criterion ?? requiredState}`;
    if (!criterion) {
      issues.push({
        severity: 'error',
        path: 'uiContract.requiredUxStates',
        message: `Unknown UX state "${requiredState}". Supported states: loading, error, empty, destructive.`,
      });
      continue;
    }
    const evidence =
      context.manifest.maturity?.evidence?.uxCriteria?.[criterion];
    if (!Array.isArray(evidence) || evidence.length === 0) {
      issues.push({
        severity: 'error',
        path: evidencePath,
        message: `Required UX state "${requiredState}" must declare at least one evidence test file.`,
      });
      continue;
    }
    for (const [index, reference] of evidence.entries()) {
      const referencePath = `${evidencePath}[${index}]`;
      if (
        typeof reference !== 'string' ||
        reference.trim() !== reference ||
        !TEST_FILE_PATTERN.test(reference)
      ) {
        issues.push({
          severity: 'error',
          path: referencePath,
          message: `Evidence for required UX state "${requiredState}" must be a repository-relative test file path.`,
        });
        continue;
      }
      const resolved = path.resolve(repoRoot, reference);
      const relative = path.relative(repoRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        issues.push({
          severity: 'error',
          path: referencePath,
          message: `Evidence path "${reference}" must resolve within the repository.`,
        });
        continue;
      }
      try {
        if (!(await stat(resolved)).isFile()) throw new Error('not a file');
      } catch {
        issues.push({
          severity: 'error',
          path: referencePath,
          message: `Evidence test file does not exist: ${reference}`,
        });
      }
    }
  }
  return issues;
};

export const validateReadme = async ({
  readmePath,
  exists: readmeExists,
}: {
  readmePath: string;
  exists: boolean;
}): Promise<PluginValidationIssue[]> => {
  if (!readmeExists) return [];
  try {
    if (hasRequiredReadmeSections(await readFile(readmePath, 'utf8')))
      return [];
  } catch {
    // Fall through to the same actionable issue as an invalid README.
  }
  return [
    {
      severity: 'error',
      path: 'contractGate.readme',
      message:
        'README.md must include "UI Ownership", "Usage", and "Verification" sections.',
    },
  ];
};
