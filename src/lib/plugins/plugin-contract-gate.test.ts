import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runPluginContractGate } from '@/lib/plugins/plugin-contract-gate';
import { type PluginManifest } from '@/lib/plugins/types';

const createManifest = (component = 'tag_manager'): PluginManifest => ({
  id: 'tags-plugin',
  name: 'Tags Plugin',
  version: '1.0.0',
  description: 'Tag dashboard plugin.',
  enabled: true,
  uiExtensions: [
    {
      type: 'dashboard_tab',
      id: 'tags-dashboard-tab',
      title: 'Tags',
      config: {
        tabId: 'tags',
        headerTitle: 'Tags',
        component,
      },
    },
  ],
});

async function withTempPlugin(
  run: (context: { pluginsRoot: string; directoryName: string }) => Promise<void>
) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'matmetrics-plugin-gate-'));
  const pluginsRoot = path.join(repoRoot, 'plugins');
  const directoryName = 'tags';
  await mkdir(path.join(pluginsRoot, directoryName), { recursive: true });

  try {
    await run({ pluginsRoot, directoryName });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

test('runPluginContractGate passes when entrypoint, component, and README checks succeed', async () => {
  await withTempPlugin(async ({ pluginsRoot, directoryName }) => {
    const pluginRoot = path.join(pluginsRoot, directoryName);

    await mkdir(path.join(pluginRoot, 'src', 'components'), { recursive: true });
    await writeFile(
      path.join(pluginRoot, 'src', 'index.ts'),
      `export function initPlugin() { return undefined; }\n`,
      'utf8'
    );
    await writeFile(
      path.join(pluginRoot, 'src', 'components', 'tag-manager.tsx'),
      'export default function TagManager() { return null; }\n',
      'utf8'
    );
    await writeFile(
      path.join(pluginRoot, 'README.md'),
      '# Tags Plugin\n\n## Usage\n\nUse it.\n\n## Verification\n\nVerify it.\n',
      'utf8'
    );

    const result = await runPluginContractGate({
      pluginsRoot,
      directoryName,
      manifest: createManifest(),
    });

    assert.equal(result.isValid, true);
    assert.deepEqual(result.issues, []);
  });
});

test('runPluginContractGate fails when required files and sections are missing', async () => {
  await withTempPlugin(async ({ pluginsRoot, directoryName }) => {
    const pluginRoot = path.join(pluginsRoot, directoryName);

    await writeFile(
      path.join(pluginRoot, 'README.md'),
      '# Tags Plugin\n\n## Usage\n\nUse it.\n',
      'utf8'
    );

    const result = await runPluginContractGate({
      pluginsRoot,
      directoryName,
      manifest: createManifest('missing_component'),
    });

    assert.equal(result.isValid, false);
    assert.equal(result.issues.some((issue) => issue.path === 'contractGate.entrypoint'), true);
    assert.equal(result.issues.some((issue) => issue.path === 'contractGate.readme'), true);
    assert.equal(
      result.issues.some((issue) => issue.path.includes('config.component')),
      true
    );
  });
});

test('runPluginContractGate accepts explicit runtime registration from src/index.ts', async () => {
  await withTempPlugin(async ({ pluginsRoot, directoryName }) => {
    const pluginRoot = path.join(pluginsRoot, directoryName);

    await mkdir(path.join(pluginRoot, 'src', 'components'), { recursive: true });
    await writeFile(
      path.join(pluginRoot, 'src', 'index.ts'),
      `export function initPlugin(context: { registerPluginComponent: (id: string, renderer: unknown) => void }) {
  context.registerPluginComponent('tag_manager', () => null);
}\n`,
      'utf8'
    );
    await writeFile(
      path.join(pluginRoot, 'README.md'),
      '# Tags Plugin\n\n## Usage\n\nUse it.\n\n## Verification\n\nVerify it.\n',
      'utf8'
    );

    const result = await runPluginContractGate({
      pluginsRoot,
      directoryName,
      manifest: createManifest('tag_manager'),
    });

    assert.equal(result.isValid, true);
    assert.equal(result.issues.length, 0);
  });
});

test('runPluginContractGate emits non-blocking warning when packaged runtime lacks source artifacts', async () => {
  await withTempPlugin(async ({ pluginsRoot, directoryName }) => {
    const pluginRoot = path.join(pluginsRoot, directoryName);
    const previousRuntimeMode = process.env.MATMETRICS_PLUGIN_CONTRACT_RUNTIME_MODE;
    process.env.MATMETRICS_PLUGIN_CONTRACT_RUNTIME_MODE = 'packaged';

    try {
      await writeFile(
        path.join(pluginRoot, 'plugin.json'),
        JSON.stringify(createManifest(), null, 2),
        'utf8'
      );

      const result = await runPluginContractGate({
        pluginsRoot,
        directoryName,
        manifest: createManifest('missing_component'),
      });

      assert.equal(result.isValid, true);
      assert.equal(
        result.issues.some(
          (issue) =>
            issue.path === 'contractGate.artifactsUnavailable' &&
            issue.severity === 'warning'
        ),
        true
      );
      assert.equal(
        result.issues.some((issue) => issue.path === 'contractGate.entrypoint'),
        false
      );
      assert.equal(
        result.issues.some((issue) => issue.path === 'contractGate.readme'),
        false
      );
    } finally {
      if (previousRuntimeMode === undefined) {
        delete process.env.MATMETRICS_PLUGIN_CONTRACT_RUNTIME_MODE;
      } else {
        process.env.MATMETRICS_PLUGIN_CONTRACT_RUNTIME_MODE = previousRuntimeMode;
      }
    }
  });
});
