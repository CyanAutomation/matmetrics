import type { JudoSession } from './types';

export interface SessionHistoryFilters {
  searchQuery: string;
  categoryFilter: string;
  effortFilter: string;
  fromDate: string;
  toDate: string;
}

export type SessionHistoryQuickFilter = 'week' | 'month' | 'high-effort';

export function filterSessionHistory(
  sessions: JudoSession[],
  filters: SessionHistoryFilters
): JudoSession[] {
  const normalizedQuery = filters.searchQuery.trim().toLocaleLowerCase();

  return sessions.filter((session) => {
    if (
      filters.categoryFilter !== 'all' &&
      session.category !== filters.categoryFilter
    ) {
      return false;
    }
    if (
      filters.effortFilter !== 'all' &&
      session.effort !== Number(filters.effortFilter)
    ) {
      return false;
    }
    if (filters.fromDate && session.date < filters.fromDate) return false;
    if (filters.toDate && session.date > filters.toDate) return false;
    if (!normalizedQuery) return true;

    return [
      ...session.techniques,
      session.category,
      session.description,
      session.notes,
      session.date,
    ]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function getSessionHistoryStats(sessions: JudoSession[]) {
  const duration = sessions.reduce(
    (total, session) => total + (session.duration ?? 0),
    0
  );
  const averageEffort = sessions.length
    ? sessions.reduce((total, session) => total + session.effort, 0) /
      sessions.length
    : 0;

  return { averageEffort, duration };
}

export function getSessionHistoryActiveFilterCount(
  filters: Pick<
    SessionHistoryFilters,
    'categoryFilter' | 'effortFilter' | 'fromDate' | 'toDate'
  >
): number {
  return [
    filters.categoryFilter !== 'all',
    filters.effortFilter !== 'all',
    !!filters.fromDate,
    !!filters.toDate,
  ].filter(Boolean).length;
}

export function getSessionQuickFilterRange(
  kind: SessionHistoryQuickFilter,
  today = new Date()
) {
  if (kind === 'high-effort') {
    return { effortFilter: '4', fromDate: '', toDate: '' };
  }

  const start = new Date(today);
  start.setDate(today.getDate() - (kind === 'week' ? 6 : 29));
  return {
    effortFilter: 'all',
    fromDate: start.toISOString().slice(0, 10),
    toDate: today.toISOString().slice(0, 10),
  };
}
