import assert from 'node:assert/strict';
import test from 'node:test';

import type { SessionThemeAssessment } from './jev-client';
import type { JudoSession } from './types';
import {
  getRecurringTrainingThemeSummary,
  getHistoryReviewFindings,
  HISTORY_REVIEW_BATCH_MAX_BYTES,
  reviewHistoryBatch,
  type HistoryReviewResult,
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
  effortConflictProbability: 0.1,
  unsupportedTechniqueTags: [],
};

function reviewedThemeSession(
  sessionId: string,
  sessionDate: string,
  trainingThemes: SessionThemeAssessment
): HistoryReviewResult {
  return {
    sessionId,
    sessionDate,
    currentCategory: 'Technical',
    currentEffort: 3,
    assessment: { ...assessment, trainingThemes },
  };
}

test('history review processes the full corpus in batches without sending IDs', async () => {
  const calls: unknown[][] = [];
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
    async (inputs) => {
      calls.push(inputs);
      return inputs.map(() => assessment);
    }
  );

  assert.deepEqual(
    result.map((entry) => entry.sessionId),
    ['newest', 'second', 'third', 'fourth', 'fifth', 'sixth', 'old']
  );
  assert.deepEqual(calls[0]?.[0], {
    description: 'Newest description.',
    notes: 'Private note.',
    category: 'Technical',
    effort: 3,
    techniques: ['Uchi-mata'],
  });
  assert.deepEqual(Object.keys(calls[0]?.[0] ?? {}), [
    'description',
    'notes',
    'category',
    'effort',
    'techniques',
  ]);
  assert.equal(JSON.stringify(calls).includes('skip-reviewed'), false);
  assert.deepEqual(calls.map((batch) => batch.length), [3, 3, 1]);
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
    async (inputs) => {
      if (inputs.length > 1)
        throw new Error('batch unavailable');
      if (inputs[0]?.description.startsWith('First'))
        throw new Error('private provider text');
      return inputs.map(() => assessment);
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

test('history review splits batches to fit the request byte budget', async () => {
  const requests: string[] = [];
  const sessions = Array.from({ length: 5 }, (_, index) =>
    session(`session-${index}`, `2026-09-${String(28 - index).padStart(2, '0')}`, 'd'.repeat(5000))
  );
  const results = await reviewHistoryBatch(sessions, new Set(), async (inputs) => {
    requests.push(JSON.stringify({ sessions: inputs }));
    return inputs.map(() => assessment);
  });

  assert.equal(results.length, 5);
  assert.ok(requests.length > 1);
  assert.ok(
    requests.every(
      (request) => new TextEncoder().encode(request).byteLength <= HISTORY_REVIEW_BATCH_MAX_BYTES
    )
  );
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

test('recurring-theme summary counts successful assessments across the reviewed corpus', () => {
  const summary = getRecurringTrainingThemeSummary([
    {
      sessionId: 'failed-newest',
      sessionDate: '2026-09-29',
      currentCategory: 'Technical',
      currentEffort: 3,
      error: true,
    },
    reviewedThemeSession('newest', '2026-09-28', {
      kumi_kata: 0.7,
      ne_waza: 0.4,
      transitions: 0.1,
      competition_tactics: 0.1,
    }),
    reviewedThemeSession('second', '2026-09-27', {
      kumi_kata: 0.95,
      ne_waza: 0.8,
      transitions: 0.1,
      competition_tactics: 0.1,
    }),
    reviewedThemeSession('third', '2026-09-26', {
      kumi_kata: 0.69,
      ne_waza: 0.75,
      transitions: 0.9,
      competition_tactics: 0.1,
    }),
    reviewedThemeSession('fourth', '2026-09-25', {
      kumi_kata: 0.8,
      ne_waza: 0.1,
      transitions: 0.1,
      competition_tactics: 0.9,
    }),
    reviewedThemeSession('fifth', '2026-09-24', {
      kumi_kata: 0.1,
      ne_waza: 0.1,
      transitions: 0.1,
      competition_tactics: 0.1,
    }),
    reviewedThemeSession('outside-window', '2026-09-23', {
      kumi_kata: 1,
      ne_waza: 1,
      transitions: 1,
      competition_tactics: 1,
    }),
  ]);

  assert.equal(summary.consideredSessions, 6);
  assert.deepEqual(summary.themes, [
    {
      theme: 'kumi_kata',
      matchingSessions: 4,
      consideredSessions: 6,
      recentSessionIds: ['newest', 'second', 'fourth', 'outside-window'],
    },
    {
      theme: 'ne_waza',
      matchingSessions: 3,
      consideredSessions: 6,
      recentSessionIds: ['second', 'third', 'outside-window'],
    },
    {
      theme: 'transitions',
      matchingSessions: 2,
      consideredSessions: 6,
      recentSessionIds: ['third', 'outside-window'],
    },
    {
      theme: 'competition_tactics',
      matchingSessions: 2,
      consideredSessions: 6,
      recentSessionIds: ['fourth', 'outside-window'],
    },
  ]);
});

test('recurring-theme summary requires two matching sessions', () => {
  const summary = getRecurringTrainingThemeSummary([
    reviewedThemeSession('only-match', '2026-09-28', {
      kumi_kata: 0.99,
      ne_waza: 0.1,
      transitions: 0.1,
      competition_tactics: 0.1,
    }),
    reviewedThemeSession('no-match', '2026-09-27', {
      kumi_kata: 0.4,
      ne_waza: 0.1,
      transitions: 0.1,
      competition_tactics: 0.1,
    }),
  ]);

  assert.equal(summary.consideredSessions, 2);
  assert.deepEqual(summary.themes, []);
});
