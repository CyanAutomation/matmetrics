'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import {
  isSessionAssessment,
  type SessionAssessment,
} from '@/lib/jev-client';
import {
  HISTORY_REVIEW_BATCH_SIZE,
  getRecurringTrainingThemeSummary,
  reviewHistoryBatch,
  type HistoryAssessmentInput,
  type HistoryReviewResult,
} from '@/lib/jev-history-review';
import type { JudoSession } from '@/lib/types';

export function useSessionHistoryReview(sessions: JudoSession[]) {
  const { canUseAi } = useAuth();
  const [historyReviewEntries, setHistoryReviewEntries] = useState<
    HistoryReviewResult[]
  >([]);
  const [reviewedSessionIds, setReviewedSessionIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isReviewingHistory, setIsReviewingHistory] = useState(false);
  const [reviewProgress, setReviewProgress] = useState({
    completed: 0,
    total: 0,
  });

  const recurringThemeSummary = useMemo(
    () => getRecurringTrainingThemeSummary(historyReviewEntries),
    [historyReviewEntries]
  );
  const hasUnreviewedDescriptions = sessions.some(
    (session) =>
      !reviewedSessionIds.has(session.id) &&
      Boolean(session.description?.trim())
  );

  const assessHistorySession = async (
    input: HistoryAssessmentInput
  ): Promise<SessionAssessment> => {
    const response = await fetch('/api/ai/assess-session', {
      method: 'POST',
      headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...input, includeTrainingThemes: true }),
    });
    const payload: unknown = await response.json();
    const assessment =
      payload && typeof payload === 'object'
        ? (payload as { assessment?: unknown }).assessment
        : undefined;

    if (!response.ok) {
      throw new Error('History review request failed');
    }
    if (!isSessionAssessment(assessment)) {
      throw new Error('History review response was invalid');
    }
    return assessment;
  };

  const handleReviewHistory = async () => {
    if (!canUseAi || isReviewingHistory) return;
    const pendingCount = sessions.filter(
      (session) =>
        !reviewedSessionIds.has(session.id) &&
        Boolean(session.description?.trim())
    ).length;
    if (pendingCount === 0) return;

    setIsReviewingHistory(true);
    setReviewProgress({
      completed: 0,
      total: Math.min(pendingCount, HISTORY_REVIEW_BATCH_SIZE),
    });
    let completed = 0;
    try {
      await reviewHistoryBatch(
        sessions,
        reviewedSessionIds,
        assessHistorySession,
        HISTORY_REVIEW_BATCH_SIZE,
        (entry) => {
          completed += 1;
          setReviewProgress({
            completed,
            total: Math.min(pendingCount, HISTORY_REVIEW_BATCH_SIZE),
          });
          if (!entry.error) {
            setReviewedSessionIds((current) =>
              new Set(current).add(entry.sessionId)
            );
          }
          setHistoryReviewEntries((current) => [
            entry,
            ...current.filter((item) => item.sessionId !== entry.sessionId),
          ]);
        }
      );
    } finally {
      setIsReviewingHistory(false);
    }
  };

  const clearHistoryReview = (sessionId: string) => {
    setHistoryReviewEntries((current) =>
      current.filter((entry) => entry.sessionId !== sessionId)
    );
    setReviewedSessionIds((current) => {
      const next = new Set(current);
      next.delete(sessionId);
      return next;
    });
  };

  return {
    canUseAi,
    clearHistoryReview,
    handleReviewHistory,
    hasUnreviewedDescriptions,
    historyReviewEntries,
    isReviewingHistory,
    recurringThemeSummary,
    reviewProgress,
  };
}
