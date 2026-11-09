import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SessionHistoryFilterController,
  type SessionHistoryDensity,
} from './session-history-filter-controller';

test('history filter controller starts with the existing compact, unfiltered state', () => {
  const controller = new SessionHistoryFilterController();

  assert.deepEqual(controller.getSnapshot(), {
    searchQuery: '',
    categoryFilter: 'all',
    effortFilter: 'all',
    fromDate: '',
    toDate: '',
    filtersOpen: false,
    density: 'compact',
  });
});

test('history filter controller publishes immutable snapshots and stops after unsubscribe', () => {
  const controller = new SessionHistoryFilterController();
  const initial = controller.getSnapshot();
  const snapshots: unknown[] = [];
  const unsubscribe = controller.subscribe(() => {
    snapshots.push(controller.getSnapshot());
  });

  controller.setSearchQuery('uchi mata');
  assert.equal(initial.searchQuery, '');
  assert.equal(controller.getSnapshot().searchQuery, 'uchi mata');
  assert.equal(snapshots.length, 1);

  unsubscribe();
  controller.setCategoryFilter('Technical');
  assert.equal(snapshots.length, 1);
});

test('history filter controller applies quick filters and technique filters', () => {
  const controller = new SessionHistoryFilterController();
  const today = new Date('2026-11-09T12:00:00.000Z');

  controller.applyQuickFilter('week', today);
  assert.equal(controller.getSnapshot().effortFilter, 'all');
  assert.equal(controller.getSnapshot().fromDate, '2026-11-03');
  assert.equal(controller.getSnapshot().toDate, '2026-11-09');

  controller.applyQuickFilter('high-effort', today);
  assert.equal(controller.getSnapshot().effortFilter, '4');
  assert.equal(controller.getSnapshot().fromDate, '');
  assert.equal(controller.getSnapshot().toDate, '');

  controller.setFiltersOpen(true);
  controller.filterByTechnique('Uchi-mata');
  assert.equal(controller.getSnapshot().searchQuery, 'Uchi-mata');
  assert.equal(controller.getSnapshot().filtersOpen, false);
});

test('clear filters keeps display density and filter visibility unchanged', () => {
  const controller = new SessionHistoryFilterController();
  controller.setSearchQuery('seoi nage');
  controller.setCategoryFilter('Technical');
  controller.setEffortFilter('5');
  controller.setFromDate('2026-11-01');
  controller.setToDate('2026-11-09');
  controller.setFiltersOpen(true);
  const density: SessionHistoryDensity = 'comfortable';
  controller.setDensity(density);

  controller.clearFilters();

  assert.deepEqual(controller.getSnapshot(), {
    searchQuery: '',
    categoryFilter: 'all',
    effortFilter: 'all',
    fromDate: '',
    toDate: '',
    filtersOpen: true,
    density: 'comfortable',
  });
});
