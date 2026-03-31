import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/video-library/check-links/route';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  createSession as createLocalSession,
} from '@/lib/file-storage';
import type { JudoSession } from '@/lib/types';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

function makeSession(id: string, videoUrl?: string): JudoSession {
  return {
    id,
    date: '2026-03-29',
    effort: 3,
    category: 'Technical',
    techniques: ['sode-tsurikomi-goshi'],
    ...(videoUrl ? { videoUrl } : {}),
  };
}

async function withTempDataDir(run: () => Promise<void>) {
  const dataDir = await mkdtemp(
    path.join(tmpdir(), 'matmetrics-video-library-route-')
  );
  __setDataDirForTests(dataDir);

  try {
    await run();
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

test('POST requires authentication', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/video-library/check-links', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: 'Authentication required',
  });
});

test('POST reports disallowed domains without making outbound requests', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(
        makeSession('disallowed', 'https://example.com/video/123')
      );

      let fetchCalls = 0;
      const originalFetch = global.fetch;
      global.fetch = (async (...args: Parameters<typeof fetch>) => {
        fetchCalls += 1;
        return originalFetch(...args);
      }) as typeof fetch;

      try {
        const response = await POST(
          new NextRequest('http://localhost/api/video-library/check-links', {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body: JSON.stringify({ sessionIds: ['disallowed'] }),
          })
        );

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.results.length, 1);
        assert.equal(payload.results[0].status, 'disallowed_domain');
        assert.equal(fetchCalls, 0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

test('POST falls back to GET when HEAD is rejected', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(
        makeSession('allowed', 'https://www.youtube.com/watch?v=abc')
      );

      const originalFetch = global.fetch;
      const methods: string[] = [];
      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        methods.push(init?.method || 'GET');
        if (init?.method === 'HEAD') {
          return new Response(null, { status: 405 });
        }
        return new Response(null, { status: 200 });
      }) as typeof fetch;

      try {
        const response = await POST(
          new NextRequest('http://localhost/api/video-library/check-links', {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body: JSON.stringify({ sessionIds: ['allowed'] }),
          })
        );

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.deepEqual(methods, ['HEAD', 'GET']);
        assert.equal(payload.results[0].status, 'reachable');
        assert.equal(payload.results[0].httpStatus, 200);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

test('POST classifies remote failures as check_failed', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(makeSession('allowed', 'https://youtu.be/abc'));

      const originalFetch = global.fetch;
      global.fetch = (async () => {
        throw new Error('socket hang up');
      }) as typeof fetch;

      try {
        const response = await POST(
          new NextRequest('http://localhost/api/video-library/check-links', {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body: JSON.stringify({ sessionIds: ['allowed'] }),
          })
        );

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.results[0].status, 'check_failed');
        assert.match(payload.results[0].error, /socket hang up/);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

test('POST blocks redirect from allowed domain to private network host', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(
        makeSession('allowed', 'https://youtube.com/watch?v=redirect-me')
      );

      const originalFetch = global.fetch;
      const calls: Array<{ url: string; method: string; redirect?: string }> =
        [];
      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = String(input);
        const method = init?.method || 'GET';
        calls.push({
          url: requestUrl,
          method,
          redirect: init?.redirect,
        });

        let hostname: string | null = null;
        try {
          hostname = new URL(requestUrl).hostname;
        } catch {
          hostname = null;
        }

        if (
          hostname === 'youtube.com' ||
          (hostname !== null && hostname.endsWith('.youtube.com'))
        ) {
          return new Response(null, {
            status: 302,
            headers: { location: 'http://127.0.0.1:8080/internal' },
          });
        }

        return new Response(null, { status: 200 });
      }) as typeof fetch;

      try {
        const response = await POST(
          new NextRequest('http://localhost/api/video-library/check-links', {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body: JSON.stringify({ sessionIds: ['allowed'] }),
          })
        );

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.results[0].status, 'disallowed_domain');
        assert.match(payload.results[0].error, /Blocked network hostname/);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].method, 'HEAD');
        assert.equal(calls[0].redirect, 'manual');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

test('POST returns row-friendly per-session payloads for mixed result sets', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(
        makeSession('reachable', 'https://youtube.com/watch?v=123')
      );
      await createLocalSession(
        makeSession('disallowed', 'https://example.com/video/123')
      );

      const originalFetch = global.fetch;
      global.fetch = (async () =>
        new Response(null, { status: 200 })) as typeof fetch;

      try {
        const response = await POST(
          new NextRequest('http://localhost/api/video-library/check-links', {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body: JSON.stringify({
              sessionIds: ['reachable', 'disallowed'],
            }),
          })
        );

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.results.length, 2);
        assert.deepEqual(
          payload.results
            .map(
              (result: {
                sessionId: string;
                hostname: string;
                status: string;
                checkedAt: string;
              }) => ({
                sessionId: result.sessionId,
                hostname: result.hostname,
                status: result.status,
                hasCheckedAt: typeof result.checkedAt === 'string',
              })
            )
            .sort(
              (
                left: {
                  sessionId: string;
                  hostname: string;
                  status: string;
                  hasCheckedAt: boolean;
                },
                right: {
                  sessionId: string;
                  hostname: string;
                  status: string;
                  hasCheckedAt: boolean;
                }
              ) => left.sessionId.localeCompare(right.sessionId)
            ),
          [
            {
              sessionId: 'disallowed',
              hostname: 'example.com',
              status: 'disallowed_domain',
              hasCheckedAt: true,
            },
            {
              sessionId: 'reachable',
              hostname: 'youtube.com',
              status: 'reachable',
              hasCheckedAt: true,
            },
          ]
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

test('POST limits processed sessions and includes truncation metadata when sessionIds are omitted', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const sessionCount = 120;
      for (let index = 0; index < sessionCount; index += 1) {
        await createLocalSession(
          makeSession(
            `session-${index}`,
            `https://youtube.com/watch?v=${index}`
          )
        );
      }

      const originalFetch = global.fetch;
      let fetchCalls = 0;
      global.fetch = (async () => {
        fetchCalls += 1;
        return new Response(null, { status: 200 });
      }) as typeof fetch;

      try {
        const response = await POST(
          new NextRequest('http://localhost/api/video-library/check-links', {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body: JSON.stringify({}),
          })
        );

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.truncated, true);
        assert.equal(payload.processedCount, 100);
        assert.equal(payload.results.length, 100);
        assert.equal(fetchCalls, 100);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

test('POST checks links with bounded concurrency', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      const sessionCount = 40;
      for (let index = 0; index < sessionCount; index += 1) {
        await createLocalSession(
          makeSession(
            `session-${index}`,
            `https://youtube.com/watch?v=${index}`
          )
        );
      }

      const originalFetch = global.fetch;
      let inFlight = 0;
      let maxInFlight = 0;
      global.fetch = (async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return new Response(null, { status: 200 });
      }) as typeof fetch;

      try {
        const response = await POST(
          new NextRequest('http://localhost/api/video-library/check-links', {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body: JSON.stringify({}),
          })
        );

        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.results.length, sessionCount);
        assert.ok(
          maxInFlight <= 6,
          `expected max concurrency <= 6, got ${maxInFlight}`
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
