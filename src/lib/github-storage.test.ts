// fallow-ignore-file unused-file
// This suite is discovered dynamically by the Node test command.
import assert from 'node:assert/strict';
import { beforeEach } from 'node:test';
import test from 'node:test';
import {
  __resetDefaultBranchCacheForTests,
  __resetManifestCacheForTests,
  bulkPushSessions,
  createSessionOnGitHub,
  findSessionPathOnGitHubById,
  getGitHubSessionPath,
  updateSessionOnGitHub,
} from './github-storage';
import { sessionToMarkdown } from './markdown-serializer';
import type { JudoSession } from './types';
import {
  GitHubMockBuilder,
  makeTestSession,
  withMockedGitHub,
} from './test-helpers/github-mock-builder';

// Deprecated - use makeTestSession from test-helpers instead
function makeSession(id: string): JudoSession {
  return makeTestSession(id);
}

beforeEach(() => {
  __resetDefaultBranchCacheForTests();
  __resetManifestCacheForTests();
});

test('getGitHubSessionPath encodes reserved characters and rejects oversized IDs', () => {
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
});

test('two writers from the same revision cannot silently overwrite each other', async () => {
  const base = makeSession('concurrent');
  const first = { ...base, notes: 'first writer', revisionSha: 'sha-base' };
  const second = { ...base, notes: 'second writer', revisionSha: 'sha-base' };
  let remoteSha = 'sha-base';
  let remoteMarkdown = sessionToMarkdown(base);

  await withMockedGitHub(
    (async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return new Response(
          JSON.stringify({
            sha: remoteSha,
            content: Buffer.from(remoteMarkdown).toString('base64'),
          }),
          { status: 200 }
        );
      }

      const body = JSON.parse(String(init?.body));
      if (body.sha !== remoteSha) {
        return new Response(JSON.stringify({ message: 'sha does not match' }), {
          status: 409,
        });
      }
      remoteSha = 'sha-first';
      remoteMarkdown = Buffer.from(body.content, 'base64').toString('utf8');
      return new Response(JSON.stringify({ content: { sha: remoteSha } }), {
        status: 200,
      });
    }) as typeof fetch,
    async () => {
      const config = { owner: 'o', repo: 'r', branch: 'main' };
      const firstResult = await updateSessionOnGitHub(first, config);
      const secondResult = await updateSessionOnGitHub(second, config);

      assert.equal(firstResult.success, true);
      assert.equal(secondResult.success, false);
      assert.equal(secondResult.errorType, 'conflict');
      assert.equal(remoteMarkdown, sessionToMarkdown(first));
    }
  );
});

test('findSessionPathOnGitHubById traverses directory listings when the tree is truncated', async () => {
  const mock = new GitHubMockBuilder()
    .addBranch('main', 'commit-sha', 'tree-sha')
    .addTree('tree-sha', [], true) // truncated tree
    .addContentsListing('data', [
      { name: '2025', path: 'data/2025', type: 'dir' },
    ])
    .addContentsListing('data/2025', [
      { name: '03', path: 'data/2025/03', type: 'dir' },
    ])
    .addContentsListing('data/2025/03', [
      {
        name: '20250314-matmetrics-a%2Fb.md',
        path: 'data/2025/03/20250314-matmetrics-a%2Fb.md',
        type: 'file',
      },
    ]);

  await withMockedGitHub(mock.build(), async () => {
    const config = { owner: 'o', repo: 'r', branch: 'main' };
    const found = await findSessionPathOnGitHubById('a/b', config);
    assert.equal(found, 'data/2025/03/20250314-matmetrics-a%2Fb.md');
  });
});

test('findSessionPathOnGitHubById returns null when the branch ref is missing', async () => {
  const mock = new GitHubMockBuilder(); // No branches added = 404 on ref lookup

  await withMockedGitHub(mock.build(), async () => {
    const config = { owner: 'o', repo: 'r', branch: 'missing' };
    const found = await findSessionPathOnGitHubById('a/b', config);
    assert.equal(found, null);
  });
});

test('findSessionPathOnGitHubById does not reuse manifest entries across branches', async () => {
  await withMockedGitHub(
    (async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;
      const ref = parsed.searchParams.get('ref');

      if (path === '/repos/o/r/git/ref/heads/main') {
        return new Response(
          JSON.stringify({ object: { sha: 'commit-main', type: 'commit' } }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/git/ref/heads/feature') {
        return new Response(
          JSON.stringify({ object: { sha: 'commit-feature', type: 'commit' } }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/git/commits/commit-main') {
        return new Response(JSON.stringify({ tree: { sha: 'tree-main' } }), {
          status: 200,
        });
      }

      if (path === '/repos/o/r/git/commits/commit-feature') {
        return new Response(JSON.stringify({ tree: { sha: 'tree-feature' } }), {
          status: 200,
        });
      }

      if (path === '/repos/o/r/git/trees/tree-main') {
        return new Response(
          JSON.stringify({
            truncated: false,
            tree: [
              {
                path: 'data/2025/03/20250314-matmetrics-shared.md',
                type: 'blob',
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/git/trees/tree-feature') {
        return new Response(JSON.stringify({ truncated: false, tree: [] }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          message: `Unexpected request: ${path}?ref=${ref ?? ''}`,
        }),
        { status: 500 }
      );
    }) as typeof fetch,
    async () => {
      const mainConfig = { owner: 'o', repo: 'r', branch: 'main' };
      const featureConfig = { owner: 'o', repo: 'r', branch: 'feature' };

      const mainPath = await findSessionPathOnGitHubById('shared', mainConfig);
      const featurePath = await findSessionPathOnGitHubById(
        'shared',
        featureConfig
      );

      assert.equal(mainPath, 'data/2025/03/20250314-matmetrics-shared.md');
      assert.equal(featurePath, null);
    }
  );
});

test('findSessionPathOnGitHubById evicts stale manifest entry and falls back to tree scan', async () => {
  let treeCalls = 0;

  await withMockedGitHub(
    (async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;

      if (path === '/repos/o/r/git/ref/heads/main') {
        return new Response(
          JSON.stringify({ object: { sha: 'commit-main', type: 'commit' } }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/git/commits/commit-main') {
        return new Response(JSON.stringify({ tree: { sha: 'tree-main' } }), {
          status: 200,
        });
      }

      if (path === '/repos/o/r/git/trees/tree-main') {
        treeCalls++;
        return new Response(
          JSON.stringify({
            truncated: false,
            tree: [
              {
                path: 'data/2025/03/20250314-matmetrics-fresh.md',
                type: 'blob',
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (
        path === '/repos/o/r/contents/data/2025/03/20250314-matmetrics-stale.md'
      ) {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }

      return new Response(
        JSON.stringify({ message: `Unexpected path: ${path}` }),
        {
          status: 500,
        }
      );
    }) as typeof fetch,
    async () => {
      const config = { owner: 'o', repo: 'r', branch: 'main' };

      const stalePath = await findSessionPathOnGitHubById('stale', config);
      assert.equal(stalePath, null);

      const freshPath = await findSessionPathOnGitHubById('fresh', config);
      assert.equal(freshPath, 'data/2025/03/20250314-matmetrics-fresh.md');
      assert.equal(treeCalls, 2);
    }
  );
});

test('default branch refresh invalidates prior-branch manifest scope', async () => {
  let repoLookupCount = 0;
  let treeMainCalls = 0;
  let treeTrunkCalls = 0;

  await withMockedGitHub(
    (async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;

      if (path === '/repos/o/r') {
        repoLookupCount++;
        return new Response(
          JSON.stringify({
            default_branch: repoLookupCount === 1 ? 'main' : 'trunk',
          }),
          { status: 200 }
        );
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/03/20250314-matmetrics-shared.md' &&
        (init?.method ?? 'GET') === 'GET'
      ) {
        const ref = parsed.searchParams.get('ref');
        if (ref === 'main') {
          return new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
          });
        }

        if (ref === 'trunk') {
          return new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
          });
        }
      }

      if (path === '/repos/o/r/git/ref/heads/main') {
        return new Response(
          JSON.stringify({ object: { sha: 'commit-main', type: 'commit' } }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/git/ref/heads/trunk') {
        return new Response(
          JSON.stringify({ object: { sha: 'commit-trunk', type: 'commit' } }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/git/commits/commit-main') {
        return new Response(JSON.stringify({ tree: { sha: 'tree-main' } }), {
          status: 200,
        });
      }

      if (path === '/repos/o/r/git/commits/commit-trunk') {
        return new Response(JSON.stringify({ tree: { sha: 'tree-trunk' } }), {
          status: 200,
        });
      }

      if (path === '/repos/o/r/git/trees/tree-main') {
        treeMainCalls++;
        return new Response(
          JSON.stringify({
            truncated: false,
            tree: [
              {
                path: 'data/2025/03/20250314-matmetrics-shared.md',
                type: 'blob',
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/git/trees/tree-trunk') {
        treeTrunkCalls++;
        return new Response(JSON.stringify({ truncated: false, tree: [] }), {
          status: 200,
        });
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/03/20250314-matmetrics-trigger.md' &&
        (init?.method ?? 'GET') === 'PUT'
      ) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          branch: string;
        };
        if (body.branch === 'main') {
          return new Response(
            JSON.stringify({
              message: 'Invalid request.\n\nNo commit found for the ref main',
            }),
            { status: 422 }
          );
        }

        return new Response(
          JSON.stringify({ content: { sha: 'sha-trigger' } }),
          {
            status: 200,
          }
        );
      }

      return new Response(
        JSON.stringify({
          message: `Unexpected request: ${init?.method ?? 'GET'} ${path}`,
        }),
        { status: 500 }
      );
    }) as typeof fetch,
    async () => {
      const config = { owner: 'o', repo: 'r' };

      const mainPath = await findSessionPathOnGitHubById('shared', config);
      assert.equal(mainPath, 'data/2025/03/20250314-matmetrics-shared.md');

      await createSessionOnGitHub(makeSession('trigger'), config);

      const trunkPath = await findSessionPathOnGitHubById('shared', config);
      assert.equal(trunkPath, null);
      assert.ok(treeMainCalls >= 1);
      assert.equal(treeTrunkCalls, 0);
    }
  );
});

test('findSessionPathOnGitHubById surfaces non-404 GitHub errors', async () => {
  await withMockedGitHub(
    (async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;

      if (path.includes('/git/ref/heads/')) {
        return new Response(
          JSON.stringify({ object: { sha: 'commit-sha', type: 'commit' } }),
          { status: 200 }
        );
      }

      if (path.includes('/git/commits/')) {
        return new Response(JSON.stringify({ message: 'Server error' }), {
          status: 500,
        });
      }

      return new Response(JSON.stringify({ message: 'Unexpected path' }), {
        status: 500,
      });
    }) as typeof fetch,
    async () => {
      const config = { owner: 'o', repo: 'r', branch: 'main' };
      await assert.rejects(findSessionPathOnGitHubById('a/b', config), {
        message: /GitHub API error 500: Server error/,
      });
    }
  );
});

test('bulkPushSessions reports README update failure after pushing session content', async () => {
  let sessionPutCount = 0;

  await withMockedGitHub(
    (async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;

      if (
        path ===
          '/repos/o/r/contents/data/2025/03/20250314-matmetrics-session-1.md' &&
        (init?.method ?? 'GET') === 'GET'
      ) {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/03/20250314-matmetrics-session-1.md' &&
        (init?.method ?? 'GET') === 'PUT'
      ) {
        sessionPutCount++;
        return new Response(
          JSON.stringify({ content: { sha: 'session-sha' } }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/contents/README.md') {
        return new Response(JSON.stringify({ message: 'Server error' }), {
          status: 500,
        });
      }

      if (path === '/repos/o/r') {
        return new Response(JSON.stringify({ default_branch: 'main' }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          message: `Unexpected request: ${init?.method || 'GET'} ${path}`,
        }),
        { status: 500 }
      );
    }) as typeof fetch,
    async () => {
      const result = await bulkPushSessions([makeSession('session-1')], {
        owner: 'o',
        repo: 'r',
      });

      assert.equal(sessionPutCount, 1);
      assert.equal(result.success, false);
      assert.match(result.message, /Pushed 1\/1 sessions to GitHub/);
      assert.match(result.message, /README update failed:/);
      assert.match(
        result.message,
        /GitHub README update failed: GitHub service error \(500\)/
      );
    }
  );
});

test('createSessionOnGitHub treats an identical existing file as success', async () => {
  const session = makeSession('session-1');
  let putAttempts = 0;

  await withMockedGitHub(
    (async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;
      const method = init?.method ?? 'GET';

      if (path === '/repos/o/r') {
        return new Response(JSON.stringify({ default_branch: 'main' }), {
          status: 200,
        });
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/03/20250314-matmetrics-session-1.md' &&
        method === 'GET'
      ) {
        return new Response(
          JSON.stringify({
            sha: 'existing-sha',
            content: Buffer.from(sessionToMarkdown(session)).toString('base64'),
          }),
          { status: 200 }
        );
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/03/20250314-matmetrics-session-1.md' &&
        method === 'PUT'
      ) {
        putAttempts += 1;
        return new Response(JSON.stringify({ message: 'Should not write' }), {
          status: 500,
        });
      }

      return new Response(
        JSON.stringify({
          message: `Unexpected request: ${method} ${path}`,
        }),
        { status: 500 }
      );
    }) as typeof fetch,
    async () => {
      const result = await createSessionOnGitHub(session, {
        owner: 'o',
        repo: 'r',
      });

      assert.equal(result.success, true);
      assert.equal(result.message, 'Session already exists on GitHub');
      assert.equal(putAttempts, 0);
    }
  );
});

test('updateSessionOnGitHub moves the file when the session date changes', async () => {
  const requests: Array<{ method: string; path: string; body?: any }> = [];

  await withMockedGitHub(
    (async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, path, body });

      if (path === '/repos/o/r/git/ref/heads/main') {
        return new Response(
          JSON.stringify({ object: { sha: 'commit-sha', type: 'commit' } }),
          { status: 200 }
        );
      }

      if (path === '/repos/o/r/git/commits/commit-sha') {
        return new Response(JSON.stringify({ tree: { sha: 'tree-sha' } }), {
          status: 200,
        });
      }

      if (path === '/repos/o/r/git/trees/tree-sha') {
        return new Response(
          JSON.stringify({
            truncated: false,
            tree: [
              {
                path: 'data/2025/01/20250110-matmetrics-session-1.md',
                type: 'blob',
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/02/20250212-matmetrics-session-1.md' &&
        method === 'GET'
      ) {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/01/20250110-matmetrics-session-1.md' &&
        method === 'GET'
      ) {
        return new Response(JSON.stringify({ sha: 'old-sha' }), {
          status: 200,
        });
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/02/20250212-matmetrics-session-1.md' &&
        method === 'PUT'
      ) {
        return new Response(JSON.stringify({ content: { sha: 'new-sha' } }), {
          status: 200,
        });
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/01/20250110-matmetrics-session-1.md' &&
        method === 'DELETE'
      ) {
        assert.equal(body?.sha, 'old-sha');
        return new Response(
          JSON.stringify({ content: { sha: 'deleted-sha' } }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({ message: `Unexpected request: ${method} ${path}` }),
        { status: 500 }
      );
    }) as typeof fetch,
    async () => {
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
      assert.equal(
        result.filePath,
        'data/2025/02/20250212-matmetrics-session-1.md'
      );
      assert.ok(
        requests.some(
          (request) =>
            request.method === 'DELETE' &&
            request.path ===
              '/repos/o/r/contents/data/2025/01/20250110-matmetrics-session-1.md'
        )
      );
    }
  );
});

type MoveFailureState = {
  sourceSha: string | null;
  destinationSha: string | null;
  failSourceDeletes: number;
  failRollback: boolean;
};

function moveFailureHandler(session: JudoSession, state: MoveFailureState) {
  const source = 'data/2025/01/20250110-matmetrics-session-1.md';
  const destination = getGitHubSessionPath(session);
  const markdown = sessionToMarkdown(session);

  return (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const marker = '/contents/';
    const path = parsed.pathname.includes(marker)
      ? decodeURIComponent(parsed.pathname.split(marker)[1])
      : parsed.pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (parsed.pathname.includes('/git/ref/heads/')) {
      return new Response(JSON.stringify({ object: { sha: 'commit' } }));
    }
    if (parsed.pathname.includes('/git/commits/')) {
      return new Response(JSON.stringify({ tree: { sha: 'tree' } }));
    }
    if (parsed.pathname.includes('/git/trees/')) {
      const tree = [
        ...(state.sourceSha ? [{ path: source, type: 'blob' }] : []),
        ...(state.destinationSha ? [{ path: destination, type: 'blob' }] : []),
      ];
      return new Response(JSON.stringify({ truncated: false, tree }));
    }
    if (method === 'GET' && path === source && state.sourceSha) {
      return new Response(JSON.stringify({ sha: state.sourceSha }));
    }
    if (method === 'GET' && path === destination && state.destinationSha) {
      return new Response(
        JSON.stringify({
          sha: state.destinationSha,
          content: Buffer.from(markdown).toString('base64'),
        })
      );
    }
    if (method === 'GET') {
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
      });
    }
    if (method === 'PUT' && path === destination) {
      state.destinationSha = 'destination-sha';
      return new Response(
        JSON.stringify({ content: { sha: 'destination-sha' } })
      );
    }
    if (method === 'DELETE' && path === source) {
      if (body?.sha !== state.sourceSha || state.failSourceDeletes-- > 0) {
        return new Response(JSON.stringify({ message: 'sha conflict' }), {
          status: 409,
        });
      }
      state.sourceSha = null;
      return new Response(JSON.stringify({ commit: { sha: 'delete' } }));
    }
    if (method === 'DELETE' && path === destination) {
      if (state.failRollback) {
        return new Response(JSON.stringify({ message: 'rollback conflict' }), {
          status: 409,
        });
      }
      assert.equal(body.sha, 'destination-sha');
      state.destinationSha = null;
      return new Response(JSON.stringify({ commit: { sha: 'rollback' } }));
    }
    return new Response(JSON.stringify({ message: 'Unexpected request' }), {
      status: 500,
    });
  }) as typeof fetch;
}

const movedSession = {
  ...makeSession('session-1'),
  date: '2025-02-12',
};

test('a destination is rolled back when source deletion fails', async () => {
  const state: MoveFailureState = {
    sourceSha: 'old-sha',
    destinationSha: null,
    failSourceDeletes: 1,
    failRollback: false,
  };
  await withMockedGitHub(moveFailureHandler(movedSession, state), async () => {
    const result = await updateSessionOnGitHub(movedSession, {
      owner: 'o',
      repo: 'r',
      branch: 'main',
    });
    assert.equal(result.success, false);
    assert.equal(result.errorType, undefined);
    assert.equal(state.destinationSha, null);
    assert.equal(state.sourceSha, 'old-sha');
  });
});

test('a concurrent source modification causes a guarded rollback', async () => {
  const state: MoveFailureState = {
    sourceSha: 'newer-source-sha',
    destinationSha: null,
    failSourceDeletes: 0,
    failRollback: false,
  };
  const handler = moveFailureHandler(movedSession, state);
  let sourceReads = 0;
  await withMockedGitHub(
    (async (url, init) => {
      const response = await handler(url, init);
      if (
        (init?.method ?? 'GET') === 'GET' &&
        String(url).includes('20250110')
      ) {
        sourceReads += 1;
        if (sourceReads === 1) state.sourceSha = 'concurrent-sha';
      }
      return response;
    }) as typeof fetch,
    async () => {
      const result = await updateSessionOnGitHub(movedSession, {
        owner: 'o',
        repo: 'r',
        branch: 'main',
      });
      assert.equal(result.success, false);
      assert.equal(state.destinationSha, null);
    }
  );
});

test('rollback failure returns a typed resumable partial move', async () => {
  const state: MoveFailureState = {
    sourceSha: 'old-sha',
    destinationSha: null,
    failSourceDeletes: 1,
    failRollback: true,
  };
  await withMockedGitHub(moveFailureHandler(movedSession, state), async () => {
    const result = await updateSessionOnGitHub(movedSession, {
      owner: 'o',
      repo: 'r',
      branch: 'main',
    });
    assert.equal(result.errorType, 'partial_move');
    assert.equal(result.resumable, true);
    assert.equal(
      result.sourcePath,
      'data/2025/01/20250110-matmetrics-session-1.md'
    );
    assert.equal(result.destinationPath, getGitHubSessionPath(movedSession));
  });
});

test('retry completes a partial move with a matching destination', async () => {
  const state: MoveFailureState = {
    sourceSha: 'old-sha',
    destinationSha: 'destination-sha',
    failSourceDeletes: 0,
    failRollback: false,
  };
  await withMockedGitHub(moveFailureHandler(movedSession, state), async () => {
    const result = await updateSessionOnGitHub(movedSession, {
      owner: 'o',
      repo: 'r',
      branch: 'main',
    });
    assert.equal(result.success, true);
    assert.equal(state.sourceSha, null);
    assert.equal(state.destinationSha, 'destination-sha');
  });
});

test('resolveBranch cache is isolated by token fingerprint', async () => {
  let repoLookupCount = 0;

  await withMockedGitHub(
    (async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;

      if (path === '/repos/o/r') {
        repoLookupCount += 1;
        return new Response(
          JSON.stringify({
            default_branch:
              process.env.GITHUB_TOKEN === 'token-b' ? 'dev' : 'main',
          }),
          { status: 200 }
        );
      }

      if (path.includes('/contents/')) {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }

      return new Response(JSON.stringify({ message: 'Unexpected path' }), {
        status: 500,
      });
    }) as typeof fetch,
    async () => {
      const config = { owner: 'o', repo: 'r' };
      const session = makeSession('token-specific');

      process.env.GITHUB_TOKEN = 'token-a';
      await createSessionOnGitHub(session, config);
      await createSessionOnGitHub(session, config);

      process.env.GITHUB_TOKEN = 'token-b';
      await createSessionOnGitHub(session, config);

      assert.equal(repoLookupCount, 2);
    }
  );
});

test('default branch cache expires after TTL', async () => {
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  let repoLookupCount = 0;

  try {
    await withMockedGitHub(
      (async (url: string | URL | Request) => {
        const parsed = new URL(String(url));
        const path = parsed.pathname;

        if (path === '/repos/o/r') {
          repoLookupCount += 1;
          return new Response(JSON.stringify({ default_branch: 'main' }), {
            status: 200,
          });
        }

        if (path.includes('/contents/')) {
          return new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
          });
        }

        return new Response(JSON.stringify({ message: 'Unexpected path' }), {
          status: 500,
        });
      }) as typeof fetch,
      async () => {
        const config = { owner: 'o', repo: 'r' };
        const session = makeSession('ttl');

        await createSessionOnGitHub(session, config);
        now += 60 * 1000;
        await createSessionOnGitHub(session, config);
        now += 5 * 60 * 1000;
        await createSessionOnGitHub(session, config);

        assert.equal(repoLookupCount, 2);
      }
    );
  } finally {
    Date.now = originalNow;
  }
});

test('createSessionOnGitHub invalidates stale default branch cache and retries once on invalid ref write failure', async () => {
  const session = makeSession('branch-rename');
  let repoLookupCount = 0;
  let putCount = 0;

  await withMockedGitHub(
    (async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;
      const method = init?.method ?? 'GET';

      if (path === '/repos/o/r') {
        repoLookupCount += 1;
        return new Response(
          JSON.stringify({
            default_branch: repoLookupCount === 1 ? 'main' : 'trunk',
          }),
          { status: 200 }
        );
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/03/20250314-matmetrics-branch-rename.md' &&
        method === 'GET'
      ) {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }

      if (
        path ===
          '/repos/o/r/contents/data/2025/03/20250314-matmetrics-branch-rename.md' &&
        method === 'PUT'
      ) {
        putCount += 1;
        const body = init?.body ? JSON.parse(String(init.body)) : {};

        if (body.branch === 'main') {
          return new Response(
            JSON.stringify({ message: 'No commit found for the ref main' }),
            { status: 422 }
          );
        }

        if (body.branch === 'trunk') {
          return new Response(JSON.stringify({ content: { sha: 'new-sha' } }), {
            status: 200,
          });
        }
      }

      return new Response(
        JSON.stringify({ message: `Unexpected request: ${method} ${path}` }),
        { status: 500 }
      );
    }) as typeof fetch,
    async () => {
      const result = await createSessionOnGitHub(session, {
        owner: 'o',
        repo: 'r',
      });

      assert.equal(result.success, true);
      assert.equal(result.branch, 'trunk');
      assert.equal(repoLookupCount, 2);
      assert.equal(putCount, 2);
    }
  );
});
