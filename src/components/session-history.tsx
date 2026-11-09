'use client';

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { JudoSession } from '@/lib/types';
import { formatDateLabel, parseDateOnly } from '@/lib/utils';
import {
  mergeSemanticAndTextSessions,
  selectSessionHistorySearchCandidates,
} from '@/lib/session-history-search';
import { useSessionHistoryReview } from '@/hooks/use-session-history-review';
import { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import {
  filterSessionHistory,
  getSessionHistoryActiveFilterCount,
  getSessionHistoryStats,
  type SessionHistoryQuickFilter,
} from '@/lib/session-history-filter';
import { SessionHistoryFilterController } from '@/vanilla/session-history-filter-controller';
import { SessionHistorySemanticSearchController } from '@/vanilla/session-history-semantic-search-controller';
import {
  SessionHistoryContent,
  SessionHistoryEmptyState,
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
  const filterController = useMemo(
    () => new SessionHistoryFilterController(),
    []
  );
  const semanticSearchController = useMemo(
    () => new SessionHistorySemanticSearchController(),
    []
  );
  const filterState = useSyncExternalStore(
    filterController.subscribe,
    filterController.getSnapshot,
    filterController.getSnapshot
  );
  const semanticSearchState = useSyncExternalStore(
    semanticSearchController.subscribe,
    semanticSearchController.getSnapshot,
    semanticSearchController.getSnapshot
  );
  const historyReview = useSessionHistoryReview(sessions);
  const { deletingSessionId, handleDelete } = useSessionHistoryActions(
    onRefresh,
    historyReview.clearHistoryReview
  );
  const [editingSession, setEditingSession] = useState<JudoSession | null>(null);
  const [sessionPendingDeletion, setSessionPendingDeletion] =
    useState<JudoSession | null>(null);
  const {
    searchQuery,
    categoryFilter,
    effortFilter,
    fromDate,
    toDate,
    filtersOpen,
    density,
  } = filterState;
  const {
    matches: semanticMatches,
    isSearching: isSemanticSearching,
    error: semanticSearchError,
  } = semanticSearchState;

  useEffect(() => {
    semanticSearchController.clear();
  }, [sessions, semanticSearchController]);

  useEffect(
    () => () => semanticSearchController.destroy(),
    [semanticSearchController]
  );

  const sessionsWithinFilters = useMemo(
    () =>
      filterSessionHistory(sessions, {
        searchQuery: '',
        categoryFilter,
        effortFilter,
        fromDate,
        toDate,
      }),
    [categoryFilter, effortFilter, fromDate, sessions, toDate]
  );
  const semanticSearchCandidates = useMemo(
    () =>
      selectSessionHistorySearchCandidates(
        sessionsWithinFilters,
        searchQuery
      ),
    [searchQuery, sessionsWithinFilters]
  );

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
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const displayedSessions = mergeSemanticAndTextSessions(
    semanticMatches,
    sessionsById,
    filteredSessions
  );
  const grouped = groupSessionsByMonth(displayedSessions);
  const { averageEffort, duration } = getSessionHistoryStats(displayedSessions);
  const activeFilterCount = getSessionHistoryActiveFilterCount({
    categoryFilter,
    effortFilter,
    fromDate,
    toDate,
  });

  const clearFilters = () => {
    clearSemanticSearch();
    filterController.clearFilters();
  };
  const clearSemanticSearch = semanticSearchController.clear;
  const handleSemanticSearch = () => {
    if (!historyReview.canUseAi) return;
    void semanticSearchController.search(searchQuery, semanticSearchCandidates);
  };
  const updateSearchQuery = (value: string) => {
    clearSemanticSearch();
    filterController.setSearchQuery(value);
  };
  const updateCategoryFilter = (value: string) => {
    clearSemanticSearch();
    filterController.setCategoryFilter(value);
  };
  const updateEffortFilter = (value: string) => {
    clearSemanticSearch();
    filterController.setEffortFilter(value);
  };
  const updateFromDate = (value: string) => {
    clearSemanticSearch();
    filterController.setFromDate(value);
  };
  const updateToDate = (value: string) => {
    clearSemanticSearch();
    filterController.setToDate(value);
  };
  const filterByTechnique = (technique: string) => {
    clearSemanticSearch();
    filterController.filterByTechnique(technique);
  };
  const applyQuickFilter = (kind: SessionHistoryQuickFilter) => {
    clearSemanticSearch();
    filterController.applyQuickFilter(kind);
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
      filteredSessions={displayedSessions}
      deletingSessionId={deletingSessionId}
      density={density}
      onDensityChange={filterController.setDensity}
      semanticSearchActive={semanticMatches !== null}
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
        filteredCount: displayedSessions.length,
        sessionCount: sessions.length,
        averageEffort,
        duration,
        canUseAi: historyReview.canUseAi,
        canSemanticSearch: semanticSearchCandidates.length > 0,
        isSemanticSearching,
        hasUnreviewedDescriptions: historyReview.hasUnreviewedDescriptions,
        isReviewingHistory: historyReview.isReviewingHistory,
        reviewProgress: historyReview.reviewProgress,
        semanticSearchResultCount: semanticMatches?.length ?? null,
        semanticSearchError,
        onSearchQueryChange: updateSearchQuery,
        onCategoryFilterChange: updateCategoryFilter,
        onEffortFilterChange: updateEffortFilter,
        onFromDateChange: updateFromDate,
        onToDateChange: updateToDate,
        onToggleFilters: filterController.toggleFilters,
        onQuickFilter: applyQuickFilter,
        onClearFilters: clearFilters,
        onSemanticSearch: () => void handleSemanticSearch(),
        onClearSemanticSearch: clearSemanticSearch,
        onReviewHistory: historyReview.handleReviewHistory,
      }}
      reviewPanelProps={{
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
