import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import publishedArtifact from '../../../docs/plugin-ui-migration-scorecards.json';
import {
  type PluginUiMigrationRow,
  scanPluginUiMigration,
} from '@/lib/plugins/ui-migration';

const pluginsRoot = path.join(process.cwd(), 'plugins');

const expectedRows = (
  publishedArtifact as { plugins: PluginUiMigrationRow[] }
).plugins.sort((a, b) => a.id.localeCompare(b.id));

test('published plugin UI migration artifact matches current plugin entrypoint usage', async () => {
  let actualRows;
  try {
    actualRows = (await scanPluginUiMigration(pluginsRoot)).sort((a, b) =>
      a.id.localeCompare(b.id)
    );
  } catch (error) {
    throw new Error(
      `Failed to scan plugin UI migration: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  assert.deepEqual(actualRows, expectedRows);
});
