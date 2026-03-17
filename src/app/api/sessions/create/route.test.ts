import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { __resetBlobStorageDepsForTests, __setBlobStorageDepsForTests } from '@/lib/vercel-blob-storage';

type BlobRecord = {
  pathname: string;
  url: string;
  body: string;
};

function createInMemoryBlobDeps() {
  const blobs = new Map<string, BlobRecord>();
  const toUrl = (pathname: string) => `https://blob.local/${pathname}`;

  return {
    deps: {
      put: async (pathname: string, body: any, options?: { allowOverwrite?: boolean }) => {
        if (options?.allowOverwrite === false && blobs.has(pathname)) {
          const error = new Error('already exists') as Error & { code?: string };
          error.code = 'BLOB_ALREADY_EXISTS';
          throw error;
        }

        blobs.set(pathname, {
          pathname,
          url: toUrl(pathname),
          body: String(body),
        });

        return { pathname, url: toUrl(pathname) } as any;
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
      list: async ({ prefix = '', limit = 10000 }: { prefix?: string; limit?: number }) => {
        return {
          blobs: [...blobs.values()]
            .filter(blob => blob.pathname.startsWith(prefix))
            .slice(0, limit)
            .map(blob => ({ pathname: blob.pathname, url: blob.url })),
        } as any;
      },
      fetch: async (url: string | URL | Request) => {
        const value = String(url);
        const blob = [...blobs.values()].find(entry => entry.url === value);
        return blob ? new Response(blob.body, { status: 200 }) : new Response('', { status: 404 });
      },
    },
  };
}

test('POST includes warning when GitHub create sync result reports success:false', async () => {
  const { deps } = createInMemoryBlobDeps();
  __setBlobStorageDepsForTests(deps as any);

  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const warns: unknown[][] = [];

  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = async (url: string | URL | Request) => {
    const text = String(url);
    if (text.startsWith('https://api.github.com/')) {
      return new Response(JSON.stringify({ message: 'simulated github outage' }), { status: 500 });
    }

    throw new Error(`Unexpected fetch URL: ${text}`);
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };

  try {
    const response = await POST(
      new NextRequest('http://localhost/api/sessions/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'create-warning-id',
          date: '2025-01-12',
          effort: 3,
          category: 'Technical',
          techniques: [],
          gitHubConfig: { owner: 'octocat', repo: 'hello-world' },
        }),
      })
    );

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.id, 'create-warning-id');
    assert.equal(typeof payload.warning, 'string');
    assert.match(payload.warning, /GitHub sync failed/);
    assert.equal(warns.length, 1);
    assert.equal(warns[0][0], 'GitHub session create sync reported failure');
  } finally {
    console.warn = originalWarn;
    global.fetch = originalFetch;
    process.env.GITHUB_TOKEN = originalToken;
    __resetBlobStorageDepsForTests();
  }
});
