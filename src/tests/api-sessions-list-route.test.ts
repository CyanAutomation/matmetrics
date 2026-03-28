import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/sessions/list/route';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  createSession as createLocalSession,
} from '@/lib/file-storage';
import type { JudoSession } from '@/lib/types';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = JSON.stringify({
  owner: 'test-owner',
  repo: 'test-repo',
});

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'matmetrics-list-route-'));
  __setDataDirForTests(dataDir);

  try {
    await run(dataDir);
  } finally {
    __resetDataDirForTests();
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function withStoredGitHubConfig(
  config: string | undefined,
  run: () => Promise<void>
) {
  const original = process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG;
  process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = config;
  try {
    await run();
  } finally {
    process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = original;
  }
}

function makeSession(id: string, date: string): JudoSession {
  return {
    id,
    date,
    effort: 3,
    category: 'Technical',
    techniques: ['osoto-gari'],
  };
}

test('GET list returns local sessions when no GitHub config is requested', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(makeSession('list-a', '2025-01-01'));
      await createLocalSession(makeSession('list-b', '2025-01-02'));

      const response = await GET(
        new NextRequest('http://localhost/api/sessions/list', {
          headers: { authorization: 'Bearer test-token' },
        })
      );

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.sessions.length, 2);
      assert.deepEqual(payload.issues, []);
      assert.deepEqual(
        payload.sessions.map((session: JudoSession) => session.id),
        ['list-b', 'list-a']
      );
    });
  });
});

test('GET list returns 403 when requested repo does not match user preferences', async () => {
  const response = await GET(
    new NextRequest(
      'http://localhost/api/sessions/list?owner=another-owner&repo=another-repo',
      {
        headers: { authorization: 'Bearer test-token' },
      }
    )
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error:
      'Forbidden: requested GitHub repository does not match your configured repository.',
  });
});
