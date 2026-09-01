import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

type TemporaryTree = Record<string, string | null>;

const createTemporaryTree = async (
  root: string,
  tree: TemporaryTree
): Promise<void> => {
  for (const [relativePath, content] of Object.entries(tree)) {
    const target = path.join(root, relativePath);
    if (content === null) {
      await mkdir(target, { recursive: true });
      continue;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
};

test('manifest discovery follows repository plugin layout semantics', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'plugin-contract-'));
  const cases: Array<{
    name: string;
    tree?: TemporaryTree;
    expected?: string[];
    missingRoot?: boolean;
  }> = [
    {
      name: 'valid plugin manifests',
      tree: {
        'plugin-a/plugin.json': '{"id":"plugin-a"}',
        'plugin-b/plugin.json': '{"id":"plugin-b"}',
      },
      expected: ['plugin-a/plugin.json', 'plugin-b/plugin.json'],
    },
    {
      name: 'non-plugin JSON files',
      tree: {
        'plugin-a/package.json': '{"name":"plugin-a"}',
        'repository-metadata.json': '{}',
      },
      expected: [],
    },
    {
      name: 'nested manifests',
      tree: {
        'group/plugin-a/plugin.json': '{"id":"plugin-a"}',
      },
      expected: [],
    },
    {
      name: 'files instead of directories',
      tree: {
        'plugin-a': 'not a directory',
        'plugin-b/plugin.json/contents.json': '{}',
      },
      expected: [],
    },
    {
      name: 'malformed manifests are still discovery candidates',
      tree: {
        'plugin-a/plugin.json': '{not valid json',
      },
      expected: ['plugin-a/plugin.json'],
    },
    {
      name: 'missing plugin root',
      missingRoot: true,
    },
    {
      name: 'deterministic result ordering',
      tree: {
        'z-last/plugin.json': '{"id":"z-last"}',
        'a-first/plugin.json': '{"id":"a-first"}',
        'm-middle/plugin.json': '{"id":"m-middle"}',
      },
      expected: [
        'a-first/plugin.json',
        'm-middle/plugin.json',
        'z-last/plugin.json',
      ],
    },
  ];

  try {
    for (const testCase of cases) {
      await test(testCase.name, async () => {
        const pluginsRoot = path.join(tempDir, testCase.name);
        if (testCase.missingRoot) {
          await assert.rejects(
            discoverPluginManifests(pluginsRoot),
            (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
          );
          return;
        }

        await mkdir(pluginsRoot, { recursive: true });
        await createTemporaryTree(pluginsRoot, testCase.tree ?? {});

        const manifests = await discoverPluginManifests(pluginsRoot);
        assert.deepEqual(
          manifests.map((manifest) =>
            path.relative(pluginsRoot, manifest).split(path.sep).join('/')
          ),
          testCase.expected
        );
      });
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('entrypoint resolution supports .ts/.tsx and /index variants', async () => {
  await withTempFixtureRoot('entrypoints', async (pluginsRoot) => {
    const pluginIndexPath = path.join(
      pluginsRoot,
      'entrypoint-plugin',
      'src',
      'index.ts'
    );
    const resolved = await resolvePluginComponentEntrypoints(pluginIndexPath, [
      'tab-ts',
      'tab-tsx',
      'tab-index',
    ]);

    assert.deepEqual(Object.fromEntries(resolved.entries()), {
      'tab-index': path.join(
        pluginsRoot,
        'entrypoint-plugin',
        'src',
        'components',
        'index-variant',
        'index.tsx'
      ),
      'tab-ts': path.join(
        pluginsRoot,
        'entrypoint-plugin',
        'src',
        'components',
        'ts-component.ts'
      ),
      'tab-tsx': path.join(
        pluginsRoot,
        'entrypoint-plugin',
        'src',
        'components',
        'tsx-component.tsx'
      ),
    });
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
