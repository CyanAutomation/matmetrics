import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { createSessionHistorySearchPost } from './handler';
import type { SessionHistorySearchCandidate } from '@/lib/session-history-search';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

const candidate: SessionHistorySearchCandidate = {
  id: 'session-1',
  date: '2026-10-19',
  category: 'Randori',
  effort: 4,
  techniques: ['Uchi-mata'],
  description: 'Worked entries against a taller partner.',
  notes: 'Could not secure the grip.',
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/search-sessions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('semantic history search authenticates, validates, and returns ranked matches', async () => {
  const post = createSessionHistorySearchPost(async (query, candidates) => {
    assert.equal(query, 'sessions with taller partners');
    assert.deepEqual(candidates, [candidate]);
    return [{ id: candidate.id, relevance: 0.91 }];
  });

  const response = await post(
    request({ query: 'sessions with taller partners', candidates: [candidate] })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    matches: [{ id: candidate.id, relevance: 0.91 }],
  });
});

test('semantic history search rejects invalid candidates before calling JEV', async () => {
  let calls = 0;
  const post = createSessionHistorySearchPost(async () => {
    calls += 1;
    return [];
  });

  const tooManyCandidates = Array.from({ length: 9 }, (_, index) => ({
    ...candidate,
    id: `session-${index}`,
  }));
  const response = await post(
    request({ query: 'relevant sessions', candidates: tooManyCandidates })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' },
  });
  assert.equal(calls, 0);
});

test('semantic history search rejects unauthenticated requests before calling JEV', async () => {
  let calls = 0;
  const post = createSessionHistorySearchPost(async () => {
    calls += 1;
    return [];
  });
  const unauthenticatedRequest = new NextRequest(
    'http://localhost/api/ai/search-sessions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'relevant sessions', candidates: [candidate] }),
    }
  );

  const response = await post(unauthenticatedRequest);

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
