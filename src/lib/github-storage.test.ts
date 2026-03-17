import assert from 'node:assert/strict';
import {
  bulkPushSessions,
  findSessionPathOnGitHubById,
  getGitHubSessionPath,
  updateSessionOnGitHub,
} from './github-storage';
import type { JudoSession } from './types';

function makeSession(id: string): JudoSession {
  return {
    id,
    date: '2025-03-14',
    duration: 60,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: [],
  };
}

function runPathEncodingRegression() {
  const idA = 'a/b';
  const idB = 'a?b';

  const githubPathA = getGitHubSessionPath(makeSession(idA));
  const githubPathB = getGitHubSessionPath(makeSession(idB));

  assert.notEqual(githubPathA, githubPathB);
  assert.ok(githubPathA.startsWith('data/2025/03/'));
  assert.ok(githubPathA.endsWith('a%2Fb.md'));
  assert.ok(githubPathB.endsWith('a%3Fb.md'));

  const overlyLongSessionId = 'a'.repeat(101);
  assert.throws(() => getGitHubSessionPath(makeSession(overlyLongSessionId)), {
    message: 'Session ID exceeds maximum allowed length of 100 characters',
  });
}

async function runGitHubLegacyLookupRegression() {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';

  const dirListing: Record<string, Array<{ name: string; path: string; type: 'dir' | 'file' }>> = {
    sessions: [{ name: '2025', path: 'sessions/2025', type: 'dir' }],
    'sessions/2025': [{ name: '03', path: 'sessions/2025/03', type: 'dir' }],
    'sessions/2025/03': [
      {
        name: '20250314-matmetrics-a-b.md',
        path: 'sessions/2025/03/20250314-matmetrics-a-b.md',
        type: 'file',
      },
    ],
  };

  global.fetch = (async (url: string | URL | Request) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;

    if (path.includes('/git/ref/heads/')) {
      return new Response(
        JSON.stringify({ object: { sha: 'commit-sha', type: 'commit' } }),
        { status: 200 }
      );
    }

    if (path.includes('/git/commits/')) {
      return new Response(JSON.stringify({ tree: { sha: 'tree-sha' } }), { status: 200 });
    }

    if (path.includes('/git/trees/')) {
      return new Response(JSON.stringify({ truncated: true, tree: [] }), { status: 200 });
    }

    if (path.includes('/contents/')) {
      const marker = '/contents/';
      const contentPath = decodeURIComponent(path.slice(path.indexOf(marker) + marker.length));
      const listing = dirListing[contentPath] ?? [];
      return new Response(JSON.stringify(listing), { status: 200 });
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  }) as typeof fetch;

  try {
    const config = { owner: 'o', repo: 'r', branch: 'main' };
    const found = await findSessionPathOnGitHubById('a/b', config);
    assert.equal(found, 'sessions/2025/03/20250314-matmetrics-a-b.md');
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
}

async function runMissingBranchLookupRegression() {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';

  global.fetch = (async (url: string | URL | Request) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;

    if (path.includes('/git/ref/heads/')) {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ message: 'Unexpected path' }), { status: 500 });
  }) as typeof fetch;

  try {
    const config = { owner: 'o', repo: 'r', branch: 'missing' };
    const found = await findSessionPathOnGitHubById('a/b', config);
    assert.equal(found, null);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
}

async function runNon404TreeLookupErrorRegression() {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';

  global.fetch = (async (url: string | URL | Request) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;

    if (path.includes('/git/ref/heads/')) {
      return new Response(
        JSON.stringify({ object: { sha: 'commit-sha', type: 'commit' } }),
        { status: 200 }
      );
    }

    if (path.includes('/git/commits/')) {
      return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
    }

    return new Response(JSON.stringify({ message: 'Unexpected path' }), { status: 500 });
  }) as typeof fetch;

  try {
    const config = { owner: 'o', repo: 'r', branch: 'main' };
    await assert.rejects(findSessionPathOnGitHubById('a/b', config), {
      message: /GitHub API error 500: Server error/,
    });
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
}

async function runTruncatedTreeFallbackRegression() {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';

  global.fetch = (async (url: string | URL | Request) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;

    if (path.includes('/git/ref/heads/')) {
      return new Response(
        JSON.stringify({ object: { sha: 'commit-sha', type: 'commit' } }),
        { status: 200 }
      );
    }

    if (path.includes('/git/commits/')) {
      return new Response(JSON.stringify({ tree: { sha: 'tree-sha' } }), { status: 200 });
    }

    if (path.includes('/git/trees/')) {
      return new Response(JSON.stringify({ truncated: true, tree: [] }), { status: 200 });
    }

    if (path.endsWith('/contents/data')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    if (path.endsWith('/contents/sessions')) {
      return new Response(
        JSON.stringify([{ type: 'dir', path: 'sessions/2025', name: '2025' }]),
        { status: 200 }
      );
    }

    if (path.endsWith('/contents/sessions/2025')) {
      return new Response(
        JSON.stringify([{ type: 'dir', path: 'sessions/2025/03', name: '03' }]),
        { status: 200 }
      );
    }

    if (path.endsWith('/contents/sessions/2025/03')) {
      return new Response(
        JSON.stringify([
          {
            type: 'file',
            path: 'sessions/2025/03/20250314-matmetrics-a-b.md',
            name: '20250314-matmetrics-a-b.md',
          },
        ]),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  }) as typeof fetch;

  try {
    const config = { owner: 'o', repo: 'r', branch: 'main' };
    const found = await findSessionPathOnGitHubById('a/b', config);
    assert.equal(found, 'sessions/2025/03/20250314-matmetrics-a-b.md');
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
}



async function runBulkPushReadmeFailureRegression() {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';

  let sessionPutCount = 0;

  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;

    if (path === '/repos/o/r/contents/data/2025/03/20250314-matmetrics-session-1.md') {
      sessionPutCount++;
      return new Response(JSON.stringify({ content: { sha: 'session-sha' } }), { status: 200 });
    }

    if (path === '/repos/o/r/contents/README.md') {
      return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
    }

    if (path === '/repos/o/r') {
      return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
    }

    return new Response(
      JSON.stringify({ message: `Unexpected request: ${init?.method || 'GET'} ${path}` }),
      { status: 500 }
    );
  }) as typeof fetch;

  try {
    const result = await bulkPushSessions([makeSession('session-1')], {
      owner: 'o',
      repo: 'r',
    });

    assert.equal(sessionPutCount, 1);
    assert.equal(result.success, false);
    assert.match(result.message, /Pushed 1\/1 sessions to GitHub/);
    assert.match(result.message, /README update failed:/);
    assert.match(result.message, /GitHub README update failed: GitHub service error \(500\)/);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
}

async function runGitHubUpdateMovesFileWhenDateChangesRegression() {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';

  const requests: Array<{ method: string; path: string; body?: any }> = [];

  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, body });

    if (path === '/repos/o/r/git/ref/heads/main') {
      return new Response(JSON.stringify({ object: { sha: 'commit-sha', type: 'commit' } }), { status: 200 });
    }

    if (path === '/repos/o/r/git/commits/commit-sha') {
      return new Response(JSON.stringify({ tree: { sha: 'tree-sha' } }), { status: 200 });
    }

    if (path === '/repos/o/r/git/trees/tree-sha') {
      return new Response(JSON.stringify({
        truncated: false,
        tree: [
          {
            path: 'sessions/2025/01/20250110-matmetrics-session-1.md',
            type: 'blob',
          },
        ],
      }), { status: 200 });
    }

    if (path === '/repos/o/r/contents/data/2025/02/20250212-matmetrics-session-1.md' && method === 'GET') {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }

    if (path === '/repos/o/r/contents/sessions/2025/01/20250110-matmetrics-session-1.md' && method === 'GET') {
      return new Response(JSON.stringify({ sha: 'old-sha' }), { status: 200 });
    }

    if (path === '/repos/o/r/contents/data/2025/02/20250212-matmetrics-session-1.md' && method === 'PUT') {
      return new Response(JSON.stringify({ content: { sha: 'new-sha' } }), { status: 200 });
    }

    if (path === '/repos/o/r/contents/sessions/2025/01/20250110-matmetrics-session-1.md' && method === 'DELETE') {
      assert.equal(body?.sha, 'old-sha');
      return new Response(JSON.stringify({ content: { sha: 'deleted-sha' } }), { status: 200 });
    }

    return new Response(
      JSON.stringify({ message: `Unexpected request: ${method} ${path}` }),
      { status: 500 }
    );
  }) as typeof fetch;

  try {
    const result = await updateSessionOnGitHub(
      {
        id: 'session-1',
        date: '2025-02-12',
        effort: 3,
        category: 'Technical',
        techniques: ['uchi-mata'],
      },
      { owner: 'o', repo: 'r', branch: 'main' }
    );

    assert.equal(result.success, true);
    assert.equal(result.filePath, 'data/2025/02/20250212-matmetrics-session-1.md');
    assert.ok(
      requests.some(
        (request) =>
          request.method === 'DELETE' &&
          request.path === '/repos/o/r/contents/sessions/2025/01/20250110-matmetrics-session-1.md'
      )
    );
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
}

async function main() {
  runPathEncodingRegression();
  await runGitHubLegacyLookupRegression();
  await runMissingBranchLookupRegression();
  await runNon404TreeLookupErrorRegression();
  await runTruncatedTreeFallbackRegression();
  await runBulkPushReadmeFailureRegression();
  await runGitHubUpdateMovesFileWhenDateChangesRegression();
}

main().catch((err) => {
  console.error('GitHub storage regression test failed:', err);
  process.exit(1);
});
