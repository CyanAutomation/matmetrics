'use client';

import { useMemo, useState } from 'react';
import type { JudoSession } from '@/lib/types';
import { formatDateLabel, parseDateOnly } from '@/lib/utils';
import { useSessionHistoryReview } from '@/hooks/use-session-history-review';
import { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import {
  filterSessionHistory,
  getSessionHistoryActiveFilterCount,
  getSessionHistoryStats,
  getSessionQuickFilterRange,
  type SessionHistoryQuickFilter,
} from '@/lib/session-history-filter';
import {
  SessionHistoryContent,
  SessionHistoryEmptyState,
  type SessionHistoryDensity,
} from './session-history-content';

interface SessionHistoryProps {
  sessions: JudoSession[];
  onRefresh: () => void;
  onLogSession?: () => void;
}

type GroupedSessions = {
  monthLabel: string;
  sessions: JudoSession[];
};

function groupSessionsByMonth(sessions: JudoSession[]): GroupedSessions[] {
  const groups: Map<string, JudoSession[]> = new Map();

  for (const session of sessions) {
    const date = parseDateOnly(session.date);
    const monthLabel = formatDateLabel(date, 'month-year');
    if (!groups.has(monthLabel)) groups.set(monthLabel, []);
    groups.get(monthLabel)!.push(session);
  }

  return Array.from(groups.entries(), ([monthLabel, sessions]) => ({
    monthLabel,
    sessions,
  }));
}

export function SessionHistory({
  sessions,
  onRefresh,
  onLogSession,
}: SessionHistoryProps) {
  const historyReview = useSessionHistoryReview(sessions);
  const { deletingSessionId, handleDelete } = useSessionHistoryActions(
    onRefresh,
    historyReview.clearHistoryReview
  );
  const [editingSession, setEditingSession] = useState<JudoSession | null>(null);
  const [sessionPendingDeletion, setSessionPendingDeletion] =
    useState<JudoSession | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [effortFilter, setEffortFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [density, setDensity] = useState<SessionHistoryDensity>('compact');

  const filteredSessions = useMemo(
    () =>
      filterSessionHistory(sessions, {
        searchQuery,
        categoryFilter,
        effortFilter,
        fromDate,
        toDate,
      }),
    [categoryFilter, effortFilter, fromDate, searchQuery, sessions, toDate]
  );
  const grouped = groupSessionsByMonth(filteredSessions);
  const { averageEffort, duration } = getSessionHistoryStats(filteredSessions);
  const activeFilterCount = getSessionHistoryActiveFilterCount({
    categoryFilter,
    effortFilter,
    fromDate,
    toDate,
  });

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setEffortFilter('all');
    setFromDate('');
    setToDate('');
  };
  const filterByTechnique = (technique: string) => {
    setSearchQuery(technique);
    setFiltersOpen(false);
  };
  const applyQuickFilter = (kind: SessionHistoryQuickFilter) => {
    const range = getSessionQuickFilterRange(kind);
    setEffortFilter(range.effortFilter);
    setFromDate(range.fromDate);
    setToDate(range.toDate);
  };
  const requestDelete = (session: JudoSession) => {
    if (!deletingSessionId) setSessionPendingDeletion(session);
  };

  if (sessions.length === 0) {
    return <SessionHistoryEmptyState onLogSession={onLogSession} />;
  }

  return (
    <SessionHistoryContent
      grouped={grouped}
      filteredSessions={filteredSessions}
      deletingSessionId={deletingSessionId}
      density={density}
      onDensityChange={setDensity}
      onReviewHistory={historyReview.handleReviewHistory}
      hasUnreviewedDescriptions={historyReview.hasUnreviewedDescriptions}
      isReviewingHistory={historyReview.isReviewingHistory}
      reviewProgress={historyReview.reviewProgress}
      onRequestDelete={requestDelete}
      onEditSession={setEditingSession}
      onFilterTechnique={filterByTechnique}
      filterBarProps={{
        searchQuery,
        categoryFilter,
        effortFilter,
        fromDate,
        toDate,
        filtersOpen,
        activeFilterCount,
        filteredCount: filteredSessions.length,
        sessionCount: sessions.length,
        averageEffort,
        duration,
        onSearchQueryChange: setSearchQuery,
        onCategoryFilterChange: setCategoryFilter,
        onEffortFilterChange: setEffortFilter,
        onFromDateChange: setFromDate,
        onToDateChange: setToDate,
        onToggleFilters: () => setFiltersOpen((open) => !open),
        onQuickFilter: applyQuickFilter,
        onClearFilters: clearFilters,
      }}
      reviewPanelProps={{
        canUseAi: historyReview.canUseAi,
        entries: historyReview.historyReviewEntries,
        sessions,
        recurringThemeSummary: historyReview.recurringThemeSummary,
        onEditSession: setEditingSession,
      }}
      dialogProps={{
        editingSession,
        sessionPendingDeletion,
        deletingSessionId,
        onCloseEdit: () => setEditingSession(null),
        onEditSaved: (session) => {
          historyReview.clearHistoryReview(session.id);
          setEditingSession(null);
          onRefresh();
        },
        onCloseDelete: () => setSessionPendingDeletion(null),
        onDelete: handleDelete,
      }}
    />
  );
}
