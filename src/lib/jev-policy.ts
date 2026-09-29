export const JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD = 0.8;
export const JEV_CATEGORY_FIT_PROBABILITY_THRESHOLD = 0.8;
export const JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD = 0.9;
export const JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD = 0.5;
export const JEV_USEFUL_DETAIL_PROBABILITY_THRESHOLD = 0.5;
export const JEV_EFFORT_CONFLICT_PROBABILITY_THRESHOLD = 0.8;
export const JEV_TRANSFORM_FIDELITY_CONCERN_THRESHOLD = 0.5;
// Provisional until each theme has enough human-labeled evaluation examples.
export const JEV_RECURRING_THEME_PROBABILITY_THRESHOLD = 0.7;

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

export function shouldPromptForUsefulDetail(probability: number): boolean {
  return (
    isProbability(probability) &&
    probability < JEV_USEFUL_DETAIL_PROBABILITY_THRESHOLD
  );
}

export function shouldFlagEffortConflict(probability: number): boolean {
  return (
    isProbability(probability) &&
    probability >= JEV_EFFORT_CONFLICT_PROBABILITY_THRESHOLD
  );
}

export function shouldPromptForReflection(probability: number): boolean {
  return (
    isProbability(probability) &&
    probability < JEV_CHECKIN_NUDGE_PROBABILITY_THRESHOLD
  );
}

export function shouldFlagTransformedDescription(
  unsupportedDetailProbability: number
): boolean {
  return (
    isProbability(unsupportedDetailProbability) &&
    unsupportedDetailProbability >= JEV_TRANSFORM_FIDELITY_CONCERN_THRESHOLD
  );
}

export function shouldIncludeRecurringTheme(probability: number): boolean {
  return (
    isProbability(probability) &&
    probability >= JEV_RECURRING_THEME_PROBABILITY_THRESHOLD
  );
}
