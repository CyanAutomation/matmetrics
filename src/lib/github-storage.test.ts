import assert from 'node:assert/strict';
import {
  findSessionPathOnGitHubById,
  getGitHubSessionPath,
} from './github-storage';
import { getSessionBlobPath } from './vercel-blob-storage';
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
  const blobPathA = getSessionBlobPath('2025-03-14', undefined, idA);
  const blobPathB = getSessionBlobPath('2025-03-14', undefined, idB);

  assert.notEqual(githubPathA, githubPathB);
  assert.notEqual(blobPathA, blobPathB);
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

async function main() {
  runPathEncodingRegression();
  await runGitHubLegacyLookupRegression();
  await runMissingBranchLookupRegression();
  await runNon404TreeLookupErrorRegression();
  await runTruncatedTreeFallbackRegression();
}

main().catch((err) => {
  console.error('GitHub storage regression test failed:', err);
  process.exit(1);
});
