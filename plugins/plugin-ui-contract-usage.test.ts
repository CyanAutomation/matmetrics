import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

type PluginUiSourceContract = {
  pluginId: string;
  sourcePath: string;
  requiredTokens: string[];
  oneOfRequiredTokenGroups?: string[][];
  oneOfTokens?: string[];
};

const corePluginContracts: PluginUiSourceContract[] = [
  {
    pluginId: 'github-sync',
    sourcePath: 'src/components/github-settings.tsx',
    requiredTokens: [
      'PluginEmptyState',
      'PluginDestructiveAction',
      'PluginLoadingState',
    ],
    oneOfTokens: [
      'PluginErrorState',
      'PluginLoadingState',
      'PluginSuccessState',
    ],
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
    requiredTokens: ['PluginConfirmationDialog', 'PluginLoadingState'],
    oneOfRequiredTokenGroups: [['PluginEmptyState', 'PluginTableSection']],
  },
  {
    pluginId: 'video-library',
    sourcePath: 'src/components/video-library.tsx',
    requiredTokens: ['PluginDestructiveAction', 'PluginLoadingState'],
    oneOfRequiredTokenGroups: [['PluginEmptyState', 'PluginTableSection']],
  },
  {
    pluginId: 'log-doctor',
    sourcePath: 'plugins/log-doctor/src/components/log-doctor.tsx',
    requiredTokens: ['PluginConfirmationDialog', 'PluginDestructiveAction'],
    oneOfRequiredTokenGroups: [['PluginEmptyState', 'PluginTableSection']],
  },
];

const buildTokenPattern = (token: string) =>
  new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\b`);

for (const contract of corePluginContracts) {
  test(`${contract.pluginId} uses standardized plugin state helpers`, () => {
    const source = readFileSync(
      path.join(repoRoot, contract.sourcePath),
      'utf8'
    );

    for (const token of contract.requiredTokens) {
      const tokenPattern = buildTokenPattern(token);
      assert.equal(
        tokenPattern.test(source),
        true,
        `[${contract.pluginId}] expected standardized helper ${token} in ${contract.sourcePath}`
      );
    }

    if (contract.oneOfRequiredTokenGroups) {
      for (const group of contract.oneOfRequiredTokenGroups) {
        assert.equal(
          group.some((token) => buildTokenPattern(token).test(source)),
          true,
          `[${contract.pluginId}] expected at least one standardized helper from: ${group.join(', ')}`
        );
      }
    }

    if (contract.oneOfTokens && contract.oneOfTokens.length > 0) {
      assert.equal(
        contract.oneOfTokens.some((token) =>
          buildTokenPattern(token).test(source)
        ),
        true,
        `[${contract.pluginId}] expected at least one standardized helper from: ${contract.oneOfTokens.join(', ')}`
      );
    }
  });
}

test('required helper contract check fails when helper is missing', () => {
  const simulatedSource = `
    import { PluginEmptyState } from '@/components/plugins/plugin-state';

    export function MissingHelperFixture() {
      return <PluginEmptyState title="Only empty state" />;
    }
  `;

  const requiredTokens = ['PluginEmptyState', 'PluginDestructiveAction'];

  const missingTokens = requiredTokens.filter(
    (token) => !buildTokenPattern(token).test(simulatedSource)
  );

  assert.deepEqual(missingTokens, ['PluginDestructiveAction']);
});
