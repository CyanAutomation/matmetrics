import assert from 'node:assert/strict';
import {
  __resetBlobStorageDepsForTests,
  __setBlobStorageDepsForTests,
  BlobStorageDisabledError,
  createSession,
  deleteSession,
  findSessionFileById,
  getNextCounter,
  getSessionBlobPath,
  hasAnySessions,
  isBlobStorageEnabled,
  listSessions,
  readSession,
  sessionBlobExists,
  updateSession,
} from './vercel-blob-storage';
import type { JudoSession } from './types';

type BlobRecord = {
  pathname: string;
  url: string;
  body: string;
};

function createInMemoryBlobDeps() {
  const blobs = new Map<string, BlobRecord>();

  const toUrl = (pathname: string) => `https://blob.local/${pathname}`;

  const deps = {
    put: async (pathname: string, body: any, _opts: any) => {
      blobs.set(pathname, { pathname, url: toUrl(pathname), body: String(body) });
      return { url: toUrl(pathname), pathname, contentType: 'text/markdown' } as any;
    },
    del: async (pathname: string) => {
      if (!blobs.has(pathname)) {
        const err = new Error('not found') as Error & { code?: string };
        err.code = 'BLOB_NOT_FOUND';
        throw err;
      }
      blobs.delete(pathname);
    },
    list: async ({ prefix = '', limit = 10000 }: { prefix?: string; limit?: number }) => {
      const result = [...blobs.values()]
        .filter(blob => blob.pathname.startsWith(prefix))
        .slice(0, limit)
        .map(blob => ({ pathname: blob.pathname, url: blob.url }));
      return { blobs: result } as any;
    },
    head: async (pathname: string) => {
      const blob = blobs.get(pathname);
      if (!blob) {
        const err = new Error('not found') as Error & { code?: string };
        err.code = 'BLOB_NOT_FOUND';
        throw err;
      }
      return { url: blob.url } as any;
    },
    fetch: async (url: string | URL | Request): Promise<Response> => {
      const urlText = String(url);
      const blob = [...blobs.values()].find(value => value.url === urlText);
      if (!blob) return new Response('', { status: 404 });
      return new Response(blob.body, { status: 200 });
    },
  };

  return { deps, blobs };
}

function makeSession(date: string): JudoSession {
  return {
    id: 'session-date-move',
    date,
    duration: 60,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: [],
  };
}


async function runEncodingAndLegacyLookupRegression() {
  const { deps, blobs } = createInMemoryBlobDeps();
  __setBlobStorageDepsForTests(deps as any);

  try {
    const collidingIdA = 'a/b';
    const collidingIdB = 'a?b';
    const pathA = getSessionBlobPath('2025-03-14', undefined, collidingIdA);
    const pathB = getSessionBlobPath('2025-03-14', undefined, collidingIdB);

    assert.notEqual(pathA, pathB);
    assert.ok(pathA.endsWith('a%2Fb.md'));
    assert.ok(pathB.endsWith('a%3Fb.md'));

    const legacyPath = 'sessions/2025/03/20250314-matmetrics-a-b.md';
    await deps.put(
      legacyPath,
      `---
id: ${collidingIdA}
date: 2025-03-14
duration: 60
effort: 3
category: Technical
techniques: []
---
legacy`,
      {}
    );

    const foundLegacy = await findSessionFileById(collidingIdA);
    assert.equal(foundLegacy, legacyPath);
  } finally {
    __resetBlobStorageDepsForTests();
  }
}

async function runDisabledGuardChecks() {
  const originalFlag = process.env.ENABLE_VERCEL_BLOB;
  process.env.ENABLE_VERCEL_BLOB = 'false';

  try {
    assert.equal(isBlobStorageEnabled(), false);

    const checks: Array<{
      name: string;
      run: () => Promise<unknown>;
    }> = [
      { name: 'listSessions', run: () => listSessions() },
      { name: 'createSession', run: () => createSession(makeSession('2025-01-10')) },
      { name: 'updateSession', run: () => updateSession(makeSession('2025-01-10')) },
      { name: 'deleteSession', run: () => deleteSession('session-date-move') },
      { name: 'findSessionFileById', run: () => findSessionFileById('session-date-move') },
      { name: 'hasAnySessions', run: () => hasAnySessions() },
      { name: 'readSession', run: () => readSession('2025-01-10') },
      { name: 'sessionBlobExists', run: () => sessionBlobExists('sessions/2025/01/test.md') },
      { name: 'getNextCounter', run: () => getNextCounter('2025-01-10') },
    ];

    for (const check of checks) {
      await assert.rejects(
        check.run,
        (error: unknown) =>
          error instanceof BlobStorageDisabledError &&
          (error as BlobStorageDisabledError).code === 'BLOB_STORAGE_DISABLED',
        `${check.name} should throw BlobStorageDisabledError when blob storage is disabled`
      );
    }
  } finally {
    if (originalFlag === undefined) {
      delete process.env.ENABLE_VERCEL_BLOB;
    } else {
      process.env.ENABLE_VERCEL_BLOB = originalFlag;
    }
  }
}

async function runRegression() {
  const { deps, blobs } = createInMemoryBlobDeps();
  __setBlobStorageDepsForTests(deps as any);

  try {
    const sessionA = makeSession('2025-01-10');
    const pathA = await createSession(sessionA);
    assert.equal(pathA, getSessionBlobPath('2025-01-10', undefined, sessionA.id));
    assert.ok(blobs.has(pathA));

    const sessionB = { ...sessionA, date: '2025-02-15' };
    const updatedPathFirst = await updateSession(sessionB);
    assert.equal(updatedPathFirst, pathA);

    const foundAfterFirstDateChange = await findSessionFileById(sessionA.id);
    assert.equal(foundAfterFirstDateChange, pathA);

    const sessionC = { ...sessionB, date: '2025-03-20', notes: 'updated again' };
    const updatedPathSecond = await updateSession(sessionC);
    assert.equal(updatedPathSecond, pathA);

    await deleteSession(sessionA.id);
    assert.equal(await findSessionFileById(sessionA.id), null);
    assert.equal(blobs.size, 1);
    assert.ok(blobs.has('sessions/_index/session-id-paths.json'));
  } finally {
    __resetBlobStorageDepsForTests();
  }
}

async function runConcurrentIndexMutationRegression() {
  const { deps, blobs } = createInMemoryBlobDeps();
  __setBlobStorageDepsForTests(deps as any);

  try {
    const firstSession: JudoSession = {
      id: 'parallel-a',
      date: '2025-04-01',
      duration: 45,
      effort: 2,
      category: 'Technical',
      notes: 'first parallel write',
      techniques: [],
    };
    const secondSession: JudoSession = {
      id: 'parallel-b',
      date: '2025-04-02',
      duration: 50,
      effort: 3,
      category: 'Technical',
      notes: 'second parallel write',
      techniques: [],
    };

    await Promise.all([createSession(firstSession), createSession(secondSession)]);

    const indexBlob = blobs.get('sessions/_index/session-id-paths.json');
    assert.ok(indexBlob, 'index blob should exist after parallel session writes');

    const parsedIndex = JSON.parse(indexBlob.body) as Record<string, string>;
    assert.equal(parsedIndex[firstSession.id], getSessionBlobPath(firstSession.date, undefined, firstSession.id));
    assert.equal(parsedIndex[secondSession.id], getSessionBlobPath(secondSession.date, undefined, secondSession.id));
  } finally {
    __resetBlobStorageDepsForTests();
  }
}

runDisabledGuardChecks()
  .then(() => runRegression())
  .then(() => runConcurrentIndexMutationRegression())
  .then(() => runEncodingAndLegacyLookupRegression())
  .catch((err) => {
    console.error('Regression test failed:', err);
    process.exit(1);
  });
