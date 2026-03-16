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

runPathEncodingRegression();
runGitHubLegacyLookupRegression().catch((err) => {
  console.error('GitHub storage regression test failed:', err);
  process.exit(1);
});
