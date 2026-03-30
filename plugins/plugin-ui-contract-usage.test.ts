import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

type PluginUiSourceContract = {
  pluginId: string;
  sourcePath: string;
  requiredTokens: string[];
  oneOfTokens?: string[];
};

const corePluginContracts: PluginUiSourceContract[] = [
  {
    pluginId: 'github-sync',
    sourcePath: 'src/components/github-settings.tsx',
    requiredTokens: ['PluginEmptyState', 'PluginDestructiveAction'],
    oneOfTokens: ['PluginErrorState', 'PluginLoadingState'],
  },
  {
    pluginId: 'prompt-settings',
    sourcePath: 'src/components/prompt-settings.tsx',
    requiredTokens: [
      'PluginLoadingState',
      'PluginErrorState',
      'PluginEmptyState',
      'PluginConfirmationDialog',
    ],
  },
  {
    pluginId: 'tag-manager',
    sourcePath: 'src/components/tag-manager.tsx',
    requiredTokens: ['PluginEmptyState', 'PluginConfirmationDialog'],
  },
  {
    pluginId: 'video-library',
    sourcePath: 'src/components/video-library.tsx',
    requiredTokens: ['PluginEmptyState', 'PluginDestructiveAction'],
  },
  {
    pluginId: 'log-doctor',
    sourcePath: 'plugins/log-doctor/src/components/log-doctor.tsx',
    requiredTokens: [
      'PluginEmptyState',
      'PluginConfirmationDialog',
      'PluginDestructiveAction',
    ],
  },
];

for (const contract of corePluginContracts) {
  test(`${contract.pluginId} uses standardized plugin state helpers`, () => {
    const source = readFileSync(
      path.join(repoRoot, contract.sourcePath),
      'utf8'
    );

    for (const token of contract.requiredTokens) {
      assert.equal(
        source.includes(token),
        true,
        `[${contract.pluginId}] expected standardized helper ${token} in ${contract.sourcePath}`
      );
    }

    if (contract.oneOfTokens && contract.oneOfTokens.length > 0) {
      assert.equal(
        contract.oneOfTokens.some((token) => source.includes(token)),
        true,
        `[${contract.pluginId}] expected at least one standardized helper from: ${contract.oneOfTokens.join(', ')}`
      );
    }
  });
}
