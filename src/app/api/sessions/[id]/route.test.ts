import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE, GET, PUT } from './route';
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


type BlobRecord = {
  pathname: string;
  url: string;
  body: string;
};

function createInMemoryBlobDeps(initial: Array<{ pathname: string; body: string }> = []) {
  const blobs = new Map<string, BlobRecord>();
  const toUrl = (pathname: string) => `https://blob.local/${pathname}`;

  for (const item of initial) {
    blobs.set(item.pathname, {
      pathname: item.pathname,
      url: toUrl(item.pathname),
      body: item.body,
    });
  }

  return {
    deps: {
      put: async (pathname: string, body: any) => {
        blobs.set(pathname, { pathname, url: toUrl(pathname), body: String(body) });
        return { pathname, url: toUrl(pathname) } as any;
      },
      del: async (pathname: string) => {
        if (!blobs.has(pathname)) {
          const error = new Error('not found') as Error & { code?: string };
          error.code = 'BLOB_NOT_FOUND';
          throw error;
        }

        blobs.delete(pathname);
      },
      head: async (pathname: string) => {
        const blob = blobs.get(pathname);
        if (!blob) {
          const error = new Error('not found') as Error & { code?: string };
          error.code = 'BLOB_NOT_FOUND';
          throw error;
        }

        return { url: blob.url } as any;
      },
      fetch: async (url: string | URL | Request) => {
        const value = String(url);
        const blob = [...blobs.values()].find(entry => entry.url === value);
        return blob ? new Response(blob.body, { status: 200 }) : new Response('', { status: 404 });
      },
      list: async ({ prefix = '', limit = 10000 }: { prefix?: string; limit?: number }) => ({
        blobs: [...blobs.values()]
          .filter(blob => blob.pathname.startsWith(prefix))
          .slice(0, limit)
          .map(blob => ({ pathname: blob.pathname, url: blob.url })),
      }) as any,
    },
  };
}

function makeSessionMarkdown(id: string, date: string) {
  return `---
id: "${id}"
date: "${date}"
duration: 60
effort: 3
category: "Technical"
techniques: []
---
`;
}

test('PUT includes warning when GitHub update sync result reports success:false', async () => {
  const sessionId = 'put-warning-id';
  const pathname = 'sessions/2025/01/20250110-matmetrics-put-warning-id.md';
  const { deps } = createInMemoryBlobDeps([{ pathname, body: makeSessionMarkdown(sessionId, '2025-01-10') }]);
  __setBlobStorageDepsForTests(deps as any);

  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const warns: unknown[][] = [];

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request) => {
    const value = String(url);

    if (value.includes('/repos/octocat/hello-world') && !value.includes('/contents/')) {
      return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
    }

    if (value.includes('/contents/')) {
      return new Response(JSON.stringify({ message: 'simulated github outage' }), { status: 500 });
    }

    throw new Error(`Unexpected GitHub URL: ${value}`);
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };

  try {
    const response = await PUT(
      new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          date: '2025-01-10',
          effort: 4,
          category: 'Technical',
          techniques: [],
          gitHubConfig: { owner: 'octocat', repo: 'hello-world' },
        }),
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, sessionId);
    assert.equal(typeof payload.warning, 'string');
    assert.match(payload.warning, /GitHub session update/);
    assert.equal(warns.length, 1);
    assert.equal(warns[0][0], 'GitHub session update sync reported failure');
  } finally {
    console.warn = originalWarn;
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
    __resetBlobStorageDepsForTests();
  }
});

test('DELETE includes warning when GitHub delete sync result reports success:false', async () => {
  const sessionId = 'delete-warning-id';
  const pathname = 'sessions/2025/01/20250111-matmetrics-delete-warning-id.md';
  const { deps } = createInMemoryBlobDeps([{ pathname, body: makeSessionMarkdown(sessionId, '2025-01-11') }]);
  __setBlobStorageDepsForTests(deps as any);

  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const warns: unknown[][] = [];

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request) => {
    const value = String(url);

    if (value.includes('/repos/octocat/hello-world') && !value.includes('/contents/')) {
      return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
    }

    if (value.includes('/contents/')) {
      return new Response(JSON.stringify({ message: 'simulated github outage' }), { status: 500 });
    }

    throw new Error(`Unexpected GitHub URL: ${value}`);
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };

  try {
    const response = await DELETE(
      new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gitHubConfig: { owner: 'octocat', repo: 'hello-world' },
        }),
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.message, 'Session deleted');
    assert.equal(typeof payload.warning, 'string');
    assert.match(payload.warning, /GitHub session delete/);
    assert.equal(warns.length, 1);
    assert.equal(warns[0][0], 'GitHub session delete sync reported failure');
  } finally {
    console.warn = originalWarn;
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
    __resetBlobStorageDepsForTests();
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
