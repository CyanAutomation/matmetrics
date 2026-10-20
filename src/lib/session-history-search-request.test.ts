import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSessionHistorySearchRequest } from './session-history-search-request';
import type { SessionHistorySearchCandidate } from './session-history-search';

const candidate: SessionHistorySearchCandidate = {
  id: 'session-1',
  date: '2026-10-19',
  category: 'Randori',
  effort: 4,
  techniques: ['Uchi-mata'],
  description: 'Worked entries against a taller partner.',
  notes: 'Could not secure the grip.',
};

test('search request accepts bounded query and candidates', () => {
  assert.deepEqual(
    parseSessionHistorySearchRequest({
      query: 'sessions with taller partners',
      candidates: [candidate],
    }),
    {
      ok: true,
      input: {
        query: 'sessions with taller partners',
        candidates: [candidate],
      },
    }
  );
});

test('search request rejects empty or oversized query and candidate lists', () => {
  const cases = [
    { query: '  ', candidates: [candidate] },
    { query: 'q'.repeat(501), candidates: [candidate] },
    { query: 'relevant', candidates: [] },
    {
      query: 'relevant',
      candidates: Array.from({ length: 9 }, (_, index) => ({ ...candidate, id: `session-${index}` })),
    },
  ];

  for (const body of cases) {
    assert.equal(parseSessionHistorySearchRequest(body).ok, false);
  }
});

test('search request rejects invalid fields, duplicate IDs, and over-limit candidate text', () => {
  const cases = [
    { query: 'relevant', candidates: [{ ...candidate, id: '' }] },
    { query: 'relevant', candidates: [{ ...candidate, date: 'not-a-date' }] },
    { query: 'relevant', candidates: [{ ...candidate, effort: 6 }] },
    { query: 'relevant', candidates: [{ ...candidate, description: 'd'.repeat(401) }] },
    { query: 'relevant', candidates: [candidate, candidate] },
  ];

  for (const body of cases) {
    assert.equal(parseSessionHistorySearchRequest(body).ok, false);
  }
});
