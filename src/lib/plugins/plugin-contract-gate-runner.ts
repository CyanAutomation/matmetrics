import path from 'node:path';

import type {
  PluginManifest,
  PluginValidationIssue,
} from '@/lib/plugins/types';
import {
  discoverContractArtifacts,
  inspectEntrypoint,
  validateDeclaredComponents,
  validateReadme,
  validateRequiredArtifacts,
  validateUxEvidence,
  type ContractGateContext,
} from './plugin-contract-gate-checks';

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
  manifest: Pick<PluginManifest, 'uiExtensions' | 'uiContract' | 'maturity'>;
  explicitRuntimeRegistrations?: ReadonlySet<string>;
}): Promise<PluginContractGateResult> => {
  const context: ContractGateContext = {
    pluginsRoot,
    directoryName,
    manifest,
    explicitRuntimeRegistrations,
  };
  const artifacts = await discoverContractArtifacts(context);
  const issues: PluginValidationIssue[] = [
    ...validateRequiredArtifacts({ directoryName, artifacts }),
  ];

  const entrypoint = await inspectEntrypoint({
    directoryName,
    indexPath: path.join(artifacts.pluginRoot, 'src', 'index.ts'),
    explicitRuntimeRegistrations,
  });
  issues.push(...entrypoint.issues);

  const [componentIssues, evidenceIssues, readmeIssues] = await Promise.all([
    validateDeclaredComponents({
      context,
      artifacts,
      runtimeRegisteredComponentIds: entrypoint.runtimeRegisteredComponentIds,
    }),
    validateUxEvidence({ context, artifacts }),
    validateReadme({
      readmePath: path.join(artifacts.pluginRoot, 'README.md'),
      exists: artifacts.readmeExists,
    }),
  ]);
  issues.push(...componentIssues, ...evidenceIssues, ...readmeIssues);

  return {
    isValid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
};
