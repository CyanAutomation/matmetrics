import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { APP_VERSION } from '@/lib/app-version';
import {
  assertReleaseVersionConsistency,
  parseChangelog,
} from '@/lib/releases';

test('APP_VERSION matches package.json version', async () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const raw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(raw) as { version?: unknown };

  assert.equal(packageJson.version, APP_VERSION);
});

test('APP_VERSION matches the latest CHANGELOG.md entry', async () => {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  const raw = await readFile(changelogPath, 'utf8');
  const releases = parseChangelog(raw);

  assert.doesNotThrow(() => assertReleaseVersionConsistency(releases));
});
