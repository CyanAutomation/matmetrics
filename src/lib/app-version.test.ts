import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { APP_VERSION } from '@/lib/app-version';
import {
  assertReleaseVersionConsistency,
  parseChangelog,
} from '@/lib/releases';

test('all published version sources agree', async () => {
  const [packageJsonSource, changelogSource] = await Promise.all([
    readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageJsonSource) as { version?: unknown };
  const releases = parseChangelog(changelogSource);
  const latestRelease = releases[0];

  assert.ok(
    latestRelease,
    'Expected CHANGELOG.md to include at least one release.'
  );

  const publishedVersionSources = [
    { source: 'APP_VERSION', version: APP_VERSION },
    { source: 'package.json', version: packageJson.version },
    { source: 'latest CHANGELOG.md release', version: latestRelease.version },
  ];

  assert.deepEqual(
    publishedVersionSources.map(({ version }) => version),
    publishedVersionSources.map(() => APP_VERSION),
    `Expected all published version sources to agree:\n${publishedVersionSources
      .map(({ source, version }) => `${source}: ${String(version)}`)
      .join('\n')}`
  );

  assert.doesNotThrow(() => assertReleaseVersionConsistency(releases));
});
