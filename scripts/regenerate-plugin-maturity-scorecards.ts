import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  digestStableArtifact,
  serializeStableArtifact,
} from './stable-artifact';
import { scorePluginMaturity } from '@/lib/plugins/maturity';
import type { PluginManifest } from '@/lib/plugins/types';
import { validatePluginManifest } from '@/lib/plugins/validate';
import githubSyncManifest from '../plugins/github-sync/plugin.json';
import logDoctorManifest from '../plugins/log-doctor/plugin.json';
import promptSettingsManifest from '../plugins/prompt-settings/plugin.json';
import tagManagerManifest from '../plugins/tag-manager/plugin.json';
import videoLibraryManifest from '../plugins/video-library/plugin.json';
import sessionTypesManifest from '../plugins/session-types/plugin.json';

type PluginId =
  | 'tag-manager'
  | 'github-sync'
  | 'log-doctor'
  | 'prompt-settings'
  | 'video-library'
  | 'session-types';

type ScoreArtifactRow = {
  id: PluginId;
  score: number;
  tier: string;
  declaredTier?: string;
  manifestLastReviewedAt?: string;
  manifestEvidenceHash: string;
};

export type ScoreArtifact = {
  generatedAt: string;
  generator: string;
  sourceEntrypoint: string;
  cacheKey: string;
  plugins: ScoreArtifactRow[];
};

const pluginManifests: Record<PluginId, unknown> = {
  'tag-manager': tagManagerManifest,
  'github-sync': githubSyncManifest,
  'log-doctor': logDoctorManifest,
  'prompt-settings': promptSettingsManifest,
  'video-library': videoLibraryManifest,
  'session-types': sessionTypesManifest,
};

/** Canonical serialization used for both artifact output and freshness checks. */
export const serializeScoreArtifact = (value: unknown): string =>
  serializeStableArtifact(value);

export const buildScoreArtifact = async (
  generatedAt = new Date().toISOString()
): Promise<ScoreArtifact> => {
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
            manifestEvidenceHash: await digestStableArtifact(
              validation.manifest.maturity ?? null
            ),
          } satisfies ScoreArtifactRow;
        }
      )
    )
  ).sort((a, b) => a.id.localeCompare(b.id));

  const cacheKey = await digestStableArtifact(
    plugins.map((plugin) => ({
      id: plugin.id,
      score: plugin.score,
      tier: plugin.tier,
      declaredTier: plugin.declaredTier,
      manifestEvidenceHash: plugin.manifestEvidenceHash,
    }))
  );

  return {
    generatedAt,
    generator: 'scripts/regenerate-plugin-maturity-scorecards.ts',
    sourceEntrypoint: 'src/app/api/plugins/list/route.ts',
    cacheKey,
    plugins,
  };
};

const formatFieldDiff = (
  expected: unknown,
  actual: unknown,
  field = '$'
): string[] => {
  if (Object.is(expected, actual)) return [];

  if (
    expected &&
    actual &&
    typeof expected === 'object' &&
    typeof actual === 'object'
  ) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = new Set([
      ...Object.keys(expectedRecord),
      ...Object.keys(actualRecord),
    ]);
    return [...keys]
      .sort()
      .flatMap((key) =>
        formatFieldDiff(
          expectedRecord[key],
          actualRecord[key],
          Array.isArray(expected) || Array.isArray(actual)
            ? `${field}[${key}]`
            : `${field}.${key}`
        )
      );
  }

  return [
    `${field}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  ];
};

export const checkPublishedScoreArtifact = async (
  artifactPath: string
): Promise<void> => {
  const published = JSON.parse(
    await readFile(artifactPath, 'utf8')
  ) as ScoreArtifact;
  const generated = await buildScoreArtifact(published.generatedAt);

  if (serializeScoreArtifact(published) === serializeScoreArtifact(generated)) {
    console.log(`Verified ${artifactPath}`);
    return;
  }

  const diff = formatFieldDiff(published, generated);
  throw new Error(
    `Published maturity scorecard is stale:\n${diff
      .map((line) => `- ${line}`)
      .join('\n')}\nRegenerate it with: npm run plugin:maturity:regenerate`
  );
};

const main = async () => {
  const artifactPath = path.join(
    process.cwd(),
    'docs',
    'plugin-maturity-scorecards.json'
  );
  if (process.argv.includes('--check')) {
    await checkPublishedScoreArtifact(artifactPath);
    return;
  }

  const artifact = await buildScoreArtifact();
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, serializeScoreArtifact(artifact));
  console.log(`Wrote ${artifactPath}`);
  console.log(`cacheKey=${artifact.cacheKey}`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
