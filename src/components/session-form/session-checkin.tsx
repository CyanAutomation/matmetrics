'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataUseNotice } from '@/components/ui/data-use-notice';
import type { SessionAssessment } from '@/lib/jev-client';
import type { SessionCategory } from '@/lib/types';
import {
  hasClearSessionCategoryFit,
  hasElevatedFatigueSignal,
  hasInjurySignal,
  shouldOfferCategorySuggestion,
  shouldFlagEffortConflict,
  shouldPromptForReflection,
  shouldPromptForUsefulDetail,
} from '@/lib/jev-policy';

type Props = {
  canUseAi: boolean;
  disabled: boolean;
  isLoading: boolean;
  assessment: SessionAssessment | null;
  currentCategory: SessionCategory;
  onAssess: () => void;
  onApplyCategory: (category: SessionCategory) => void;
};

export function SessionCheckin({
  canUseAi,
  disabled,
  isLoading,
  assessment,
  currentCategory,
  onAssess,
  onApplyCategory,
}: Props) {
  return (
    <section
      className="rounded-lg border border-primary/15 bg-primary/5 p-3"
      aria-label="Training check-in"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Training check-in</p>
          <DataUseNotice variant="checkin" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAssess}
          disabled={!canUseAi || disabled || isLoading}
          className="gap-1.5"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Check in
        </Button>
      </div>
      {assessment ? (
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {hasClearSessionCategoryFit(assessment.categoryFitProbability) ? (
            <p>
              Suggested type:{' '}
              <span className="font-semibold text-foreground">
                {assessment.suggestedCategory}
              </span>{' '}
              ({Math.round(assessment.categoryConfidence * 100)}% confidence).
            </p>
          ) : (
            <p>
              The review could not confidently match these notes to an existing
              session type. Choose the type manually.
            </p>
          )}
          {shouldOfferCategorySuggestion(
            assessment.categoryConfidence,
            assessment.categoryFitProbability
          ) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onApplyCategory(assessment.suggestedCategory)}
            >
              Apply session type
            </Button>
          ) : null}
          {shouldOfferCategorySuggestion(
            assessment.categoryConfidence,
            assessment.categoryFitProbability
          ) && assessment.suggestedCategory !== currentCategory ? (
            <p>
              Possible type mismatch: the selected type is {currentCategory},
              while the text may fit {assessment.suggestedCategory} better.
              Review before changing it.
            </p>
          ) : null}
          {shouldPromptForUsefulDetail(assessment.hasUsefulDetail) ? (
            <p>
              Add one concrete detail that makes this entry useful later; a
              short entry can still be useful.
            </p>
          ) : null}
          {shouldFlagEffortConflict(
            assessment.effortConflictProbability ?? Number.NaN
          ) ? (
            <p>
              The text may conflict with the effort rating you chose. Review
              both if needed.
            </p>
          ) : null}
          {assessment.unsupportedTechniqueTags.length > 0 ? (
            <p>
              The review could not confirm these saved technique tags from the
              text: {assessment.unsupportedTechniqueTags.join(', ')}. Review
              them manually; they have not been removed.
            </p>
          ) : null}
          {shouldPromptForReflection(assessment.hasReflection) ? (
            <p>
              Add a brief reflection to record what worked or needs attention.
            </p>
          ) : null}
          {hasElevatedFatigueSignal(assessment.fatigueSignal) ? (
            <p>
              Your text mentions fatigue or difficult recovery. This check-in
              does not assess readiness to train.
            </p>
          ) : null}
          {hasInjurySignal(assessment.injurySignal) ? (
            <p>
              Your text may mention pain or injury. This is not a diagnosis;
              review the note if this seems inaccurate.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
