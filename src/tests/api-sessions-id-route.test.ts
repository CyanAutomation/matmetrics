import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE, GET, PUT } from '@/app/api/sessions/[id]/route';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  createSession as createLocalSession,
  getSessionFilePath,
  listSessions as listLocalSessions,
} from '@/lib/file-storage';
import type { JudoSession } from '@/lib/types';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = JSON.stringify({
  owner: 'test-owner',
  repo: 'test-repo',
});

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const dataDir = await mkdtemp(
    path.join(tmpdir(), 'matmetrics-session-route-')
  );
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

function makeSession(
  id: string,
  date: string,
  options: { videoUrl?: string } = {}
): JudoSession {
  return {
    id,
    date,
    duration: 60,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: [],
    ...(options.videoUrl !== undefined && { videoUrl: options.videoUrl }),
  };
}

function makeGetRequest(id: string, query = '') {
  return GET(
    new NextRequest(`http://localhost/api/sessions/${id}${query}`, {
      headers: { authorization: 'Bearer test-token' },
    }),
    {
      params: Promise.resolve({ id }),
    }
  );
}

test('GET returns 404 when session does not exist', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const response = await makeGetRequest('missing-session');
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'Session not found' });
    });
  });
});

test('GET returns the local markdown session when present', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(makeSession('target', '2025-01-10'));

      const response = await makeGetRequest('target');
      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.deepEqual(payload, makeSession('target', '2025-01-10'));
    });
  });
});

test('GET returns local session videoUrl when present', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const session = makeSession('target-with-video', '2025-01-10', {
        videoUrl: 'https://example.com/videos/local',
      });
      await createLocalSession(session);

      const response = await makeGetRequest('target-with-video');
      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.equal(payload.videoUrl, 'https://example.com/videos/local');
    });
  });
});

test('PUT updates local markdown storage when GitHub is not configured', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const sessionId = 'put-local-id';
      await createLocalSession(makeSession(sessionId, '2025-01-10'));

      const response = await PUT(
        new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
          method: 'PUT',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
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
});

test('PUT returns 409 when local storage has duplicate files for the same session ID', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const sessionId = 'put-duplicate-id';
      const originalPath = await createLocalSession(
        makeSession(sessionId, '2025-01-10')
      );
      const duplicatePath = getSessionFilePath(
        '2025-02-10',
        undefined,
        sessionId
      );

      await mkdir(path.dirname(duplicatePath), { recursive: true });
      await writeFile(
        duplicatePath,
        await readFile(originalPath, 'utf-8'),
        'utf-8'
      );

      const response = await PUT(
        new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
          method: 'PUT',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            id: sessionId,
            date: '2025-01-10',
            effort: 4,
            category: 'Technical',
            techniques: ['uchi-mata'],
          }),
        }),
        { params: Promise.resolve({ id: sessionId }) }
      );

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error:
          'Session ID conflict: multiple session files share this ID. Resolve duplicates before updating.',
      });
    });
  });
});

test('PUT returns 500 when GitHub update fails in primary mode', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;
  const forwardedRequests: Array<{
    url: string;
    method: string;
    body?: string;
  }> = [];

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const value = String(url);
    forwardedRequests.push({
      url: value,
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : undefined,
    });
    if (value.includes('/api/go/sessions/update')) {
      return new Response(
        JSON.stringify({ error: 'Failed to update session' }),
        { status: 500 }
      );
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await PUT(
      new NextRequest('http://localhost/api/sessions/put-github-failure', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'put-github-failure',
          date: '2025-01-10',
          effort: 4,
          category: 'Technical',
          techniques: [],
          gitHubConfig: { owner: 'test-owner', repo: 'test-repo' },
        }),
      }),
      { params: Promise.resolve({ id: 'put-github-failure' }) }
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Failed to update session',
    });
    assert.equal(forwardedRequests.length, 1);
    assert.equal(forwardedRequests[0].method, 'PUT');
    assert.match(forwardedRequests[0].url, /\/api\/go\/sessions\/update$/);
    assert.deepEqual(JSON.parse(forwardedRequests[0].body ?? '{}'), {
      session: {
        id: 'put-github-failure',
        date: '2025-01-10',
        effort: 4,
        category: 'Technical',
        techniques: [],
      },
      config: { owner: 'test-owner', repo: 'test-repo' },
    });
  } finally {
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
  }
});

test('PUT uses stored GitHub config when body omits gitHubConfig', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;
  const forwardedRequests: Array<{
    url: string;
    method: string;
    body?: string;
  }> = [];

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const value = String(url);
    forwardedRequests.push({
      url: value,
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : undefined,
    });
    if (value.includes('/api/go/sessions/update')) {
      return new Response(
        JSON.stringify({
          id: 'put-stored-config',
          date: '2025-01-10',
          effort: 4,
          category: 'Technical',
          techniques: [],
        }),
        { status: 200 }
      );
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await PUT(
      new NextRequest('http://localhost/api/sessions/put-stored-config', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'put-stored-config',
          date: '2025-01-10',
          effort: 4,
          category: 'Technical',
          techniques: [],
        }),
      }),
      { params: Promise.resolve({ id: 'put-stored-config' }) }
    );

    assert.equal(response.status, 200);
    assert.equal(forwardedRequests.length, 1);
    assert.match(forwardedRequests[0].url, /\/api\/go\/sessions\/update$/);
    assert.deepEqual(JSON.parse(forwardedRequests[0].body ?? '{}'), {
      session: {
        id: 'put-stored-config',
        date: '2025-01-10',
        effort: 4,
        category: 'Technical',
        techniques: [],
      },
      config: { owner: 'test-owner', repo: 'test-repo' },
    });
  } finally {
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
  }
});

test('DELETE removes the local markdown session when GitHub is not configured', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const sessionId = 'delete-local-id';
      await createLocalSession(makeSession(sessionId, '2025-01-11'));

      const response = await DELETE(
        new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
        }),
        { params: Promise.resolve({ id: sessionId }) }
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { message: 'Session deleted' });
      assert.equal((await listLocalSessions()).length, 0);
    });
  });
});

test('DELETE returns 409 when local storage has duplicate files for the same session ID', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const sessionId = 'delete-duplicate-id';
      const originalPath = await createLocalSession(
        makeSession(sessionId, '2025-01-11')
      );
      const duplicatePath = getSessionFilePath(
        '2025-02-11',
        undefined,
        sessionId
      );

      await mkdir(path.dirname(duplicatePath), { recursive: true });
      await writeFile(
        duplicatePath,
        await readFile(originalPath, 'utf-8'),
        'utf-8'
      );

      const response = await DELETE(
        new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
        }),
        { params: Promise.resolve({ id: sessionId }) }
      );

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error:
          'Session ID conflict: multiple session files share this ID. Resolve duplicates before deleting.',
      });
    });
  });
});

test('DELETE proxies Go validation error when id is empty after trim', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const value = String(url);
    if (value.includes('/api/go/sessions/delete')) {
      assert.equal(init?.method, 'DELETE');
      assert.deepEqual(JSON.parse(String(init?.body ?? '{}')), {
        id: '   ',
        config: { owner: 'test-owner', repo: 'test-repo' },
      });
      return new Response(JSON.stringify({ error: 'Missing session id' }), {
        status: 400,
      });
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await DELETE(
      new NextRequest('http://localhost/api/sessions/%20%20%20', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          gitHubConfig: { owner: 'test-owner', repo: 'test-repo' },
        }),
      }),
      { params: Promise.resolve({ id: '   ' }) }
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Missing session id',
    });
  } finally {
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
  }
});

test('DELETE returns 500 when GitHub delete fails in primary mode', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes('/api/go/sessions/delete')) {
      return new Response(
        JSON.stringify({ error: 'Failed to delete session' }),
        { status: 500 }
      );
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await DELETE(
      new NextRequest('http://localhost/api/sessions/delete-github-failure', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          gitHubConfig: { owner: 'test-owner', repo: 'test-repo' },
        }),
      }),
      { params: Promise.resolve({ id: 'delete-github-failure' }) }
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Failed to delete session',
    });
  } finally {
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
  }
});

test('DELETE uses stored GitHub config when body omits gitHubConfig', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;
  const forwardedRequests: Array<{
    url: string;
    method: string;
    body?: string;
  }> = [];

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const value = String(url);
    forwardedRequests.push({
      url: value,
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : undefined,
    });
    if (value.includes('/api/go/sessions/delete')) {
      return new Response(JSON.stringify({ message: 'Session deleted' }), {
        status: 200,
      });
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await DELETE(
      new NextRequest('http://localhost/api/sessions/delete-stored-config', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
      }),
      { params: Promise.resolve({ id: 'delete-stored-config' }) }
    );

    assert.equal(response.status, 200);
    assert.equal(forwardedRequests.length, 1);
    assert.match(forwardedRequests[0].url, /\/api\/go\/sessions\/delete$/);
    assert.deepEqual(JSON.parse(forwardedRequests[0].body ?? '{}'), {
      id: 'delete-stored-config',
      config: { owner: 'test-owner', repo: 'test-repo' },
    });
  } finally {
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
  }
});

test('GET returns 403 when query repo does not match user preferences', async () => {
  const response = await makeGetRequest(
    'blocked',
    '?owner=another-owner&repo=another-repo'
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error:
      'Forbidden: requested GitHub repository does not match your configured repository.',
  });
});

test('PUT returns 403 when body repo does not match user preferences', async () => {
  const response = await PUT(
    new NextRequest('http://localhost/api/sessions/put-forbidden', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'put-forbidden',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: [],
        gitHubConfig: { owner: 'another-owner', repo: 'another-repo' },
      }),
    }),
    { params: Promise.resolve({ id: 'put-forbidden' }) }
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error:
      'Forbidden: requested GitHub repository does not match your configured repository.',
  });
});

test('DELETE returns 403 when body repo does not match user preferences', async () => {
  const response = await DELETE(
    new NextRequest('http://localhost/api/sessions/delete-forbidden', {
      method: 'DELETE',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        gitHubConfig: { owner: 'another-owner', repo: 'another-repo' },
      }),
    }),
    { params: Promise.resolve({ id: 'delete-forbidden' }) }
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error:
      'Forbidden: requested GitHub repository does not match your configured repository.',
  });
});

test('PUT returns 400 for invalid session payload fields', async (t) => {
  const cases = [
    {
      name: 'techniques element type',
      sessionId: 'put-invalid-techniques',
      body: {
        id: 'put-invalid-techniques',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata', { bad: true }],
      },
      error: 'Invalid techniques[1]: expected a string',
    },
    {
      name: 'date string',
      sessionId: 'put-invalid-date',
      body: {
        id: 'put-invalid-date',
        date: '2025-13-01',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
      },
      error: 'Invalid date: must be a real calendar date',
    },
    {
      name: 'duration type',
      sessionId: 'put-invalid-duration',
      body: {
        id: 'put-invalid-duration',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        duration: 12.5,
      },
      error: 'Invalid duration: expected a non-negative integer',
    },
    {
      name: 'effort integer',
      sessionId: 'put-invalid-effort',
      body: {
        id: 'put-invalid-effort',
        date: '2025-01-10',
        effort: 2.5,
        category: 'Technical',
        techniques: ['uchi-mata'],
      },
      error: 'Invalid effort level (must be an integer 1-5)',
    },
    {
      name: 'notes type',
      sessionId: 'put-invalid-notes',
      body: {
        id: 'put-invalid-notes',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        notes: ['bad'],
      },
      error: 'Invalid notes: expected a string',
    },
    {
      name: 'videoUrl type',
      sessionId: 'put-invalid-video-url-type',
      body: {
        id: 'put-invalid-video-url-type',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: true,
      },
      error: 'Invalid videoUrl: expected a string',
    },
    {
      name: 'videoUrl invalid url',
      sessionId: 'put-invalid-video-url-format',
      body: {
        id: 'put-invalid-video-url-format',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: 'not-a-url',
      },
      error: 'Invalid videoUrl: expected a valid absolute URL',
    },
    {
      name: 'videoUrl unsupported protocol',
      sessionId: 'put-invalid-video-url-protocol',
      body: {
        id: 'put-invalid-video-url-protocol',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: 'ftp://example.com/video.mp4',
      },
      error: 'Invalid videoUrl: protocol must be http or https',
    },
    {
      name: 'videoUrl private network host',
      sessionId: 'put-invalid-video-url-private-host',
      body: {
        id: 'put-invalid-video-url-private-host',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: 'https://127.0.0.1/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
    {
      name: 'videoUrl blocks loopback alias 127.0.0.2',
      sessionId: 'put-invalid-video-url-loopback-alias',
      body: {
        id: 'put-invalid-video-url-loopback-alias',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: 'http://127.0.0.2/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
    {
      name: 'videoUrl blocks ipv6 loopback ::1',
      sessionId: 'put-invalid-video-url-ipv6-loopback',
      body: {
        id: 'put-invalid-video-url-ipv6-loopback',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: 'http://[::1]/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
    {
      name: 'videoUrl blocks mapped ipv4 loopback',
      sessionId: 'put-invalid-video-url-ipv6-mapped-loopback',
      body: {
        id: 'put-invalid-video-url-ipv6-mapped-loopback',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: 'http://[::ffff:127.0.0.1]/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
    {
      name: 'videoUrl blocks ipv4 link-local range',
      sessionId: 'put-invalid-video-url-link-local',
      body: {
        id: 'put-invalid-video-url-link-local',
        date: '2025-01-10',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: 'http://169.254.1.1/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const response = await PUT(
        new NextRequest(`http://localhost/api/sessions/${testCase.sessionId}`, {
          method: 'PUT',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify(testCase.body),
        }),
        { params: Promise.resolve({ id: testCase.sessionId }) }
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: testCase.error,
      });
    });
  }
});

test('PUT accepts valid videoUrl and includes it in updated session', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const sessionId = 'put-valid-video-url';
      await createLocalSession(makeSession(sessionId, '2025-01-10'));

      const response = await PUT(
        new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
          method: 'PUT',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            id: sessionId,
            date: '2025-01-10',
            effort: 4,
            category: 'Technical',
            techniques: ['uchi-mata'],
            videoUrl: 'https://example.com/videos/updated',
          }),
        }),
        { params: Promise.resolve({ id: sessionId }) }
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        id: sessionId,
        date: '2025-01-10',
        effort: 4,
        category: 'Technical',
        techniques: ['uchi-mata'],
        videoUrl: 'https://example.com/videos/updated',
      });
    });
  });
});
