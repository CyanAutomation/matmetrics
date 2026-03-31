import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/sessions/create/route';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  getSessionFilePath,
} from '@/lib/file-storage';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = JSON.stringify({
  owner: 'test-owner',
  repo: 'test-repo',
});

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const dataDir = await mkdtemp(
    path.join(tmpdir(), 'matmetrics-create-route-')
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
  overrides: Partial<{
    date: string;
    effort: number;
    category: 'Technical' | 'Randori' | 'Shiai';
    techniques: string[];
    videoUrl: string;
  }> = {}
) {
  const base = {
    id,
    date: '2025-01-12',
    effort: 3,
    category: 'Technical' as const,
    techniques: ['osoto-gari'],
  };

  return {
    ...base,
    ...overrides,
    ...(overrides.videoUrl !== undefined && { videoUrl: overrides.videoUrl }),
  };
}

test('POST persists the session to local markdown storage when GitHub is not configured', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/sessions/create', {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify(makeSession('create-local-id')),
        })
      );

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), makeSession('create-local-id'));

      const filePath = getSessionFilePath(
        '2025-01-12',
        undefined,
        'create-local-id'
      );
      const markdown = await readFile(filePath, 'utf8');
      assert.match(markdown, /id: create-local-id/);
    });
  });
});

test('POST returns 500 when GitHub create fails in primary mode', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;
  const forwardedRequests: Array<{
    url: string;
    method: string;
    body?: string;
    authorization?: string | null;
  }> = [];

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const value = String(url);
    forwardedRequests.push({
      url: value,
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : undefined,
      authorization: new Headers(init?.headers).get('authorization'),
    });
    if (value.includes('/api/go/sessions/create')) {
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500 }
      );
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await POST(
      new NextRequest('http://localhost/api/sessions/create', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'create-github-failure',
          date: '2025-01-12',
          effort: 3,
          category: 'Technical',
          techniques: [],
          gitHubConfig: { owner: 'test-owner', repo: 'test-repo' },
        }),
      })
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Failed to create session',
    });
    assert.equal(forwardedRequests.length, 1);
    assert.equal(forwardedRequests[0].method, 'POST');
    assert.match(forwardedRequests[0].url, /\/api\/go\/sessions\/create$/);
    assert.equal(forwardedRequests[0].authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(forwardedRequests[0].body ?? '{}'), {
      session: {
        id: 'create-github-failure',
        date: '2025-01-12',
        effort: 3,
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

test('POST uses stored GitHub config when body omits gitHubConfig', async () => {
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
    if (value.includes('/api/go/sessions/create')) {
      return new Response(
        JSON.stringify({
          id: 'create-stored-config',
          date: '2025-01-12',
          effort: 3,
          category: 'Technical',
          techniques: [],
        }),
        { status: 201 }
      );
    }
    throw new Error(`Unexpected Go proxy URL: ${value}`);
  };

  try {
    const response = await POST(
      new NextRequest('http://localhost/api/sessions/create', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'create-stored-config',
          date: '2025-01-12',
          effort: 3,
          category: 'Technical',
          techniques: [],
        }),
      })
    );

    assert.equal(response.status, 201);
    assert.equal(forwardedRequests.length, 1);
    assert.match(forwardedRequests[0].url, /\/api\/go\/sessions\/create$/);
    assert.deepEqual(JSON.parse(forwardedRequests[0].body ?? '{}'), {
      session: {
        id: 'create-stored-config',
        date: '2025-01-12',
        effort: 3,
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

test('POST returns 403 when request GitHub repo does not match user preferences', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/sessions/create', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 'create-forbidden-repo',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: [],
        gitHubConfig: { owner: 'another-owner', repo: 'another-repo' },
      }),
    })
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error:
      'Forbidden: requested GitHub repository does not match your configured repository.',
  });
});

test('POST returns 409 for duplicate session ID conflicts with different content', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const firstResponse = await POST(
        new NextRequest('http://localhost/api/sessions/create', {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            id: 'create-conflict-id',
            date: '2025-01-12',
            effort: 3,
            category: 'Technical',
            techniques: ['osoto-gari'],
          }),
        })
      );

      assert.equal(firstResponse.status, 201);

      const conflictResponse = await POST(
        new NextRequest('http://localhost/api/sessions/create', {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            id: 'create-conflict-id',
            date: '2025-01-12',
            effort: 4,
            category: 'Technical',
            techniques: ['harai-goshi'],
          }),
        })
      );

      assert.equal(conflictResponse.status, 409);
      assert.deepEqual(await conflictResponse.json(), {
        error:
          'Session conflict: this ID already exists with different content. Use a new ID or update the existing session.',
      });
    });
  });
});

test('POST returns 400 when request JSON is not an object', async (t) => {
  const invalidBodies = [
    { name: 'null', body: null },
    { name: 'string', body: 'not-an-object' },
    { name: 'number', body: 42 },
  ] as const;

  for (const testCase of invalidBodies) {
    await t.test(testCase.name, async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/sessions/create', {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify(testCase.body),
        })
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: 'Invalid request body',
      });
    });
  }
});

test('POST returns 400 for invalid session payload fields', async (t) => {
  const cases = [
    {
      name: 'id number',
      body: {
        id: 12345,
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
      },
      error: 'Invalid id: expected a string',
    },
    {
      name: 'id object',
      body: {
        id: { bad: true },
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
      },
      error: 'Invalid id: expected a string',
    },
    {
      name: 'id empty string',
      body: {
        id: '   ',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
      },
      error: 'Invalid id: expected a non-empty string',
    },
    {
      name: 'id with invalid characters',
      body: {
        id: 'session@invalid!',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
      },
      error:
        'Invalid id: contains invalid characters; only letters, digits, "-" and "_" are allowed',
    },
    {
      name: 'id exceeds max length',
      body: {
        id: 'a'.repeat(101),
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
      },
      error: 'Invalid id: exceeds maximum length of 100 characters',
    },
    {
      name: 'techniques element type',
      body: {
        id: 'create-invalid-techniques',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari', 42],
      },
      error: 'Invalid techniques[1]: expected a string',
    },
    {
      name: 'date string',
      body: {
        id: 'create-invalid-date',
        date: '2025-02-30',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
      },
      error: 'Invalid date: must be a real calendar date',
    },
    {
      name: 'duration type',
      body: {
        id: 'create-invalid-duration',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        duration: '90',
      },
      error: 'Invalid duration: expected a non-negative integer',
    },
    {
      name: 'effort integer',
      body: {
        id: 'create-invalid-effort',
        date: '2025-01-12',
        effort: 3.5,
        category: 'Technical',
        techniques: ['osoto-gari'],
      },
      error: 'Invalid effort level (must be an integer 1-5)',
    },
    {
      name: 'description type',
      body: {
        id: 'create-invalid-description',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        description: { bad: true },
      },
      error: 'Invalid description: expected a string',
    },
    {
      name: 'videoUrl type',
      body: {
        id: 'create-invalid-video-url-type',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        videoUrl: 123,
      },
      error: 'Invalid videoUrl: expected a string',
    },
    {
      name: 'videoUrl invalid url',
      body: {
        id: 'create-invalid-video-url-format',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        videoUrl: 'not-a-url',
      },
      error: 'Invalid videoUrl: expected a valid absolute URL',
    },
    {
      name: 'videoUrl unsupported protocol',
      body: {
        id: 'create-invalid-video-url-protocol',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        videoUrl: 'ftp://example.com/video.mp4',
      },
      error: 'Invalid videoUrl: protocol must be http or https',
    },
    {
      name: 'videoUrl private network host',
      body: {
        id: 'create-invalid-video-url-private-host',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        videoUrl: 'https://localhost/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
    {
      name: 'videoUrl blocks loopback alias 127.0.0.2',
      body: {
        id: 'create-invalid-video-url-loopback-alias',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        videoUrl: 'http://127.0.0.2/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
    {
      name: 'videoUrl blocks ipv6 loopback ::1',
      body: {
        id: 'create-invalid-video-url-ipv6-loopback',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        videoUrl: 'http://[::1]/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
    {
      name: 'videoUrl blocks mapped ipv4 loopback',
      body: {
        id: 'create-invalid-video-url-ipv6-mapped-loopback',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        videoUrl: 'http://[::ffff:127.0.0.1]/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
    {
      name: 'videoUrl blocks ipv4 link-local range',
      body: {
        id: 'create-invalid-video-url-link-local',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
        videoUrl: 'http://169.254.1.1/video.mp4',
      },
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/sessions/create', {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify(testCase.body),
        })
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: testCase.error,
      });
    });
  }
});

test('POST accepts valid videoUrl and includes it in created session', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const response = await POST(
        new NextRequest('http://localhost/api/sessions/create', {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify(
            makeSession('create-valid-video-url', {
              videoUrl: 'https://example.com/videos/123',
            })
          ),
        })
      );

      assert.equal(response.status, 201);
      assert.deepEqual(
        await response.json(),
        makeSession('create-valid-video-url', {
          videoUrl: 'https://example.com/videos/123',
        })
      );
    });
  });
});

test('POST returns 401 when authorization header is missing', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/sessions/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'create-unauthorized',
        date: '2025-01-12',
        effort: 3,
        category: 'Technical',
        techniques: ['osoto-gari'],
      }),
    })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});
