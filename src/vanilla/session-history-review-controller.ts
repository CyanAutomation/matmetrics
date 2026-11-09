import { getAuthHeaders } from '../lib/auth-session';
import { isSessionAssessment, type SessionAssessment } from '../lib/jev-client';
import {
  HISTORY_REVIEW_BATCH_SIZE,
  reviewHistoryBatch,
  type HistoryAssessmentInput,
  type HistoryReviewResult,
} from '../lib/jev-history-review';
import type { JudoSession } from '../lib/types';

export interface SessionHistoryReviewState {
  historyReviewEntries: HistoryReviewResult[];
  reviewedSessionIds: ReadonlySet<string>;
  isReviewingHistory: boolean;
  reviewProgress: { completed: number; total: number };
}

export interface SessionHistoryReviewControllerDependencies {
  fetcher: typeof fetch;
  getAuthHeaders: typeof getAuthHeaders;
}

const initialState: SessionHistoryReviewState = {
  historyReviewEntries: [],
  reviewedSessionIds: new Set(),
  isReviewingHistory: false,
  reviewProgress: { completed: 0, total: 0 },
};

/** Framework-neutral owner for review progress and reviewed-session state. */
export class SessionHistoryReviewController {
  private state: SessionHistoryReviewState = {
    ...initialState,
    reviewedSessionIds: new Set(),
    reviewProgress: { ...initialState.reviewProgress },
  };
  private readonly listeners = new Set<() => void>();
  private readonly fetcher: typeof fetch;
  private readonly getHeaders: typeof getAuthHeaders;

  constructor(dependencies: Partial<SessionHistoryReviewControllerDependencies> = {}) {
    this.fetcher = dependencies.fetcher ?? fetch;
    this.getHeaders = dependencies.getAuthHeaders ?? getAuthHeaders;
  }

  getSnapshot = (): Readonly<SessionHistoryReviewState> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  handleReviewHistory = async (
    sessions: JudoSession[],
    canUseAi: boolean
  ): Promise<void> => {
    if (!canUseAi || this.state.isReviewingHistory) return;

    const reviewedSessionIds = new Set(this.state.reviewedSessionIds);
    const pendingCount = sessions.filter(
      (session) =>
        !reviewedSessionIds.has(session.id) &&
        Boolean(session.description?.trim())
    ).length;
    if (pendingCount === 0) return;

    this.update({
      isReviewingHistory: true,
      reviewProgress: { completed: 0, total: pendingCount },
    });
    let completed = 0;

    try {
      await reviewHistoryBatch(
        sessions,
        reviewedSessionIds,
        (inputs) => this.assessHistoryBatch(inputs),
        HISTORY_REVIEW_BATCH_SIZE,
        (entry) => {
          completed += 1;
          const nextReviewedSessionIds = new Set(this.state.reviewedSessionIds);
          if (!entry.error) nextReviewedSessionIds.add(entry.sessionId);

          this.update({
            reviewProgress: { completed, total: pendingCount },
            historyReviewEntries: [
              entry,
              ...this.state.historyReviewEntries.filter(
                (item) => item.sessionId !== entry.sessionId
              ),
            ],
            ...(!entry.error
              ? { reviewedSessionIds: nextReviewedSessionIds }
              : {}),
          });
        }
      );
    } finally {
      this.update({ isReviewingHistory: false });
    }
  };

  clearHistoryReview = (sessionId: string): void => {
    const historyReviewEntries = this.state.historyReviewEntries.filter(
      (entry) => entry.sessionId !== sessionId
    );
    const reviewedSessionIds = new Set(this.state.reviewedSessionIds);
    reviewedSessionIds.delete(sessionId);

    if (
      historyReviewEntries.length === this.state.historyReviewEntries.length &&
      reviewedSessionIds.size === this.state.reviewedSessionIds.size
    ) {
      return;
    }

    this.update({ historyReviewEntries, reviewedSessionIds });
  };

  destroy = (): void => {
    this.state = {
      ...initialState,
      reviewedSessionIds: new Set(),
      reviewProgress: { ...initialState.reviewProgress },
    };
    this.listeners.clear();
  };

  private async assessHistoryBatch(
    inputs: HistoryAssessmentInput[]
  ): Promise<SessionAssessment[]> {
    const response = await this.fetcher('/api/ai/assess-sessions', {
      method: 'POST',
      headers: await this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sessions: inputs }),
    });
    if (!response.ok) {
      throw new Error('History review request failed');
    }

    const payload: unknown = await response.json();
    const assessments =
      payload && typeof payload === 'object'
        ? (payload as { assessments?: unknown }).assessments
        : undefined;
    if (
      !Array.isArray(assessments) ||
      assessments.length !== inputs.length ||
      !assessments.every(isSessionAssessment)
    ) {
      throw new Error('History review response was invalid');
    }
    return assessments as SessionAssessment[];
  }

  private update(patch: Partial<SessionHistoryReviewState>): void {
    const next = { ...this.state, ...patch };
    if (
      next.historyReviewEntries === this.state.historyReviewEntries &&
      next.reviewedSessionIds === this.state.reviewedSessionIds &&
      next.isReviewingHistory === this.state.isReviewingHistory &&
      next.reviewProgress === this.state.reviewProgress
    ) {
      return;
    }

    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
