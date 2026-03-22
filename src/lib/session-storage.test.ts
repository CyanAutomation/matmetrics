import assert from 'node:assert/strict';
import test from 'node:test';
import { listSessionsFromGitHub } from './session-storage';

async function withMockedGitHub(
  handler: typeof fetch,
  run: () => Promise<void>
) {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = handler;

  try {
    await run();
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
}

function toContentsPayload(markdown: string) {
  return {
    content: Buffer.from(markdown, 'utf8').toString('base64'),
  };
}

test('listSessionsFromGitHub only includes canonical matmetrics session markdown files', async () => {
  const dirListing: Record<
    string,
    Array<{ path: string; type: 'file' | 'dir'; name: string }>
  > = {
    data: [{ name: '2025', path: 'data/2025', type: 'dir' }],
    'data/2025': [{ name: '03', path: 'data/2025/03', type: 'dir' }],
    'data/2025/03': [
      {
        name: '20250314-matmetrics-valid-session.md',
        path: 'data/2025/03/20250314-matmetrics-valid-session.md',
        type: 'file',
      },
      {
        name: 'notes.md',
        path: 'data/2025/03/notes.md',
        type: 'file',
      },
      {
        name: '20250314-unrelated.md',
        path: 'data/2025/03/20250314-unrelated.md',
        type: 'file',
      },
      {
        name: '20250214-matmetrics-wrong-month.md',
        path: 'data/2025/03/20250214-matmetrics-wrong-month.md',
        type: 'file',
      },
    ],
  };

  const contentByPath: Record<string, string> = {
    'data/2025/03/20250314-matmetrics-valid-session.md': `---
id: "session-valid"
date: "2025-03-14"
effort: 3
category: "Technical"
---

## Techniques Practiced
- O soto gari
`,
  };

  await withMockedGitHub(
    (async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      const marker = '/contents/';
      const path = decodeURIComponent(
        parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length)
      );

      if (path in dirListing) {
        return new Response(JSON.stringify(dirListing[path]), { status: 200 });
      }

      const content = contentByPath[path];
      if (content) {
        return new Response(JSON.stringify(toContentsPayload(content)), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ message: `Not found: ${path}` }), {
        status: 404,
      });
    }) as typeof fetch,
    async () => {
      const sessions = await listSessionsFromGitHub({ owner: 'o', repo: 'r' });
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0]?.id, 'session-valid');
    }
  );
});

test('listSessionsFromGitHub skips malformed canonical files and logs warnings', async () => {
  const dirListing: Record<
    string,
    Array<{ path: string; type: 'file' | 'dir'; name: string }>
  > = {
    data: [{ name: '2025', path: 'data/2025', type: 'dir' }],
    'data/2025': [{ name: '03', path: 'data/2025/03', type: 'dir' }],
    'data/2025/03': [
      {
        name: '20250314-matmetrics-valid-session.md',
        path: 'data/2025/03/20250314-matmetrics-valid-session.md',
        type: 'file',
      },
      {
        name: '20250315-matmetrics-broken-session.md',
        path: 'data/2025/03/20250315-matmetrics-broken-session.md',
        type: 'file',
      },
      {
        name: 'readme.md',
        path: 'data/2025/03/readme.md',
        type: 'file',
      },
    ],
  };

  const contentByPath: Record<string, string> = {
    'data/2025/03/20250314-matmetrics-valid-session.md': `---
id: "session-valid"
date: "2025-03-14"
effort: 4
category: "Randori"
---

## Techniques Practiced
- Uchi mata
`,
    'data/2025/03/20250315-matmetrics-broken-session.md': `---
date: "2025-03-15"
effort: 2
category: "Technical"
---

## Techniques Practiced
- Tai otoshi
`,
  };

  const originalWarn = console.warn;
  const warnCalls: string[] = [];
  console.warn = ((...args: unknown[]) => {
    warnCalls.push(args.map((arg) => String(arg)).join(' '));
  }) as typeof console.warn;

  try {
    await withMockedGitHub(
      (async (url: string | URL | Request) => {
        const parsed = new URL(String(url));
        const marker = '/contents/';
        const path = decodeURIComponent(
          parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length)
        );

        if (path in dirListing) {
          return new Response(JSON.stringify(dirListing[path]), {
            status: 200,
          });
        }

        const content = contentByPath[path];
        if (content) {
          return new Response(JSON.stringify(toContentsPayload(content)), {
            status: 200,
          });
        }

        return new Response(JSON.stringify({ message: `Not found: ${path}` }), {
          status: 404,
        });
      }) as typeof fetch,
      async () => {
        const sessions = await listSessionsFromGitHub({
          owner: 'o',
          repo: 'r',
        });
        assert.equal(sessions.length, 1);
        assert.equal(sessions[0]?.id, 'session-valid');
      }
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnCalls.length, 1);
  assert.match(
    warnCalls[0] ?? '',
    /Skipping GitHub session file at data\/2025\/03\/20250315-matmetrics-broken-session\.md/
  );
});
