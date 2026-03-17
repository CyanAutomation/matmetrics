import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/sessions/create/route';
import { __resetDataDirForTests, __setDataDirForTests, getSessionFilePath } from '@/lib/file-storage';

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'matmetrics-create-route-'));
  __setDataDirForTests(dataDir);

  try {
    await run(dataDir);
  } finally {
    __resetDataDirForTests();
    await rm(dataDir, { recursive: true, force: true });
  }
}

test('POST persists the session to local markdown storage when GitHub is not configured', async () => {
  await withTempDataDir(async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/sessions/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'create-local-id',
          date: '2025-01-12',
          effort: 3,
          category: 'Technical',
          techniques: ['osoto-gari'],
        }),
      })
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      id: 'create-local-id',
      date: '2025-01-12',
      effort: 3,
      category: 'Technical',
      techniques: ['osoto-gari'],
    });

    const filePath = getSessionFilePath('2025-01-12', undefined, 'create-local-id');
    const markdown = await readFile(filePath, 'utf8');
    assert.match(markdown, /id: create-local-id/);
  });
});

test('POST returns 500 when GitHub create fails in primary mode', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes('/api/go/sessions/create')) {
      return new Response(JSON.stringify({ error: 'Failed to create session' }), { status: 500 });
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await POST(
      new NextRequest('http://localhost/api/sessions/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'create-github-failure',
          date: '2025-01-12',
          effort: 3,
          category: 'Technical',
          techniques: [],
          gitHubConfig: { owner: 'octocat', repo: 'hello-world' },
        }),
      })
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Failed to create session' });
  } finally {
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
  }
});

test('POST returns 400 for invalid techniques element type', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/sessions/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'create-invalid-techniques',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari', 42],
      }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid techniques[1]: expected a string' });
});

test('POST returns 400 for invalid date string', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/sessions/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'create-invalid-date',
        date: '2025-02-30',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
      }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid date: must be a real calendar date' });
});

test('POST returns 400 for invalid duration type', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/sessions/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'create-invalid-duration',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        duration: '90',
      }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid duration: expected a non-negative integer' });
});

test('POST returns 400 for invalid description type', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/sessions/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'create-invalid-description',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        description: { bad: true },
      }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid description: expected a string' });
});
