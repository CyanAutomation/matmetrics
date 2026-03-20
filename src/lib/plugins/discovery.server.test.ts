import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';

const validManifest = {
  id: 'tag-manager',
  name: 'Tag Manager Plugin',
  version: '1.0.0',
  description: 'Provides a dashboard tab for managing tags.',
  enabled: true,
  capabilities: ['tag_mutation'],
  uiExtensions: [
    {
      type: 'dashboard_tab',
      id: 'tag-manager-dashboard-tab',
      title: 'Tag Manager',
      config: {
        tabId: 'tag-manager',
        headerTitle: 'Manage Tags',
        icon: 'tags',
        component: 'tag_manager',
      },
    },
  ],
};

async function withTempPluginsRoot(
  setup: (pluginsRoot: string) => Promise<void>,
  run: (pluginsRoot: string) => Promise<void>
) {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'matmetrics-plugin-discovery-')
  );
  const pluginsRoot = path.join(repoRoot, 'plugins');

  try {
    await mkdir(pluginsRoot, { recursive: true });
    await setup(pluginsRoot);
    await run(pluginsRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

test('discoverEnabledDashboardTabExtensions returns empty list when no plugins exist', async () => {
  await withTempPluginsRoot(
    async () => {},
    async (pluginsRoot) => {
      const extensions = await discoverEnabledDashboardTabExtensions({
        pluginsRoot,
      });
      assert.deepEqual(extensions, []);
    }
  );
});

test('discoverEnabledDashboardTabExtensions returns one extension for one valid plugin', async () => {
  await withTempPluginsRoot(
    async (pluginsRoot) => {
      await mkdir(path.join(pluginsRoot, 'tag-manager'), { recursive: true });
      await writeFile(
        path.join(pluginsRoot, 'tag-manager', 'plugin.json'),
        `${JSON.stringify(validManifest, null, 2)}\n`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const extensions = await discoverEnabledDashboardTabExtensions({
        pluginsRoot,
      });
      assert.equal(extensions.length, 1);
      assert.equal(extensions[0]?.pluginId, 'tag-manager');
      assert.equal(extensions[0]?.extension.config.tabId, 'tag-manager');
    }
  );
});

test('discoverEnabledDashboardTabExtensions skips invalid plugin manifests', async () => {
  await withTempPluginsRoot(
    async (pluginsRoot) => {
      await mkdir(path.join(pluginsRoot, 'broken-plugin'), { recursive: true });
      await writeFile(
        path.join(pluginsRoot, 'broken-plugin', 'plugin.json'),
        JSON.stringify({
          id: 'broken-plugin',
          enabled: true,
          uiExtensions: [],
        }),
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const extensions = await discoverEnabledDashboardTabExtensions({
        pluginsRoot,
      });
      assert.deepEqual(extensions, []);
    }
  );
});

test('discoverEnabledDashboardTabExtensions ignores disabled plugins', async () => {
  await withTempPluginsRoot(
    async (pluginsRoot) => {
      await mkdir(path.join(pluginsRoot, 'disabled-plugin'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'disabled-plugin', 'plugin.json'),
        `${JSON.stringify({ ...validManifest, id: 'disabled-plugin', enabled: false }, null, 2)}\n`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const extensions = await discoverEnabledDashboardTabExtensions({
        pluginsRoot,
      });
      assert.deepEqual(extensions, []);
    }
  );
});
