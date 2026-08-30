import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanPluginUiMigration } from '@/lib/plugins/ui-migration';

const withPlugins = async (
  fixtures: Record<string, Record<string, string>>,
  assertion: (pluginsRoot: string) => Promise<void>
) => {
  const repoRoot = await mkdtemp(
    path.join(os.tmpdir(), 'plugin-ui-migration-')
  );
  const pluginsRoot = path.join(repoRoot, 'plugins');
  await mkdir(pluginsRoot);
  try {
    for (const [plugin, files] of Object.entries(fixtures)) {
      for (const [file, contents] of Object.entries(files)) {
        const target = path.join(pluginsRoot, plugin, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, contents);
      }
    }
    await assertion(pluginsRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

test('reports a plugin using every shared primitive as migrated', async () => {
  await withPlugins(
    {
      complete: {
        'src/index.ts': `
          import '@/components/plugins/plugin-page-shell';
          import '@/components/plugins/plugin-state';
          import '@/components/plugins/plugin-confirmation';
        `,
      },
    },
    async (root) => {
      const [row] = await scanPluginUiMigration(root);
      assert.equal(row.status, 'migrated');
      assert.equal(row.score, row.maxScore);
      assert.deepEqual(row.missing, []);
      assert.deepEqual(row.diagnostics, []);
    }
  );
});

test('reports missing primitives for a partially migrated plugin', async () => {
  await withPlugins(
    {
      partial: {
        'src/index.ts': `import '@/components/plugins/plugin-state';`,
      },
    },
    async (root) => {
      const [row] = await scanPluginUiMigration(root);
      assert.equal(row.status, 'partially-migrated');
      assert.deepEqual(row.checks, {
        sharedShell: false,
        sharedState: true,
        sharedDestructiveConfirmation: false,
      });
      assert.deepEqual(row.missing, [
        'sharedShell',
        'sharedDestructiveConfirmation',
      ]);
      assert.deepEqual(row.diagnostics, []);
    }
  );
});

test('reports an unresolved rendered component as malformed', async () => {
  await withPlugins(
    {
      broken: {
        'src/index.ts': `import Missing from './Missing';\nReact.createElement(Missing);`,
      },
    },
    async (root) => {
      const [row] = await scanPluginUiMigration(root);
      assert.equal(row.status, 'malformed');
      assert.equal(row.diagnostics.length, 1);
      assert.match(row.diagnostics[0], /Missing.*could not be resolved/);
    }
  );
});

test('reports a plugin directory without an entrypoint', async () => {
  await withPlugins(
    { empty: { 'README.md': '# Empty plugin' } },
    async (root) => {
      const [row] = await scanPluginUiMigration(root);
      assert.equal(row.status, 'absent-entrypoint');
      assert.equal(row.score, 0);
      assert.deepEqual(row.uiEntrypoints, []);
      assert.match(row.diagnostics[0], /entrypoint could not be read/i);
    }
  );
});
