import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE, GET, PUT } from '@/app/api/sessions/[id]/route';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  createSession as createLocalSession,
  listSessions as listLocalSessions,
} from '@/lib/file-storage';
import type { JudoSession } from '@/lib/types';

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'matmetrics-session-route-'));
  __setDataDirForTests(dataDir);

  try {
    await run(dataDir);
  } finally {
    __resetDataDirForTests();
    await rm(dataDir, { recursive: true, force: true });
  }
}

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

function makeGetRequest(id: string, query = '') {
  return GET(new NextRequest(`http://localhost/api/sessions/${id}${query}`), {
    params: Promise.resolve({ id }),
  });
}

test('GET returns 404 when session does not exist', async () => {
  await withTempDataDir(async () => {
    const response = await makeGetRequest('missing-session');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Session not found' });
  });
});

test('GET returns the local markdown session when present', async () => {
  await withTempDataDir(async () => {
    await createLocalSession(makeSession('target', '2025-01-10'));

    const response = await makeGetRequest('target');
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.id, 'target');
    assert.equal(payload.date, '2025-01-10');
  });
});

test('PUT updates local markdown storage when GitHub is not configured', async () => {
  await withTempDataDir(async () => {
    const sessionId = 'put-local-id';
    await createLocalSession(makeSession(sessionId, '2025-01-10'));

    const response = await PUT(
      new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          date: '2025-01-10',
          effort: 4,
          category: 'Technical',
          techniques: ['uchi-mata'],
          notes: 'updated',
        }),
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.effort, 4);

    const sessions = await listLocalSessions();
    assert.equal(sessions[0].notes, 'updated');
    assert.deepEqual(sessions[0].techniques, ['uchi-mata']);
  });
});

test('PUT returns 500 when GitHub update fails in primary mode', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes('/api/go/sessions/update')) {
      return new Response(JSON.stringify({ error: 'Failed to update session' }), { status: 500 });
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await PUT(
      new NextRequest('http://localhost/api/sessions/put-github-failure', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'put-github-failure',
          date: '2025-01-10',
          effort: 4,
          category: 'Technical',
          techniques: [],
          gitHubConfig: { owner: 'octocat', repo: 'hello-world' },
        }),
      }),
      { params: Promise.resolve({ id: 'put-github-failure' }) }
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Failed to update session' });
  } finally {
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
  }
});

test('DELETE removes the local markdown session when GitHub is not configured', async () => {
  await withTempDataDir(async () => {
    const sessionId = 'delete-local-id';
    await createLocalSession(makeSession(sessionId, '2025-01-11'));

    const response = await DELETE(
      new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: 'Session deleted' });
    assert.equal((await listLocalSessions()).length, 0);
  });
});

test('DELETE returns 500 when GitHub delete fails in primary mode', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes('/api/go/sessions/delete')) {
      return new Response(JSON.stringify({ error: 'Failed to delete session' }), { status: 500 });
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await DELETE(
      new NextRequest('http://localhost/api/sessions/delete-github-failure', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gitHubConfig: { owner: 'octocat', repo: 'hello-world' },
        }),
      }),
      { params: Promise.resolve({ id: 'delete-github-failure' }) }
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Failed to delete session' });
  } finally {
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
  }
});

test('PUT returns 400 for invalid techniques element type', async () => {
  const sessionId = 'put-invalid-techniques';
  const response = await PUT(
    new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: sessionId,
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata', { bad: true }],
      }),
    }),
    { params: Promise.resolve({ id: sessionId }) }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid techniques[1]: expected a string' });
});

test('PUT returns 400 for invalid date string', async () => {
  const sessionId = 'put-invalid-date';
  const response = await PUT(
    new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: sessionId,
        date: '2025-13-01',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
      }),
    }),
    { params: Promise.resolve({ id: sessionId }) }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid date: must be a real calendar date' });
});
