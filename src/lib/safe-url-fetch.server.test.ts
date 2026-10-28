import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPinnedLookup,
  createSafeUrlFetcher,
  type ResolvedAddress,
} from './safe-url-fetch.server';

test('safe URL fetch rejects a hostname that resolves to a private IPv4 address', async () => {
  let fetchCalls = 0;
  const safeFetch = createSafeUrlFetcher(
    async () => [{ address: '127.0.0.1', family: 4 }],
    async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    }
  );

  await assert.rejects(
    safeFetch('https://media.example.test/video', 'HEAD'),
    /Blocked network hostname/
  );
  assert.equal(fetchCalls, 0);
});

test('safe URL fetch rejects a public and private mixed DNS answer', async () => {
  let fetchCalls = 0;
  const safeFetch = createSafeUrlFetcher(
    async () => [
      { address: '93.184.216.34', family: 4 },
      { address: 'fd00::1', family: 6 },
    ],
    async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    }
  );

  await assert.rejects(
    safeFetch('https://media.example.test/video', 'GET'),
    /Blocked network hostname/
  );
  assert.equal(fetchCalls, 0);
});

test('safe URL fetch pins a public DNS result and preserves legitimate requests', async () => {
  let receivedDispatcher: unknown;
  const safeFetch = createSafeUrlFetcher(
    async () => [{ address: '93.184.216.34', family: 4 }],
    async (_input, init) => {
      receivedDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher;
      return new Response(null, { status: 200 });
    }
  );

  const response = await safeFetch('https://media.example.test/video', 'HEAD');

  assert.equal(response.status, 200);
  assert.ok(receivedDispatcher);
});

test('pinned DNS lookup does not use a later changed DNS answer', () => {
  const resolved: ResolvedAddress[] = [
    { address: '93.184.216.34', family: 4 },
  ];
  const pinnedLookup = createPinnedLookup(resolved);
  resolved[0] = { address: '127.0.0.1', family: 4 };

  let actual: string | ResolvedAddress[] | undefined;
  pinnedLookup('media.example.test', { all: true }, (error, address) => {
    assert.equal(error, null);
    actual = address;
  });

  assert.deepEqual(actual, [{ address: '93.184.216.34', family: 4 }]);
});
