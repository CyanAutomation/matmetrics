import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  type PluginManifest,
  type PluginValidationIssue,
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

export type PluginContractGateResult = {
  isValid: boolean;
  issues: PluginValidationIssue[];
};

const isPackagedRuntimeArtifactMode = (): boolean =>
  process.env.MATMETRICS_PLUGIN_CONTRACT_RUNTIME_MODE === 'packaged';

export const runPluginContractGate = async ({
  pluginsRoot,
  directoryName,
  manifest,
  explicitRuntimeRegistrations,
}: {
  pluginsRoot: string;
  directoryName: string;
  manifest: Pick<PluginManifest, 'uiExtensions' | 'uiContract' | 'maturity'>;
  explicitRuntimeRegistrations?: ReadonlySet<string>;
}): Promise<PluginContractGateResult> => {
  const pluginRoot = path.join(pluginsRoot, directoryName);
  const manifestPath = path.join(pluginRoot, 'plugin.json');
  const srcRoot = path.join(pluginRoot, 'src');
  const indexPath = path.join(pluginRoot, 'src', 'index.ts');
  const readmePath = path.join(pluginRoot, 'README.md');

  const issues: PluginValidationIssue[] = [];
  const packagedRuntimeMode = isPackagedRuntimeArtifactMode();
  const [manifestExists, _srcRootExists, indexExists, readmeExists] =
    await Promise.all([
      exists(manifestPath),
      exists(srcRoot),
      exists(indexPath),
      exists(readmePath),
    ]);

  const artifactsUnavailableInPackagedRuntime =
    packagedRuntimeMode && manifestExists && !indexExists && !readmeExists;

  if (artifactsUnavailableInPackagedRuntime) {
    issues.push({
      severity: 'warning',
      path: 'contractGate.artifactsUnavailable',
      message:
        'Plugin source artifacts are unavailable in packaged runtime (missing src/index.ts and README.md). Contract gate checks are non-blocking in this environment.',
    });
  }

  if (!indexExists && !artifactsUnavailableInPackagedRuntime) {
    issues.push({
      severity: 'error',
      path: 'contractGate.entrypoint',
      message: `Missing required entrypoint: plugins/${directoryName}/src/index.ts`,
    });
  }

  if (!readmeExists && !artifactsUnavailableInPackagedRuntime) {
    issues.push({
      severity: 'error',
      path: 'contractGate.readme',
      message: `Missing required docs: plugins/${directoryName}/README.md (must include UI Ownership, Usage, and Verification sections).`,
    });
  }

  const runtimeRegisteredComponentIds = new Set<string>(
    explicitRuntimeRegistrations ?? []
  );

  if (indexExists) {
    try {
      const indexSource = await readFile(indexPath, 'utf8');
      for (const componentId of extractRuntimeRegisteredComponentIds(
        indexSource
      )) {
        runtimeRegisteredComponentIds.add(componentId);
      }

      const disallowedEntrypointImports =
        extractDisallowedEntrypointComponentImports(indexSource);
      if (disallowedEntrypointImports.length > 0) {
        issues.push({
          severity: 'error',
          path: 'contractGate.entrypointOwnership',
          message: `plugins/${directoryName}/src/index.ts must render plugin UI from plugin-local modules (./components/*). Move imports ${disallowedEntrypointImports
            .map((value) => `"${value}"`)
            .join(
              ', '
            )} into plugins/${directoryName}/src/components and keep only shared primitives under src/components/plugins.`,
        });
      }
    } catch {
      // Keep existing issues focused on contract violations.
    }
  }

  if (!artifactsUnavailableInPackagedRuntime) {
    for (const declaredComponent of extractDeclaredComponentIds(manifest)) {
      const expectedComponentPath = path.join(
        pluginRoot,
        'src',
        'components',
        toComponentFileName(declaredComponent.componentId)
      );

      const expectedComponentExists = await exists(expectedComponentPath);

      if (
        !expectedComponentExists &&
        !runtimeRegisteredComponentIds.has(declaredComponent.componentId)
      ) {
        issues.push({
          severity: 'error',
          path: declaredComponent.path,
          message: `Extension "${declaredComponent.extensionId}" declares component "${declaredComponent.componentId}" but no file exists at plugins/${directoryName}/src/components/${toComponentFileName(
            declaredComponent.componentId
          )} and no explicit runtime registration was found in src/index.ts.`,
        });
      }
    }

    const repoRoot = path.dirname(pluginsRoot);
    for (const requiredState of manifest.uiContract?.requiredUxStates ?? []) {
      const criterion = UX_STATE_EVIDENCE_CRITERIA[requiredState];
      if (!criterion) {
        issues.push({
          severity: 'error',
          path: 'uiContract.requiredUxStates',
          message: `Unknown UX state "${requiredState}". Supported states: loading, error, empty, destructive.`,
        });
        continue;
      }
      const evidencePath = `maturity.evidence.uxCriteria.${criterion}`;
      const evidence = manifest.maturity?.evidence?.uxCriteria?.[criterion];

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

        const resolvedReference = path.resolve(repoRoot, reference);
        const relativeReference = path.relative(repoRoot, resolvedReference);
        if (
          relativeReference.startsWith('..') ||
          path.isAbsolute(relativeReference)
        ) {
          issues.push({
            severity: 'error',
            path: referencePath,
            message: `Evidence path "${reference}" must resolve within the repository.`,
          });
          continue;
        }

        try {
          const evidenceStat = await stat(resolvedReference);
          if (!evidenceStat.isFile()) {
            throw new Error('not a file');
          }
        } catch {
          issues.push({
            severity: 'error',
            path: referencePath,
            message: `Evidence test file does not exist: ${reference}`,
          });
        }
      }
    }
  }

  if (readmeExists) {
    try {
      const readmeContent = await readFile(readmePath, 'utf8');
      if (!hasRequiredReadmeSections(readmeContent)) {
        issues.push({
          severity: 'error',
          path: 'contractGate.readme',
          message:
            'README.md must include "UI Ownership", "Usage", and "Verification" sections.',
        });
      }
    } catch {
      issues.push({
        severity: 'error',
        path: 'contractGate.readme',
        message:
          'README.md could not be read. Ensure the file is present and includes "UI Ownership", "Usage", and "Verification" sections.',
      });
    }
  }

  return {
    isValid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
};
