import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { type PluginManifest, type PluginValidationIssue } from '@/lib/plugins/types';

const COMPONENT_REGISTRATION_PATTERN =
  /registerPluginComponent(?:\?\.|\.)?\(\s*['\"]([^'\"]+)['\"]/g;

const toComponentFileName = (componentId: string): string =>
  `${componentId.trim().toLowerCase().replace(/_/g, '-')}.tsx`;

const exists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const extractRuntimeRegisteredComponentIds = (source: string): Set<string> => {
  const ids = new Set<string>();

  for (const match of source.matchAll(COMPONENT_REGISTRATION_PATTERN)) {
    const componentId = match[1]?.trim();
    if (componentId) {
      ids.add(componentId);
    }
  }

  return ids;
};

const extractDeclaredComponentIds = (
  manifest: Pick<PluginManifest, 'uiExtensions'>
) =>
  manifest.uiExtensions.flatMap((extension, index) => {
    const maybeComponent =
      'component' in extension.config ? extension.config.component : undefined;

    if (typeof maybeComponent !== 'string' || maybeComponent.trim().length === 0) {
      return [];
    }

    return [
      {
        extensionId: extension.id,
        componentId: maybeComponent,
        path: `uiExtensions[${index}].config.component`,
      },
    ];
  });

const hasRequiredReadmeSections = (content: string): boolean => {
  const usageHeading = /^#{1,6}\s*usage\b/im;
  const verificationHeading = /^#{1,6}\s*verification\b/im;
  return usageHeading.test(content) && verificationHeading.test(content);
};

export type PluginContractGateResult = {
  isValid: boolean;
  issues: PluginValidationIssue[];
};

export const runPluginContractGate = async ({
  pluginsRoot,
  directoryName,
  manifest,
  explicitRuntimeRegistrations,
}: {
  pluginsRoot: string;
  directoryName: string;
  manifest: Pick<PluginManifest, 'uiExtensions'>;
  explicitRuntimeRegistrations?: ReadonlySet<string>;
}): Promise<PluginContractGateResult> => {
  const pluginRoot = path.join(pluginsRoot, directoryName);
  const indexPath = path.join(pluginRoot, 'src', 'index.ts');
  const readmePath = path.join(pluginRoot, 'README.md');

  const issues: PluginValidationIssue[] = [];

  const indexExists = await exists(indexPath);
  if (!indexExists) {
    issues.push({
      severity: 'error',
      path: 'contractGate.entrypoint',
      message: `Missing required entrypoint: plugins/${directoryName}/src/index.ts`,
    });
  }

  const readmeExists = await exists(readmePath);
  if (!readmeExists) {
    issues.push({
      severity: 'error',
      path: 'contractGate.readme',
      message: `Missing required docs: plugins/${directoryName}/README.md (must include Usage and Verification sections).`,
    });
  }

  const runtimeRegisteredComponentIds = new Set<string>(
    explicitRuntimeRegistrations ?? []
  );

  if (indexExists) {
    try {
      const indexSource = await readFile(indexPath, 'utf8');
      for (const componentId of extractRuntimeRegisteredComponentIds(indexSource)) {
        runtimeRegisteredComponentIds.add(componentId);
      }
    } catch {
      // Keep existing issues focused on contract violations.
    }
  }

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

  if (readmeExists) {
    try {
      const readmeContent = await readFile(readmePath, 'utf8');
      if (!hasRequiredReadmeSections(readmeContent)) {
        issues.push({
          severity: 'error',
          path: 'contractGate.readme',
          message:
            'README.md must include both "Usage" and "Verification" sections.',
        });
      }
    } catch {
      issues.push({
        severity: 'error',
        path: 'contractGate.readme',
        message:
          'README.md could not be read. Ensure the file is present and includes "Usage" and "Verification" sections.',
      });
    }
  }

  return {
    isValid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
};
