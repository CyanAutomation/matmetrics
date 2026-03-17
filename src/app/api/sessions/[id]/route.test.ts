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
