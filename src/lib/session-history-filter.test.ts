import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterSessionHistory,
  getSessionHistoryActiveFilterCount,
  getSessionHistoryStats,
  getSessionQuickFilterRange,
} from './session-history-filter';
import type { JudoSession } from './types';

const sessions: JudoSession[] = [
  {
    id: 'technical',
    date: '2026-09-20',
    category: 'Technical',
    effort: 3,
    techniques: ['Uchi mata'],
    description: 'Grip movement',
    duration: 90,
  },
  {
    id: 'randori',
    date: '2026-09-22',
    category: 'Randori',
    effort: 5,
    techniques: ['Newaza'],
    notes: 'Hard rounds',
    duration: 60,
  },
];

test('filters by session fields, date range, and normalized search text', () => {
  const filtered = filterSessionHistory(sessions, {
    searchQuery: '  UCHI MATA ',
    categoryFilter: 'Technical',
    effortFilter: '3',
    fromDate: '2026-09-19',
    toDate: '2026-09-21',
  });

  assert.deepEqual(filtered.map((session) => session.id), ['technical']);
});

test('search includes category, description, notes, techniques, and date', () => {
  assert.deepEqual(
    filterSessionHistory(sessions, {
      searchQuery: 'hard rounds',
      categoryFilter: 'all',
      effortFilter: 'all',
      fromDate: '',
      toDate: '',
    }).map((session) => session.id),
    ['randori']
  );
  assert.deepEqual(
    filterSessionHistory(sessions, {
      searchQuery: '2026-09-20',
      categoryFilter: 'all',
      effortFilter: 'all',
      fromDate: '',
      toDate: '',
    }).map((session) => session.id),
    ['technical']
  );
});

test('reports effort and duration statistics plus active filter count', () => {
  assert.deepEqual(getSessionHistoryStats(sessions), {
    averageEffort: 4,
    duration: 150,
  });
  assert.deepEqual(getSessionHistoryStats([]), {
    averageEffort: 0,
    duration: 0,
  });
  assert.equal(
    getSessionHistoryActiveFilterCount({
      categoryFilter: 'Technical',
      effortFilter: '4',
      fromDate: '2026-09-01',
      toDate: '',
    }),
    3
  );
});

test('quick filters retain the existing week, month, and high-effort ranges', () => {
  const today = new Date('2026-09-29T00:00:00.000Z');

  assert.deepEqual(getSessionQuickFilterRange('week', today), {
    effortFilter: 'all',
    fromDate: '2026-09-23',
    toDate: '2026-09-29',
  });
  assert.deepEqual(getSessionQuickFilterRange('month', today), {
    effortFilter: 'all',
    fromDate: '2026-08-31',
    toDate: '2026-09-29',
  });
  assert.deepEqual(getSessionQuickFilterRange('high-effort', today), {
    effortFilter: '4',
    fromDate: '',
    toDate: '',
  });
});
