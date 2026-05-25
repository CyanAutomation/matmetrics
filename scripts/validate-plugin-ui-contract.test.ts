import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  computePrimitiveUsage,
  discoverPluginManifests,
  resolvePluginComponentEntrypoints,
  verifyComponentRequirements,
  type RequirementKey,
} from './validate-plugin-ui-contract';

const fixtureRoot = path.join(
  process.cwd(),
  'scripts',
  '__fixtures__',
  'validate-plugin-ui-contract'
);

const withTempFixtureRoot = async <T>(
  fixtureName: string,
  run: (root: string) => Promise<T>
): Promise<T> => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plugin-contract-'));
  try {
    const source = path.join(fixtureRoot, fixtureName);
    const target = path.join(tempDir, 'plugins');
    await import('node:fs/promises').then(({ cp }) =>
      cp(source, target, { recursive: true })
    );
    return await run(target);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

test('manifest discovery from fixture directories', async () => {
  await withTempFixtureRoot('manifests', async (pluginsRoot) => {
    const manifests = await discoverPluginManifests(pluginsRoot);
    assert.deepEqual(manifests, [
      path.join(pluginsRoot, 'plugin-a', 'plugin.json'),
      path.join(pluginsRoot, 'plugin-b', 'plugin.json'),
    ]);
  });
});

test('entrypoint resolution supports .ts/.tsx and /index variants', async () => {
  await withTempFixtureRoot('entrypoints', async (pluginsRoot) => {
    const pluginIndexPath = path.join(pluginsRoot, 'entrypoint-plugin', 'src', 'index.ts');
    const resolved = await resolvePluginComponentEntrypoints(pluginIndexPath, [
      'tab-ts',
      'tab-tsx',
      'tab-index',
    ]);

    assert.deepEqual(
      Object.fromEntries(resolved.entries()),
      {
        'tab-index': path.join(pluginsRoot, 'entrypoint-plugin', 'src', 'components', 'index-variant', 'index.tsx'),
        'tab-ts': path.join(pluginsRoot, 'entrypoint-plugin', 'src', 'components', 'ts-component.ts'),
        'tab-tsx': path.join(pluginsRoot, 'entrypoint-plugin', 'src', 'components', 'tsx-component.tsx'),
      }
    );
  });
});

test('import graph traversal handles cycles while detecting required primitives', async () => {
  const cycleFixture = path.join(
    fixtureRoot,
    'import-cycle',
    'cycle-plugin',
    'src',
    'components',
    'dashboard.tsx'
  );
  const usage = await computePrimitiveUsage(cycleFixture);

  const expected: Record<RequirementKey, boolean> = {
    singleTopLevelPageShell: true,
    primaryContentSections: true,
    loadingState: true,
    errorState: true,
    emptyState: true,
    successState: false,
    destructiveConfirmation: false,
  };

  assert.deepEqual(usage, expected);
});

test('requirement verification returns exact failure payload shape', async () => {
  const usage: Record<RequirementKey, boolean> = {
    singleTopLevelPageShell: true,
    primaryContentSections: false,
    loadingState: true,
    errorState: false,
    emptyState: false,
    successState: false,
    destructiveConfirmation: false,
  };

  const violations = verifyComponentRequirements({
    pluginId: 'demo-plugin',
    componentId: 'dashboard-main',
    usage,
    requiredChecks: ['primaryContentSections', 'errorState'],
  });

  assert.deepEqual(violations, [
    {
      pluginId: 'demo-plugin',
      componentId: 'dashboard-main',
      requirement: 'primaryContentSections',
      message:
        'Dashboard component must group primary content into PluginFormSection, PluginTableSection, or PluginSectionCard',
    },
    {
      pluginId: 'demo-plugin',
      componentId: 'dashboard-main',
      requirement: 'errorState',
      message: 'Missing required error state helper (PluginErrorState)',
    },
  ]);
});
