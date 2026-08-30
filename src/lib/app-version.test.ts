import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { APP_VERSION } from '@/lib/app-version';
import {
  parseChangelog,
  validateReleaseVersionConsistency,
} from '@/lib/releases';

test('all published version sources agree', async () => {
  const [packageJsonSource, changelogSource] = await Promise.all([
    readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageJsonSource) as { version?: unknown };
  const releases = parseChangelog(changelogSource);
  assert.deepEqual(
    validateReleaseVersionConsistency({
      applicationVersion: APP_VERSION,
      packageVersion: packageJson.version,
      releases,
    }),
    []
  );
});
