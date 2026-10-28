import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { GET } from '@/app/api/releases/recent/api-handler';
import { APP_VERSION } from '@/lib/app-version';
import { parseChangelog } from '@/lib/releases';
import { NextRequest } from 'next/server';

test('GET recent releases returns the latest three releases and current version', async () => {
  const changelogSource = await readFile(
    new URL('../../CHANGELOG.md', import.meta.url),
    'utf8'
  );
  const expectedReleases = parseChangelog(changelogSource).slice(0, 3);
  const request = new NextRequest('http://localhost/api/releases/recent');
  const response = await GET(request);

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    currentVersion: string;
    releases: Array<{ version: string }>;
  };

  assert.equal(payload.currentVersion, APP_VERSION);
  assert.equal(payload.releases.length, 3);
  assert.equal(payload.releases[0]?.version, APP_VERSION);
  assert.deepEqual(payload.releases, expectedReleases);
  assert.equal(
    response.headers.get('cache-control'),
    'public, max-age=0, must-revalidate'
  );
  assert.match(response.headers.get('cdn-cache-control') ?? '', /s-maxage=300/);
  assert.match(response.headers.get('cdn-cache-control') ?? '', /stale-while-revalidate=3600/);
  assert.ok(response.headers.get('etag'));

  const conditionalResponse = await GET(
    new NextRequest('http://localhost/api/releases/recent', {
      headers: { 'if-none-match': response.headers.get('etag') ?? '' },
    })
  );
  assert.equal(conditionalResponse.status, 304);
});
