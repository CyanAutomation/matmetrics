'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth-session';
import type { JudoSession } from '@/lib/types';
import { formatDateLabel, parseDateOnly } from '@/lib/utils';
import {
  isSessionHistorySearchMatches,
  mergeSemanticAndTextSessions,
  selectSessionHistorySearchCandidates,
  type SessionHistorySearchMatch,
} from '@/lib/session-history-search';
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
  const [semanticMatches, setSemanticMatches] = useState<
    SessionHistorySearchMatch[] | null
  >(null);
  const [isSemanticSearching, setIsSemanticSearching] = useState(false);
  const [semanticSearchError, setSemanticSearchError] = useState<string | null>(
    null
  );
  const semanticRequestId = useRef(0);
  const semanticAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    semanticRequestId.current += 1;
    semanticAbortController.current?.abort();
    semanticAbortController.current = null;
    setIsSemanticSearching(false);
    setSemanticMatches(null);
    setSemanticSearchError(null);
  }, [sessions]);

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
    setSearchQuery('');
    setCategoryFilter('all');
    setEffortFilter('all');
    setFromDate('');
    setToDate('');
  };
  const clearSemanticSearch = () => {
    semanticRequestId.current += 1;
    semanticAbortController.current?.abort();
    semanticAbortController.current = null;
    setIsSemanticSearching(false);
    setSemanticMatches(null);
    setSemanticSearchError(null);
  };
  const handleSemanticSearch = async () => {
    if (
      !historyReview.canUseAi ||
      isSemanticSearching ||
      semanticSearchCandidates.length === 0 ||
      !searchQuery.trim()
    ) {
      return;
    }

    semanticAbortController.current?.abort();
    const controller = new AbortController();
    semanticAbortController.current = controller;
    const requestId = ++semanticRequestId.current;
    setIsSemanticSearching(true);
    setSemanticMatches(null);
    setSemanticSearchError(null);

    try {
      const response = await fetch('/api/ai/search-sessions', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          query: searchQuery.trim(),
          candidates: semanticSearchCandidates,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('The semantic search request failed.');
      }
      const payload: unknown = await response.json();
      const matches =
        payload && typeof payload === 'object'
          ? (payload as { matches?: unknown }).matches
          : undefined;
      const candidateIds = new Set(
        semanticSearchCandidates.map((candidate) => candidate.id)
      );
      if (!isSessionHistorySearchMatches(matches, candidateIds)) {
        throw new Error('The semantic search response was invalid.');
      }
      if (requestId === semanticRequestId.current) {
        setSemanticMatches(matches);
      }
    } catch (error) {
      if (!controller.signal.aborted && requestId === semanticRequestId.current) {
        setSemanticSearchError(
          error instanceof Error &&
            error.message === 'The semantic search response was invalid.'
            ? error.message
            : 'Semantic ranking is unavailable; showing text matches.'
        );
      }
    } finally {
      if (requestId === semanticRequestId.current) {
        semanticAbortController.current = null;
        setIsSemanticSearching(false);
      }
    }
  };
  const updateSearchQuery = (value: string) => {
    clearSemanticSearch();
    setSearchQuery(value);
  };
  const updateCategoryFilter = (value: string) => {
    clearSemanticSearch();
    setCategoryFilter(value);
  };
  const updateEffortFilter = (value: string) => {
    clearSemanticSearch();
    setEffortFilter(value);
  };
  const updateFromDate = (value: string) => {
    clearSemanticSearch();
    setFromDate(value);
  };
  const updateToDate = (value: string) => {
    clearSemanticSearch();
    setToDate(value);
  };
  const filterByTechnique = (technique: string) => {
    clearSemanticSearch();
    setSearchQuery(technique);
    setFiltersOpen(false);
  };
  const applyQuickFilter = (kind: SessionHistoryQuickFilter) => {
    clearSemanticSearch();
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
      filteredSessions={displayedSessions}
      deletingSessionId={deletingSessionId}
      density={density}
      onDensityChange={setDensity}
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
        onToggleFilters: () => setFiltersOpen((open) => !open),
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
