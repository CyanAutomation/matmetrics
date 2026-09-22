'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionAssessment } from '@/lib/jev-client';
import type { SessionCategory } from '@/lib/types';

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
            Optional suggestions from your notes. Review before applying.
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
          <p>
            Suggested type:{' '}
            <span className="font-semibold text-foreground">
              {assessment.suggestedCategory}
            </span>{' '}
            ({Math.round(assessment.categoryConfidence * 100)}% confidence).
          </p>
          {assessment.categoryConfidence >= 0.8 ? (
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
          {assessment.hasTechniqueDetail < 0.5 ? (
            <p>
              Add a named technique or drill to make this session easier to find
              later.
            </p>
          ) : null}
          {assessment.hasReflection < 0.5 ? (
            <p>
              Add a brief reflection to record what worked or needs attention.
            </p>
          ) : null}
          {assessment.fatigueSignal >= 1 || assessment.injurySignal >= 0.5 ? (
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
