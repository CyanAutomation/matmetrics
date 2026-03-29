import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { scorePluginMaturity } from '@/lib/plugins/maturity';
import { validatePluginManifest } from '@/lib/plugins/validate';
import maturityScorecards from '../../../docs/plugin-maturity-scorecards.json';
import githubSyncManifest from '../../../plugins/github-sync/plugin.json';
import promptSettingsManifest from '../../../plugins/prompt-settings/plugin.json';
import tagManagerManifest from '../../../plugins/tag-manager/plugin.json';

type PluginId = 'tag-manager' | 'github-sync' | 'prompt-settings';

type PublishedScorecardRow = {
  id: PluginId;
  score: number;
  tier: string;
  declaredTier?: string;
  manifestLastReviewedAt?: string;
  manifestEvidenceHash: string;
};

const pluginsRoot = path.join(process.cwd(), 'plugins');

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

const pluginFixtures: Record<PluginId, unknown> = {
  'tag-manager': tagManagerManifest,
  'github-sync': githubSyncManifest,
  'prompt-settings': promptSettingsManifest,
};

const expectedRows = (
  maturityScorecards as { plugins: PublishedScorecardRow[] }
).plugins.sort((a, b) => a.id.localeCompare(b.id));

test('published maturity scorecard artifact matches current manifest evidence', async () => {
  const actualRows = (
    await Promise.all(
      (Object.entries(pluginFixtures) as Array<[PluginId, unknown]>).map(
        async ([pluginDirectoryName, manifest]) => {
          const validation = validatePluginManifest(manifest);
          assert.equal(validation.isValid, true);
          if (!validation.isValid) {
            throw new Error(`Invalid manifest for ${pluginDirectoryName}.`);
          }

          const scorecard = await scorePluginMaturity({
            manifest: validation.manifest,
            validationIssues: validation.issues,
            pluginDirectoryName,
            pluginsRoot,
          });

          return {
            id: pluginDirectoryName,
            score: scorecard.score,
            tier: scorecard.tier,
            declaredTier: scorecard.declaredTier,
            manifestLastReviewedAt:
              validation.manifest.maturity?.lastReviewedAt ?? undefined,
            manifestEvidenceHash: await digest(validation.manifest.maturity),
          } satisfies PublishedScorecardRow;
        }
      )
    )
  ).sort((a, b) => a.id.localeCompare(b.id));

  assert.deepEqual(actualRows, expectedRows);
});
