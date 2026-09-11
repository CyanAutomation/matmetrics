import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { GET } from '@/app/api/releases/recent/route';
import { APP_VERSION } from '@/lib/app-version';
import { parseChangelog } from '@/lib/releases';

test('GET recent releases returns the latest three releases and current version', async () => {
  const changelogSource = await readFile(
    new URL('../../CHANGELOG.md', import.meta.url),
    'utf8'
  );
  const expectedReleases = parseChangelog(changelogSource).slice(0, 3);
  const response = await GET();

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    currentVersion: string;
    releases: Array<{ version: string }>;
  };

  assert.equal(payload.currentVersion, APP_VERSION);
  assert.equal(payload.releases.length, 3);
  assert.equal(payload.releases[0]?.version, APP_VERSION);
  assert.deepEqual(payload.releases, expectedReleases);
});
