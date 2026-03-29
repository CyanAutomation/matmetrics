import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { scorePluginMaturity } from '@/lib/plugins/maturity';
import type { PluginManifest } from '@/lib/plugins/types';
import { validatePluginManifest } from '@/lib/plugins/validate';
import githubSyncManifest from '../plugins/github-sync/plugin.json';
import promptSettingsManifest from '../plugins/prompt-settings/plugin.json';
import tagManagerManifest from '../plugins/tag-manager/plugin.json';

type PluginId = 'tag-manager' | 'github-sync' | 'prompt-settings';

type ScoreArtifactRow = {
  id: PluginId;
  score: number;
  tier: string;
  declaredTier?: string;
  manifestLastReviewedAt?: string;
  manifestEvidenceHash: string;
};

type ScoreArtifact = {
  generatedAt: string;
  generator: string;
  sourceEntrypoint: string;
  cacheKey: string;
  plugins: ScoreArtifactRow[];
};

const pluginManifests: Record<PluginId, unknown> = {
  'tag-manager': tagManagerManifest,
  'github-sync': githubSyncManifest,
  'prompt-settings': promptSettingsManifest,
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

const buildArtifact = async (): Promise<ScoreArtifact> => {
  const pluginsRoot = path.join(process.cwd(), 'plugins');

  const plugins = (
    await Promise.all(
      (Object.entries(pluginManifests) as Array<[PluginId, unknown]>).map(
        async ([pluginId, manifest]) => {
          const validation = validatePluginManifest(manifest);
          if (!validation.isValid) {
            throw new Error(
              `Cannot score ${pluginId}; manifest validation failed: ${validation.issues
                .map((issue) => issue.message)
                .join(', ')}`
            );
          }

          const scorecard = await scorePluginMaturity({
            manifest: validation.manifest as PluginManifest,
            validationIssues: validation.issues,
            pluginDirectoryName: pluginId,
            pluginsRoot,
          });

          return {
            id: pluginId,
            score: scorecard.score,
            tier: scorecard.tier,
            declaredTier: scorecard.declaredTier,
            manifestLastReviewedAt:
              validation.manifest.maturity?.lastReviewedAt ?? undefined,
            manifestEvidenceHash: await digest(
              validation.manifest.maturity ?? null
            ),
          } satisfies ScoreArtifactRow;
        }
      )
    )
  ).sort((a, b) => a.id.localeCompare(b.id));

  const cacheKey = await digest(
    plugins.map((plugin) => ({
      id: plugin.id,
      score: plugin.score,
      tier: plugin.tier,
      declaredTier: plugin.declaredTier,
      manifestEvidenceHash: plugin.manifestEvidenceHash,
    }))
  );

  return {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/regenerate-plugin-maturity-scorecards.ts',
    sourceEntrypoint: 'src/app/api/plugins/list/route.ts',
    cacheKey,
    plugins,
  };
};

const main = async () => {
  const artifactPath = path.join(
    process.cwd(),
    'docs',
    'plugin-maturity-scorecards.json'
  );
  const artifact = await buildArtifact();
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(`${artifactPath}`, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote ${artifactPath}`);
  console.log(`cacheKey=${artifact.cacheKey}`);
};

void main();
