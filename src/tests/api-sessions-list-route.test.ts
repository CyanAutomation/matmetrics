import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/sessions/list/api-handler';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  createSession as createLocalSession,
} from '@/lib/file-storage';
import type { JudoSession } from '@/lib/types';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG = JSON.stringify({
  owner: 'test-owner',
  repo: 'test-repo',
});

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'matmetrics-list-route-'));
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

function makeSession(id: string, date: string): JudoSession {
  return {
    id,
    date,
    effort: 3,
    category: 'Technical',
    techniques: ['osoto-gari'],
  };
}

test('GET list returns local sessions when no GitHub config is requested', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(makeSession('list-a', '2025-01-01'));
      await createLocalSession(makeSession('list-b', '2025-01-02'));

      const response = await GET(
        new NextRequest('http://localhost/api/sessions/list', {
          headers: { authorization: 'Bearer test-token' },
        })
      );

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.sessions.length, 2);
      assert.deepEqual(payload.issues, []);
      assert.deepEqual(
        payload.sessions.map((session: JudoSession) => session.id),
        ['list-b', 'list-a']
      );
      const etag = response.headers.get('etag');
      assert.ok(etag);

      const conditionalResponse = await GET(
        new NextRequest('http://localhost/api/sessions/list', {
          headers: {
            authorization: 'Bearer test-token',
            'if-none-match': etag,
          },
        })
      );
      assert.equal(conditionalResponse.status, 304);
      assert.equal(
        conditionalResponse.headers.get('cache-control'),
        'private, max-age=30, stale-while-revalidate=120'
      );
    });
  });
});

test('GET list returns 403 when requested repo does not match user preferences', async () => {
  const response = await GET(
    new NextRequest(
      'http://localhost/api/sessions/list?owner=another-owner&repo=another-repo',
      {
        headers: { authorization: 'Bearer test-token' },
      }
    )
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error:
      'Forbidden: requested GitHub repository does not match your configured repository.',
  });
});

test('GET list logs a safe diagnostic when authentication is rejected', async () => {
  const originalWarn = console.warn;
  const diagnostics: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    diagnostics.push(args);
  };

  try {
    const response = await GET(
      new NextRequest('http://localhost/api/sessions/list', {
        headers: { 'x-vercel-id': 'iad1::request-123' },
      })
    );

    assert.equal(response.status, 401);
    assert.ok(
      diagnostics.some(([event, details]) => {
        const diagnostic = details as {
          status?: number;
          authorizationHeaderPresent?: boolean;
          bearerAuthorizationPresent?: boolean;
          requestId?: string;
        };
        return (
          event === 'session_list_auth_rejected' &&
          diagnostic.status === 401 &&
          diagnostic.authorizationHeaderPresent === false &&
          diagnostic.bearerAuthorizationPresent === false &&
          diagnostic.requestId === 'iad1::request-123'
        );
      })
    );
    assert.equal(JSON.stringify(diagnostics).includes('test-token'), false);
  } finally {
    console.warn = originalWarn;
  }
});

test('forced GET list logs the result count without session content', async () => {
  await withStoredGitHubConfig('null', async () => {
    await withTempDataDir(async () => {
      await createLocalSession(makeSession('private-session-id', '2026-10-08'));
      const originalInfo = console.info;
      const diagnostics: unknown[][] = [];
      console.info = (...args: unknown[]) => {
        diagnostics.push(args);
      };

      try {
        const response = await GET(
          new NextRequest('http://localhost/api/sessions/list?force=1', {
            headers: {
              authorization: 'Bearer test-token',
              'x-vercel-id': 'iad1::complete-456',
            },
          })
        );

        assert.equal(response.status, 200);
        assert.ok(
          diagnostics.some(([event, details]) => {
            const diagnostic = details as {
              source?: string;
              status?: number;
              sessionCount?: number;
              requestId?: string;
            };
            return (
              event === 'session_list_completed' &&
              diagnostic.source === 'storage' &&
              diagnostic.status === 200 &&
              diagnostic.sessionCount === 1 &&
              diagnostic.requestId === 'iad1::complete-456'
            );
          }),
          JSON.stringify(diagnostics)
        );
        const serializedDiagnostics = JSON.stringify(diagnostics);
        assert.equal(serializedDiagnostics.includes('private-session-id'), false);
        assert.equal(serializedDiagnostics.includes('test-token'), false);
      } finally {
        console.info = originalInfo;
      }
    });
  });
});
