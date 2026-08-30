import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type PluginUiMigrationRow,
  scanPluginUiMigration,
} from '@/lib/plugins/ui-migration';

const regenerationCommand = 'npm run plugin:ui-migration:regenerate';

const main = async () => {
  const artifactPath = path.join(
    process.cwd(),
    'docs',
    'plugin-ui-migration-scorecards.json'
  );
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as {
    plugins: PluginUiMigrationRow[];
  };
  const expected = new Map(artifact.plugins.map((row) => [row.id, row]));
  const actual = new Map(
    (await scanPluginUiMigration()).map((row) => [row.id, row])
  );
  const drift: string[] = [];

  for (const pluginId of new Set([...expected.keys(), ...actual.keys()])) {
    const published = expected.get(pluginId);
    const scanned = actual.get(pluginId);
    if (!published) {
      drift.push(`${pluginId}: missing from committed artifact`);
      continue;
    }
    if (!scanned) {
      drift.push(`${pluginId}: no longer exists in plugin scan`);
      continue;
    }

    for (const field of Object.keys(scanned) as Array<
      keyof PluginUiMigrationRow
    >) {
      if (JSON.stringify(published[field]) !== JSON.stringify(scanned[field])) {
        drift.push(
          `${pluginId}.${field}: committed=${JSON.stringify(published[field])} current=${JSON.stringify(scanned[field])}`
        );
      }
    }
  }

  if (drift.length > 0) {
    throw new Error(
      `Plugin UI migration artifact is stale:\n- ${drift.join('\n- ')}\nRegenerate it with: ${regenerationCommand}`
    );
  }

  console.log(
    'Plugin UI migration artifact is consistent with plugin sources.'
  );
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
