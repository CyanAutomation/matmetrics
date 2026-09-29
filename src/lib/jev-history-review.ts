import {
  TRAINING_THEMES,
  isSessionThemeAssessment,
  type SessionAssessment,
  type TrainingTheme,
} from './jev-client';
import {
  AI_DESCRIPTION_MAX_BYTES,
  exceedsUtf8Limit,
} from './ai-request-limits';
import type { EffortLevel, JudoSession } from './types';
import {
  hasClearSessionCategoryFit,
  shouldFlagEffortConflict,
  shouldOfferCategorySuggestion,
  shouldPromptForReflection,
  shouldPromptForUsefulDetail,
  shouldIncludeRecurringTheme,
} from './jev-policy';

export const HISTORY_REVIEW_BATCH_SIZE = 5;

export type HistoryAssessmentInput = {
  description: string;
  notes?: string;
  category: JudoSession['category'];
  effort: EffortLevel;
  techniques: string[];
};

export type HistoryAssessmentRequest = (
  input: HistoryAssessmentInput
) => Promise<SessionAssessment>;

export type HistoryReviewResult = {
  sessionId: string;
  sessionDate: string;
  currentCategory: JudoSession['category'];
  currentEffort: EffortLevel;
  assessment?: SessionAssessment;
  error?: true;
};

export type RecurringTrainingTheme = {
  theme: TrainingTheme;
  matchingSessions: number;
  consideredSessions: number;
  recentSessionIds: string[];
};

export type RecurringTrainingThemeSummary = {
  consideredSessions: number;
  themes: RecurringTrainingTheme[];
};

const MINIMUM_RECURRING_THEME_SESSIONS = 2;

export function getRecurringTrainingThemeSummary(
  entries: HistoryReviewResult[]
): RecurringTrainingThemeSummary {
  const uniqueEntries = new Map<string, HistoryReviewResult>();
  for (const entry of entries) uniqueEntries.set(entry.sessionId, entry);

  const recentAssessments = [...uniqueEntries.values()]
    .flatMap((entry) => {
      const trainingThemes = entry.assessment?.trainingThemes;
      return isSessionThemeAssessment(trainingThemes)
        ? [{ entry, trainingThemes }]
        : [];
    })
    .sort(
      (left, right) =>
        right.entry.sessionDate.localeCompare(left.entry.sessionDate) ||
        right.entry.sessionId.localeCompare(left.entry.sessionId)
    )
    .slice(0, HISTORY_REVIEW_BATCH_SIZE);

  const themes = TRAINING_THEMES.flatMap((theme) => {
    const matchingSessionIds = recentAssessments
      .filter(({ trainingThemes }) =>
        shouldIncludeRecurringTheme(trainingThemes[theme])
      )
      .map(({ entry }) => entry.sessionId);
    if (matchingSessionIds.length < MINIMUM_RECURRING_THEME_SESSIONS) {
      return [];
    }
    return [
      {
        theme,
        matchingSessions: matchingSessionIds.length,
        consideredSessions: recentAssessments.length,
        recentSessionIds: matchingSessionIds,
      },
    ];
  });

  return { consideredSessions: recentAssessments.length, themes };
}

export function getHistoryReviewFindings(entry: HistoryReviewResult) {
  const assessment = entry.assessment;
  return {
    categoryMismatch:
      assessment &&
      assessment.suggestedCategory !== entry.currentCategory &&
      shouldOfferCategorySuggestion(
        assessment.categoryConfidence,
        assessment.categoryFitProbability
      )
        ? assessment.suggestedCategory
        : undefined,
    categoryUnclear: assessment
      ? !hasClearSessionCategoryFit(assessment.categoryFitProbability)
      : false,
    needsUsefulDetail: assessment
      ? shouldPromptForUsefulDetail(assessment.hasUsefulDetail)
      : false,
    needsReflection: assessment
      ? shouldPromptForReflection(assessment.hasReflection)
      : false,
    effortMismatch: assessment
      ? shouldFlagEffortConflict(
          assessment.effortConflictProbability ?? Number.NaN
        )
      : false,
  };
}

export async function reviewHistoryBatch(
  sessions: JudoSession[],
  reviewedSessionIds: ReadonlySet<string>,
  assess: HistoryAssessmentRequest,
  limit = HISTORY_REVIEW_BATCH_SIZE,
  onProgress?: (result: HistoryReviewResult) => void
): Promise<HistoryReviewResult[]> {
  const candidates = sessions
    .filter(
      (session) =>
        !reviewedSessionIds.has(session.id) &&
        Boolean(session.description?.trim())
    )
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, Math.max(0, Math.min(limit, HISTORY_REVIEW_BATCH_SIZE)));
  const results: HistoryReviewResult[] = [];

  for (const session of candidates) {
    const resultBase = {
      sessionId: session.id,
      sessionDate: session.date,
      currentCategory: session.category,
      currentEffort: session.effort,
    };
    const description = session.description?.trim() ?? '';
    const notes = session.notes?.trim() || undefined;

    if (
      exceedsUtf8Limit(description, AI_DESCRIPTION_MAX_BYTES) ||
      (notes !== undefined && exceedsUtf8Limit(notes, AI_DESCRIPTION_MAX_BYTES))
    ) {
      const result: HistoryReviewResult = { ...resultBase, error: true };
      results.push(result);
      onProgress?.(result);
      continue;
    }

    try {
      const assessment = await assess({
        description,
        notes,
        category: session.category,
        effort: session.effort,
        techniques: session.techniques,
      });
      const result: HistoryReviewResult = { ...resultBase, assessment };
      results.push(result);
      onProgress?.(result);
    } catch {
      const result: HistoryReviewResult = { ...resultBase, error: true };
      results.push(result);
      onProgress?.(result);
    }
  }

  return results;
}
