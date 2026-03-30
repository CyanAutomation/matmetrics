import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '@/app/api/releases/recent/route';
import { APP_VERSION } from '@/lib/app-version';

test('GET recent releases returns the latest three releases and current version', async () => {
  const response = await GET();

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    currentVersion: string;
    releases: Array<{ version: string }>;
  };

  assert.equal(payload.currentVersion, APP_VERSION);
  assert.equal(payload.releases.length, 3);
  assert.deepEqual(
    payload.releases.map((release) => release.version),
    ['1.2.0', '1.1.0', '1.0.0']
  );
});
