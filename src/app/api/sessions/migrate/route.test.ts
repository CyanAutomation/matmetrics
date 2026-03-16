import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from './route';
import {
  __resetBlobStorageDepsForTests,
  __setBlobStorageDepsForTests,
  getSessionBlobPath
} from '@/lib/vercel-blob-storage';
import type { JudoSession } from '@/lib/types';

type BlobRecord = {
  pathname: string;
  url: string;
  body: string;
};

function makeSession(id: string, date: string): JudoSession {
  return {
    id,
    date,
    duration: 60,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: [],
  };
}

function createInMemoryBlobDepsWithLockDelay() {
  const blobs = new Map<string, BlobRecord>();
  const lockWrites: Array<() => void> = [];
  let lockWritePending = false;
  const toUrl = (pathname: string) => `https://blob.local/${pathname}`;

  const deps = {
    put: async (pathname: string, body: any, opts: any) => {
      if (pathname === 'sessions/_locks/migration.lock' && opts?.allowOverwrite === false) {
        if (blobs.has(pathname) || lockWritePending) {
          const err = new Error('already exists') as Error & { code?: string };
          err.code = 'BLOB_ALREADY_EXISTS';
          throw err;
        }

        lockWritePending = true;
        await new Promise<void>(resolve => lockWrites.push(resolve));
        lockWritePending = false;
      }

      if (pathname.startsWith('sessions/') && pathname.endsWith('.md') && opts?.allowOverwrite === false) {
        if (blobs.has(pathname)) {
          const err = new Error('already exists') as Error & { code?: string };
          err.code = 'BLOB_ALREADY_EXISTS';
          throw err;
        }
      }

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

  return {
    deps,
    blobs,
    releaseNextLockWrite: () => {
      const release = lockWrites.shift();
      if (release) {
        release();
      }
    },
  };
}

test('concurrent migration requests are lock-protected with deterministic accounting', async () => {
  const { deps, blobs, releaseNextLockWrite } = createInMemoryBlobDepsWithLockDelay();
  __setBlobStorageDepsForTests(deps as any);

  try {
    const existingSession = makeSession('existing-id', '2025-01-01');
    const existingPath = getSessionBlobPath(existingSession.date, undefined, existingSession.id);
    blobs.set(existingPath, {
      pathname: existingPath,
      url: `https://blob.local/${existingPath}`,
      body: '# existing',
    });

    const sessionsPayload: Array<JudoSession | Record<string, unknown>> = [
      existingSession,
      makeSession('new-id-1', '2025-01-02'),
      makeSession('new-id-1', '2025-01-02'),
      { id: '', date: '2025-01-03', effort: 2, category: 'Technical' },
    ];

    const requestA = new NextRequest('http://localhost/api/sessions/migrate', {
      method: 'POST',
      body: JSON.stringify({ sessions: sessionsPayload }),
      headers: { 'content-type': 'application/json' },
    });

    const requestB = new NextRequest('http://localhost/api/sessions/migrate', {
      method: 'POST',
      body: JSON.stringify({ sessions: sessionsPayload }),
      headers: { 'content-type': 'application/json' },
    });

    const responsePromiseA = POST(requestA);
    await Promise.resolve();
    const responsePromiseB = POST(requestB);

    releaseNextLockWrite();
    const responseB = await responsePromiseB;
    assert.equal(responseB.status, 409);

    const responseA = await responsePromiseA;
    assert.equal(responseA.status, 200);

    const bodyA = await responseA.json();
    assert.deepEqual(bodyA, {
      success: true,
      migrated: 2,
      duplicates: 1,
      invalid: 1,
      failed: 0,
      total: 4,
      errors: ['Skipped invalid session: missing required fields'],
    });

    const newPath = getSessionBlobPath('2025-01-02', undefined, 'new-id-1');
    assert.ok(blobs.has(existingPath), 'existing session should not be deleted');
    assert.ok(blobs.has(newPath), 'new session should be persisted');
  } finally {
    __resetBlobStorageDepsForTests();
  }
});
