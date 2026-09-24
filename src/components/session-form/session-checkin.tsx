'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionAssessment } from '@/lib/jev-client';
import type { SessionCategory } from '@/lib/types';
import {
  hasClearSessionCategoryFit,
  shouldOfferCategorySuggestion,
  shouldPromptForReflection,
  shouldPromptForTechniqueDetail,
  shouldShowRecoveryNudge,
} from '@/lib/jev-policy';

type Props = {
  canUseAi: boolean;
  disabled: boolean;
  isLoading: boolean;
  assessment: SessionAssessment | null;
  onAssess: () => void;
  onApplyCategory: (category: SessionCategory) => void;
};

export function SessionCheckin({
  canUseAi,
  disabled,
  isLoading,
  assessment,
  onAssess,
  onApplyCategory,
}: Props) {
  return (
    <section
      className="rounded-lg border border-primary/15 bg-primary/5 p-3"
      aria-label="AI training check-in"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Training check-in</p>
          <p className="text-xs text-muted-foreground">
            Your description and notes are sent to OpenRouter/TypeSafe for this
            optional check-in. Review suggestions before applying.
          </p>
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
              (model confidence:{' '}
              {Math.round(assessment.categoryConfidence * 100)}%).
            </p>
          ) : (
            <p>
              JEV could not confidently match these notes to an existing session
              type. Choose the type manually.
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
          {shouldPromptForTechniqueDetail(assessment.hasTechniqueDetail) ? (
            <p>
              Add a named technique or drill to make this session easier to find
              later.
            </p>
          ) : null}
          {shouldPromptForReflection(assessment.hasReflection) ? (
            <p>
              Add a brief reflection to record what worked or needs attention.
            </p>
          ) : null}
          {shouldShowRecoveryNudge(
            assessment.fatigueSignal,
            assessment.injurySignal
          ) ? (
            <p>
              Consider your recovery before the next hard session. This is a
              note from your text, not medical advice.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
