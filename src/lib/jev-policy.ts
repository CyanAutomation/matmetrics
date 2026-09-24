export const JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD = 0.8;
export const JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD = 0.8;
export const JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD = 0.9;
export const JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD = 0.5;
export const JEV_FATIGUE_NUDGE_SCORE_THRESHOLD = 1;
export const JEV_INJURY_NUDGE_PROBABILITY_THRESHOLD = 0.5;
export const JEV_TRANSFORM_FIDELITY_CONCERN_THRESHOLD = 0.5;

function isProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function hasClearSessionCategoryFit(probability: number): boolean {
  return (
    isProbability(probability) &&
    probability >= JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD
  );
}

export function shouldOfferCategorySuggestion(
  confidence: number,
  categoryFitProbability: number
): boolean {
  return (
    isProbability(confidence) &&
    confidence >= JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD &&
    hasClearSessionCategoryFit(categoryFitProbability)
  );
}

export function shouldPromptForTechniqueDetail(probability: number): boolean {
  return (
    isProbability(probability) &&
    probability < JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD
  );
}

export function shouldPromptForReflection(probability: number): boolean {
  return (
    isProbability(probability) &&
    probability < JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD
  );
}

export function shouldShowRecoveryNudge(
  fatigueSignal: number,
  injurySignal: number
): boolean {
  const fatigueIsElevated =
    Number.isFinite(fatigueSignal) &&
    fatigueSignal >= JEV_FATIGUE_NUDGE_SCORE_THRESHOLD &&
    fatigueSignal <= 2;
  const injuryIsMentioned =
    isProbability(injurySignal) &&
    injurySignal >= JEV_INJURY_NUDGE_PROBABILITY_THRESHOLD;

  return fatigueIsElevated || injuryIsMentioned;
}

export function shouldFlagTransformedDescription(
  unsupportedDetailProbability: number
): boolean {
  return (
    isProbability(unsupportedDetailProbability) &&
    unsupportedDetailProbability >= JEV_TRANSFORM_FIDELITY_CONCERN_THRESHOLD
  );
}
