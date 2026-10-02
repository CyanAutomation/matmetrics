import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDashboardOverviewStats } from './dashboard-overview-stats';
import { DEFAULT_TRAINING_PLAN, type JudoSession } from './types';

const session = (
  id: string,
  date: string,
  category: JudoSession['category'],
  effort: JudoSession['effort'],
  techniques: string[]
): JudoSession => ({ id, date, category, effort, techniques });

test('dashboard overview stats are absent when there are no sessions', () => {
  assert.equal(
    calculateDashboardOverviewStats({
      sessions: [],
      enabledCategories: ['Technical'],
      trainingPlan: DEFAULT_TRAINING_PLAN,
      distributionWindow: 30,
      now: new Date(2026, 4, 31, 12),
    }),
    null
  );
});

test('dashboard stats apply the selected window and enabled categories', () => {
  const stats = calculateDashboardOverviewStats({
    sessions: [
      session('today', '2026-05-31', 'Technical', 4, [
        'Uchi-mata',
        'O-soto-gari',
      ]),
      session('recent', '2026-05-20', 'Randori', 3, ['O-soto-gari']),
      session('outside-window', '2026-05-01', 'Technical', 2, ['Seoi-nage']),
      session('disabled-category', '2026-05-25', 'Shiai', 1, ['Tai-otoshi']),
    ],
    enabledCategories: ['Technical', 'Randori'],
    trainingPlan: {
      categories: {
        ...DEFAULT_TRAINING_PLAN.categories,
        Technical: { targetSessions: 1, cadence: 'week' },
        Randori: { targetSessions: 1, cadence: 'month' },
      },
    },
    distributionWindow: 30,
    now: new Date(2026, 4, 31, 12),
  });

  assert.ok(stats);
  assert.equal(stats.totalSessions, 4);
  assert.equal(stats.avgEffort, '2.5');
  assert.equal('rollingStart' in stats, false);
  assert.equal('latestSessionDate' in stats, false);
  assert.deepEqual(stats.topTechniques, [
    { name: 'O-soto-gari', count: 2 },
    { name: 'Uchi-mata', count: 1 },
    { name: 'Tai-otoshi', count: 1 },
  ]);
  assert.deepEqual(stats.categoryStats, [
    { name: 'Technical', count: 1 },
    { name: 'Randori', count: 1 },
  ]);
  assert.equal(stats.trainingDataRange, 'Last 30 days');
  assert.equal(stats.sessionsInLastFortnight, 3);
  assert.equal(stats.completedRollingTarget, 2);
  assert.equal(stats.effectiveRollingTarget, 5);
  assert.equal(stats.nextFocus, 'Technical');
  assert.equal(stats.remainingPlanSessions, 3);
});

test('all-session mode includes the full history and shows its date range', () => {
  const stats = calculateDashboardOverviewStats({
    sessions: [
      session('older', '2025-12-31', 'Technical', 2, ['Seoi-nage']),
      session('newer', '2026-05-31', 'Technical', 4, ['Uchi-mata']),
    ],
    enabledCategories: ['Technical'],
    trainingPlan: DEFAULT_TRAINING_PLAN,
    distributionWindow: 'all',
    now: new Date(2026, 4, 31, 12),
  });

  assert.ok(stats);
  assert.deepEqual(stats.topTechniques, [
    { name: 'Uchi-mata', count: 1 },
    { name: 'Seoi-nage', count: 1 },
  ]);
  assert.equal(stats.trainingDataRange, 'Dec 31, 2025 – May 31, 2026');
  assert.equal(stats.needsTrainingNudge, false);
});
