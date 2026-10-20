import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSessionHistorySearchMatches,
  SESSION_HISTORY_SEARCH_CANDIDATE_LIMIT,
  selectSessionHistorySearchCandidates,
} from './session-history-search';
import type { JudoSession } from './types';

function session(
  id: string,
  date: string,
  description: string,
  notes = ''
): JudoSession {
  return {
    id,
    date,
    category: 'Randori',
    effort: 4,
    techniques: ['Uchi-mata'],
    description,
    notes,
  };
}

test('candidate retrieval keeps lexical matches and fills the bounded set by recency', () => {
  const sessions = [
    session('old-match', '2020-01-01', 'Tall opponents blocked my entries.'),
    ...Array.from({ length: 12 }, (_, index) =>
      session(`recent-${index}`, `2026-10-${String(20 - index).padStart(2, '0')}`, 'General practice.')
    ),
  ];

  const candidates = selectSessionHistorySearchCandidates(
    sessions,
    'tall opponents'
  );

  assert.equal(candidates.length, SESSION_HISTORY_SEARCH_CANDIDATE_LIMIT);
  assert.equal(candidates[0]?.id, 'old-match');
  assert.ok(candidates.some((candidate) => candidate.id === 'recent-0'));
  assert.ok(!candidates.some((candidate) => candidate.id === 'recent-8'));
});

test('candidate retrieval selects recent sessions when a paraphrase has no lexical hit', () => {
  const sessions = [
    session('older', '2026-09-01', 'Grip fighting and attacks.'),
    session('newest', '2026-10-19', 'Randori with a larger partner.'),
    session('middle', '2026-10-10', 'Newaza transitions.'),
  ];

  assert.deepEqual(
    selectSessionHistorySearchCandidates(
      sessions,
      'could not get an entry against a bigger person'
    ).map((candidate) => candidate.id),
    ['newest', 'middle', 'older']
  );
});

test('candidate retrieval returns no candidates for a blank query and bounds text sent for each session', () => {
  const longSession = session(
    'session-1',
    '2026-10-19',
    'd'.repeat(5000),
    'n'.repeat(5000)
  );
  longSession.techniques = Array.from({ length: 12 }, (_, index) => `Technique ${index} ${'t'.repeat(200)}`);

  assert.deepEqual(selectSessionHistorySearchCandidates([longSession], '  '), []);
  const [candidate] = selectSessionHistorySearchCandidates(
    [longSession],
    'practice details'
  );
  assert.ok(candidate);
  assert.ok(new TextEncoder().encode(candidate.description).byteLength <= 400);
  assert.ok(new TextEncoder().encode(candidate.notes).byteLength <= 400);
  assert.ok(candidate.techniques.length <= 4);
  assert.ok(candidate.techniques.every((tag) => new TextEncoder().encode(tag).byteLength <= 80));
});

test('semantic result validation only accepts unique candidates above the display threshold', () => {
  const allowedIds = new Set(['candidate-a', 'candidate-b']);

  assert.equal(
    isSessionHistorySearchMatches(
      [
        { id: 'candidate-a', relevance: 0.8 },
        { id: 'candidate-b', relevance: 0.6 },
      ],
      allowedIds
    ),
    true
  );
  assert.equal(
    isSessionHistorySearchMatches(
      [{ id: 'other-session', relevance: 0.9 }],
      allowedIds
    ),
    false
  );
  assert.equal(
    isSessionHistorySearchMatches(
      [{ id: 'candidate-a', relevance: 0.4 }],
      allowedIds
    ),
    false
  );
});

test('eight escaped candidate excerpts and a maximum query fit the AI route body limit', () => {
  const sessions = Array.from({ length: 8 }, (_, index) => {
    const value = session(
      `session-${index}`,
      `2026-10-${String(index + 1).padStart(2, '0')}`,
      '"'.repeat(2000),
      '\\'.repeat(2000)
    );
    value.techniques = ['"'.repeat(300), '\\'.repeat(300), 'Tag'];
    return value;
  });
  const requestBody = JSON.stringify({
    query: 'q'.repeat(500),
    candidates: selectSessionHistorySearchCandidates(sessions, 'q'),
  });

  assert.ok(new TextEncoder().encode(requestBody).byteLength < 16 * 1024);
});
