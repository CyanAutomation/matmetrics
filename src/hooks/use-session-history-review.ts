'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/auth-provider';
import { getRecurringTrainingThemeSummary } from '@/lib/jev-history-review';
import type { JudoSession } from '@/lib/types';
import { SessionHistoryReviewController } from '@/vanilla/session-history-review-controller';

export function useSessionHistoryReview(sessions: JudoSession[]) {
  const { canUseAi } = useAuth();
  const controller = useMemo(() => new SessionHistoryReviewController(), []);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  useEffect(() => () => controller.destroy(), [controller]);

  const recurringThemeSummary = useMemo(
    () => getRecurringTrainingThemeSummary(state.historyReviewEntries),
    [state.historyReviewEntries]
  );
  const hasUnreviewedDescriptions = sessions.some(
    (session) =>
      !state.reviewedSessionIds.has(session.id) &&
      Boolean(session.description?.trim())
  );

  return {
    canUseAi,
    clearHistoryReview: controller.clearHistoryReview,
    handleReviewHistory: () =>
      controller.handleReviewHistory(sessions, canUseAi),
    hasUnreviewedDescriptions,
    historyReviewEntries: state.historyReviewEntries,
    isReviewingHistory: state.isReviewingHistory,
    recurringThemeSummary,
    reviewProgress: state.reviewProgress,
  };
}
