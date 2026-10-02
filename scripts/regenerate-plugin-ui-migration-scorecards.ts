import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { scanPluginUiMigration } from '@/lib/plugins/ui-migration';
import { digestStableArtifact } from './stable-artifact';

type PluginUiMigrationArtifact = {
  generatedAt: string;
  generator: string;
  sourceEntrypoint: string;
  cacheKey: string;
  plugins: Awaited<ReturnType<typeof scanPluginUiMigration>>;
};

const buildArtifact = async (): Promise<PluginUiMigrationArtifact> => {
  let plugins: Awaited<ReturnType<typeof scanPluginUiMigration>>;
  try {
    plugins = await scanPluginUiMigration();
  } catch (error) {
    console.error('Failed to scan plugin UI migration:', error);
    throw error;
  }
  const cacheKey = await digestStableArtifact(
    plugins.map((plugin) => ({
      id: plugin.id,
      score: plugin.score,
      maxScore: plugin.maxScore,
      checks: plugin.checks,
      missing: plugin.missing,
      status: plugin.status,
      diagnostics: plugin.diagnostics,
    }))
  );

  return {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/regenerate-plugin-ui-migration-scorecards.ts',
    sourceEntrypoint: 'plugins/*/src/index.ts',
    cacheKey,
    plugins,
  };
};

const main = async () => {
  try {
    const artifactPath = path.join(
      process.cwd(),
      'docs',
      'plugin-ui-migration-scorecards.json'
    );
    const artifact = await buildArtifact();
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(
      `${artifactPath}`,
      `${JSON.stringify(artifact, null, 2)}\n`
    );
    console.log(`Wrote ${artifactPath}`);
    console.log(`cacheKey=${artifact.cacheKey}`);
  } catch (error) {
    console.error(
      'Failed to regenerate plugin UI migration scorecards:',
      error
    );
    process.exit(1);
  }
};

void main();
