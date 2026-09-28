import type { SessionAssessment } from './jev-client';
import {
  AI_DESCRIPTION_MAX_BYTES,
  exceedsUtf8Limit,
} from './ai-request-limits';
import type { EffortLevel, JudoSession } from './types';
import {
  hasClearSessionCategoryFit,
  hasElevatedFatigueSignal,
  hasInjurySignal,
  shouldFlagEffortConflict,
  shouldOfferCategorySuggestion,
  shouldPromptForReflection,
  shouldPromptForUsefulDetail,
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
    fatigueMention: assessment
      ? hasElevatedFatigueSignal(assessment.fatigueSignal)
      : false,
    injuryMention: assessment
      ? hasInjurySignal(assessment.injurySignal)
      : false,
  };
}

export function isSessionAssessment(
  value: unknown
): value is SessionAssessment {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const result = value as Record<string, unknown>;
  const isProbability = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' &&
    Number.isFinite(candidate) &&
    candidate >= 0 &&
    candidate <= 1;

  return (
    typeof result.suggestedCategory === 'string' &&
    ['Technical', 'Randori', 'Shiai', 'Cardio', 'S&C'].includes(
      result.suggestedCategory
    ) &&
    isProbability(result.categoryConfidence) &&
    isProbability(result.categoryFitProbability) &&
    isProbability(result.hasUsefulDetail) &&
    isProbability(result.hasReflection) &&
    typeof result.fatigueSignal === 'number' &&
    Number.isFinite(result.fatigueSignal) &&
    result.fatigueSignal >= 0 &&
    result.fatigueSignal <= 2 &&
    isProbability(result.injurySignal) &&
    (result.effortConflictProbability === undefined ||
      isProbability(result.effortConflictProbability)) &&
    Array.isArray(result.unsupportedTechniqueTags) &&
    result.unsupportedTechniqueTags.every(
      (candidate) => typeof candidate === 'string'
    )
  );
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
