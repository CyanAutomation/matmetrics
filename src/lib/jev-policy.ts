export const JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD = 0.8;
export const JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD = 0.9;

export function shouldOfferCategorySuggestion(confidence: number): boolean {
  return (
    Number.isFinite(confidence) &&
    confidence >= JEV_CATEGORY_APPLY_CONFIDENCE_THRESHOLD &&
    confidence <= 1
  );
}
