import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { scanPluginUiMigration } from '@/lib/plugins/ui-migration';

type PluginUiMigrationArtifact = {
  generatedAt: string;
  generator: string;
  sourceEntrypoint: string;
  cacheKey: string;
  plugins: Awaited<ReturnType<typeof scanPluginUiMigration>>;
};

const stableNormalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, [key, nestedValue]) => {
        acc[key] = stableNormalize(nestedValue);
        return acc;
      }, {});
  }

  return value;
};

const digest = async (value: unknown): Promise<string> => {
  const normalized = JSON.stringify(stableNormalize(value));
  const bytes = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const buildArtifact = async (): Promise<PluginUiMigrationArtifact> => {
  const plugins = await scanPluginUiMigration();
  const cacheKey = await digest(
    plugins.map((plugin) => ({
      id: plugin.id,
      score: plugin.score,
      maxScore: plugin.maxScore,
      checks: plugin.checks,
      missing: plugin.missing,
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
    await writeFile(`${artifactPath}`, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`Wrote ${artifactPath}`);
    console.log(`cacheKey=${artifact.cacheKey}`);
  } catch (error) {
    console.error('Failed to regenerate plugin UI migration scorecards:', error);
    process.exit(1);
  }
};

void main();
