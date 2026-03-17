import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { __resetBlobStorageDepsForTests, __setBlobStorageDepsForTests } from '@/lib/vercel-blob-storage';


const notFoundHead = async () => {
  const error = new Error('not found') as Error & { code?: string };
  error.code = 'BLOB_NOT_FOUND';
  throw error;
};

function makeRequest(id: string) {
  return GET(new NextRequest(`http://localhost/api/sessions/${id}`), {
    params: Promise.resolve({ id }),
  });
}

test('GET returns 404 when session does not exist', async () => {
  __setBlobStorageDepsForTests({
    head: notFoundHead as any,
    list: async () => ({ blobs: [] }) as any,
  });

  try {
    const response = await makeRequest('missing-session');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Session not found' });
  } finally {
    __resetBlobStorageDepsForTests();
  }
});

test('GET returns 500 when blob listing fails during lookup', async () => {
  __setBlobStorageDepsForTests({
    head: notFoundHead as any,
    list: async () => {
      throw new Error('simulated blob outage');
    },
  });

  try {
    const response = await makeRequest('any-session-id');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Failed to retrieve session' });
  } finally {
    __resetBlobStorageDepsForTests();
  }
});


test('GET reads the located blob directly without listing all sessions', async () => {
  const INDEX_PATH = 'sessions/_index/session-id-paths.json';
  const SESSION_PATH = 'sessions/2025/01/20250110-matmetrics-target.md';
  const sessionId = 'target';

  __setBlobStorageDepsForTests({
    head: async (pathname: string) => {
      if (pathname === INDEX_PATH) {
        return { url: 'https://blob.local/index' } as any;
      }

      if (pathname === SESSION_PATH) {
        return { url: 'https://blob.local/session' } as any;
      }

      const error = new Error('not found') as Error & { code?: string };
      error.code = 'BLOB_NOT_FOUND';
      throw error;
    },
    fetch: async (url: string | URL | Request) => {
      const value = String(url);
      if (value === 'https://blob.local/index') {
        return new Response(JSON.stringify({ [sessionId]: SESSION_PATH }), { status: 200 });
      }

      if (value === 'https://blob.local/session') {
        return new Response(`---
id: "${sessionId}"
date: "2025-01-10"
duration: 60
effort: 3
category: "Technical"
techniques: []
---
`, { status: 200 });
      }

      return new Response('', { status: 404 });
    },
    list: async () => {
      throw new Error('list should not be called when indexed path resolves');
    },
  });

  try {
    const response = await makeRequest(sessionId);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.id, sessionId);
    assert.equal(payload.date, '2025-01-10');
  } finally {
    __resetBlobStorageDepsForTests();
  }
});
