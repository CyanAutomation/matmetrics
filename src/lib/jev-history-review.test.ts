import assert from 'node:assert/strict';
import test from 'node:test';

import type { JudoSession } from './types';
import {
  getHistoryReviewFindings,
  reviewHistoryBatch,
} from './jev-history-review';

function session(
  id: string,
  date: string,
  description?: string,
  notes?: string
): JudoSession {
  return {
    id,
    date,
    description,
    notes,
    techniques: [],
    effort: 3,
    category: 'Technical',
  };
}

const assessment = {
  suggestedCategory: 'Technical' as const,
  categoryConfidence: 0.9,
  categoryFitProbability: 0.9,
  hasUsefulDetail: 0.9,
  hasReflection: 0.9,
  fatigueSignal: 0.2,
  injurySignal: 0.1,
  effortConflictProbability: 0.1,
  unsupportedTechniqueTags: [],
};

test('history review processes the next five newest described sessions without sending IDs', async () => {
  const calls: unknown[] = [];
  const sessions = [
    session('old', '2026-01-01', 'Old session.'),
    session('skip-reviewed', '2026-09-20', 'Already reviewed.'),
    {
      ...session(
        'newest',
        '2026-09-28',
        'Newest description.',
        'Private note.'
      ),
      techniques: ['Uchi-mata'],
    },
    session('blank', '2026-09-27', '  '),
    session('second', '2026-09-26', 'Second newest.'),
    session('third', '2026-09-25', 'Third newest.'),
    session('fourth', '2026-09-24', 'Fourth newest.'),
    session('fifth', '2026-09-23', 'Fifth newest.'),
    session('sixth', '2026-09-22', 'Sixth newest.'),
  ];

  const result = await reviewHistoryBatch(
    sessions,
    new Set(['skip-reviewed']),
    async (input) => {
      calls.push(input);
      return assessment;
    }
  );

  assert.deepEqual(
    result.map((entry) => entry.sessionId),
    ['newest', 'second', 'third', 'fourth', 'fifth']
  );
  assert.deepEqual(calls[0], {
    description: 'Newest description.',
    notes: 'Private note.',
    category: 'Technical',
    effort: 3,
    techniques: ['Uchi-mata'],
  });
  assert.deepEqual(Object.keys(calls[0] as Record<string, unknown>), [
    'description',
    'notes',
    'category',
    'effort',
    'techniques',
  ]);
  assert.equal(JSON.stringify(calls).includes('skip-reviewed'), false);
  assert.equal(
    result.every((entry) => entry.assessment === assessment),
    true
  );
});

test('history review records per-session failures and continues through the batch', async () => {
  const result = await reviewHistoryBatch(
    [
      session('first', '2026-09-28', 'First session.'),
      session('second', '2026-09-27', 'Second session.'),
    ],
    new Set(),
    async ({ description }) => {
      if (description.startsWith('First'))
        throw new Error('private provider text');
      return assessment;
    }
  );

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    sessionId: 'first',
    sessionDate: '2026-09-28',
    currentCategory: 'Technical',
    currentEffort: 3,
    error: true,
  });
  assert.equal(result[1]?.assessment, assessment);
});

test('history review findings keep category, effort, and detail suggestions distinct', () => {
  const findings = getHistoryReviewFindings({
    sessionId: 'session-private-id',
    sessionDate: '2026-09-28',
    currentCategory: 'Randori',
    currentEffort: 2,
    assessment: {
      ...assessment,
      suggestedCategory: 'Technical',
      categoryConfidence: 0.9,
      categoryFitProbability: 0.9,
      hasUsefulDetail: 0.2,
      hasReflection: 0.4,
      effortConflictProbability: 0.9,
    },
  });

  assert.deepEqual(findings, {
    categoryMismatch: 'Technical',
    categoryUnclear: false,
    needsUsefulDetail: true,
    needsReflection: true,
    effortMismatch: true,
    fatigueMention: false,
    injuryMention: false,
  });
});

test('history review does not call a short but specific entry incomplete', () => {
  const findings = getHistoryReviewFindings({
    sessionId: 'session-short-id',
    sessionDate: '2026-09-28',
    currentCategory: 'Technical',
    currentEffort: 3,
    assessment: {
      ...assessment,
      hasUsefulDetail: 0.8,
      effortConflictProbability: 0.1,
    },
  });

  assert.equal(findings.needsUsefulDetail, false);
  assert.equal(findings.effortMismatch, false);
});
