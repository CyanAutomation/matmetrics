import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE, PUT } from '@/app/api/sessions/[id]/api-handler';
import { POST } from '@/app/api/sessions/create/api-handler';
import { GET as LIST } from '@/app/api/sessions/list/api-handler';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  createSession,
} from '@/lib/file-storage';
import {
  cacheSessionList,
  getCachedSessionList,
  invalidateSessionListCache,
} from '@/lib/session-list-cache.server';
import type { GitHubConfig, JudoSession } from '@/lib/types';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

const authorization = { authorization: 'Bearer test-token' };

function makeSession(id: string, notes: string): JudoSession {
  return {
    id,
    date: '2025-04-05',
    effort: 3,
    category: 'Technical',
    techniques: ['uchi-mata'],
    notes,
  };
}

async function withLocalStorage(run: () => Promise<void>) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'matmetrics-cache-route-'));
  const originalConfig = process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG;
  process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = 'null';
  __setDataDirForTests(dataDir);
  invalidateSessionListCache('test-user', undefined);

  try {
    await run();
  } finally {
    invalidateSessionListCache('test-user', undefined);
    __resetDataDirForTests();
    process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = originalConfig;
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function listSessions(): Promise<JudoSession[]> {
  const response = await LIST(
    new NextRequest('http://localhost/api/sessions/list', {
      headers: authorization,
    })
  );
  assert.equal(response.status, 200);
  return (await response.json()).sessions;
}

test('create invalidates a primed list cache', async () => {
  await withLocalStorage(async () => {
    assert.deepEqual(await listSessions(), []);

    const created = makeSession('cache-create', 'created');
    const response = await POST(
      new NextRequest('http://localhost/api/sessions/create', {
        method: 'POST',
        headers: { ...authorization, 'content-type': 'application/json' },
        body: JSON.stringify(created),
      })
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await listSessions(), [created]);
  });
});

test('update invalidates a primed list cache', async () => {
  await withLocalStorage(async () => {
    const original = makeSession('cache-update', 'before');
    await createSession(original);
    assert.equal((await listSessions())[0].notes, 'before');

    const updated = { ...original, effort: 5, notes: 'after' };
    const response = await PUT(
      new NextRequest(`http://localhost/api/sessions/${original.id}`, {
        method: 'PUT',
        headers: { ...authorization, 'content-type': 'application/json' },
        body: JSON.stringify(updated),
      }),
      { params: Promise.resolve({ id: original.id }) }
    );

    assert.equal(response.status, 200);
    assert.equal((await listSessions())[0].notes, 'after');
  });
});

test('delete invalidates a primed list cache', async () => {
  await withLocalStorage(async () => {
    const session = makeSession('cache-delete', 'delete me');
    await createSession(session);
    assert.deepEqual(await listSessions(), [session]);

    const response = await DELETE(
      new NextRequest(`http://localhost/api/sessions/${session.id}`, {
        method: 'DELETE',
        headers: authorization,
      }),
      { params: Promise.resolve({ id: session.id }) }
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await listSessions(), []);
  });
});

test('route mutation invalidation is isolated by user and normalized repository', async () => {
  await withLocalStorage(async () => {
    const otherUserPayload = { sessions: [makeSession('other-user', 'cached')], issues: [] };
    const otherRepoPayload = { sessions: [makeSession('other-repo', 'cached')], issues: [] };
    const repository: GitHubConfig = {
      owner: 'example-owner',
      repo: 'example-repo',
      branch: 'main',
    };

    cacheSessionList('other-user', undefined, otherUserPayload);
    cacheSessionList('test-user', repository, otherRepoPayload);
    assert.deepEqual(await listSessions(), []);

    const response = await POST(
      new NextRequest('http://localhost/api/sessions/create', {
        method: 'POST',
        headers: { ...authorization, 'content-type': 'application/json' },
        body: JSON.stringify(makeSession('isolated-create', 'created')),
      })
    );

    assert.equal(response.status, 201);
    assert.equal(getCachedSessionList('test-user', undefined), undefined);
    assert.strictEqual(
      getCachedSessionList('other-user', undefined),
      otherUserPayload
    );
    assert.strictEqual(
      getCachedSessionList('test-user', { ...repository }),
      otherRepoPayload
    );

    invalidateSessionListCache('other-user', undefined);
    invalidateSessionListCache('test-user', repository);
  });
});
