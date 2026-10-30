import {
  getAssessSessionsRequestByteSize,
  JEV_ASSESSMENT_REQUEST_MAX_BYTES,
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

export const HISTORY_REVIEW_BATCH_SIZE = 3;
export const HISTORY_REVIEW_BATCH_MAX_BYTES = 12 * 1024;
const MAX_ASSESSMENT_REQUEST_BYTES = 16 * 1024;

export type HistoryAssessmentInput = {
  description: string;
  notes?: string;
  category: JudoSession['category'];
  effort: EffortLevel;
  techniques: string[];
};

export type HistoryAssessmentBatchRequest = (
  inputs: HistoryAssessmentInput[]
) => Promise<SessionAssessment[]>;

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
    );

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
  assessBatch: HistoryAssessmentBatchRequest,
  limit = HISTORY_REVIEW_BATCH_SIZE,
  onProgress?: (result: HistoryReviewResult) => void
): Promise<HistoryReviewResult[]> {
  const candidates = sessions
    .filter(
      (session) =>
        !reviewedSessionIds.has(session.id) &&
        Boolean(session.description?.trim())
    )
    .sort((left, right) => right.date.localeCompare(left.date));
  const results: HistoryReviewResult[] = [];
  const batchSize = Math.max(1, Math.min(limit, HISTORY_REVIEW_BATCH_SIZE));
  const requestSize = (items: HistoryAssessmentInput[]) =>
    new TextEncoder().encode(JSON.stringify({ sessions: items })).byteLength;

  const saveResult = (session: JudoSession, assessment?: SessionAssessment) => {
    const result: HistoryReviewResult = {
      sessionId: session.id,
      sessionDate: session.date,
      currentCategory: session.category,
      currentEffort: session.effort,
      ...(assessment ? { assessment } : { error: true as const }),
    };
    results.push(result);
    onProgress?.(result);
  };

  for (let start = 0; start < candidates.length; start += batchSize) {
    const chunk = candidates.slice(start, start + batchSize);
    const valid: Array<{ session: JudoSession; input: HistoryAssessmentInput }> = [];
    for (const session of chunk) {
      const description = session.description?.trim() ?? '';
      const notes = session.notes?.trim() || undefined;
      if (
        exceedsUtf8Limit(description, AI_DESCRIPTION_MAX_BYTES) ||
        (notes !== undefined && exceedsUtf8Limit(notes, AI_DESCRIPTION_MAX_BYTES))
      ) {
        saveResult(session);
        continue;
      }
      valid.push({
        session,
        input: {
          description,
          notes,
          category: session.category,
          effort: session.effort,
          techniques: session.techniques,
        },
      });
    }
    if (valid.length === 0) continue;

    const batches: typeof valid[] = [];
    let pending: typeof valid = [];
    for (const item of valid) {
      if (requestSize([item.input]) > MAX_ASSESSMENT_REQUEST_BYTES) {
        saveResult(item.session);
        continue;
      }
      const candidate = [...pending, item];
      const candidateInputs = candidate.map(({ input }) => input);
      const encodedBytes = requestSize(candidateInputs);
      const estimatedJevBytes = getAssessSessionsRequestByteSize(candidateInputs);
      if (
        pending.length > 0 &&
        (candidate.length > batchSize ||
          encodedBytes > HISTORY_REVIEW_BATCH_MAX_BYTES ||
          estimatedJevBytes > JEV_ASSESSMENT_REQUEST_MAX_BYTES)
      ) {
        batches.push(pending);
        pending = [item];
      } else {
        pending = candidate;
      }
    }
    if (pending.length > 0) batches.push(pending);

    for (const batch of batches) {
      try {
        const assessments = await assessBatch(batch.map(({ input }) => input));
        if (assessments.length !== batch.length) throw new Error('Invalid batch response');
        batch.forEach(({ session }, index) => saveResult(session, assessments[index]));
      } catch {
        // Retry individually so a malformed answer does not discard usable
        // reviews from the other sessions in a batch.
        for (const { session, input } of batch) {
          try {
            const [assessment] = await assessBatch([input]);
            if (!assessment) throw new Error('Invalid batch response');
            saveResult(session, assessment);
          } catch {
            saveResult(session);
          }
        }
      }
    }
  }

  return results;
}
