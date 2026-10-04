'use client';

import { ArrowLeft, ArrowRight, Loader2, Save, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SessionLogFormFooterProps = {
  isSubmitting: boolean;
  isEditing: boolean;
  shouldHideHeader: boolean;
  feedbackState: 'idle' | 'loading' | 'success' | 'error';
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
  onCancel?: () => void;
};

export function SessionLogFormFooter({
  isSubmitting,
  isEditing,
  shouldHideHeader,
  feedbackState,
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  onFinish,
  onCancel,
}: SessionLogFormFooterProps) {
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t bg-secondary/95 p-4 backdrop-blur sm:p-6',
        !shouldHideHeader && 'bg-secondary/45'
      )}
    >
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            interaction="subtle"
            aria-label="Cancel"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-11 gap-1 px-2 sm:gap-2 sm:px-5"
          >
            <Undo2 className="h-4 w-4" />
            <span>Cancel</span>
          </Button>
        )}
        {currentStep > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={onPrevious}
            disabled={isSubmitting}
            className="h-11 gap-1 px-2 sm:gap-2 sm:px-5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        ) : null}
      </div>
      {isLastStep ? (
        <Button
          type="button"
          onClick={onFinish}
          disabled={isSubmitting}
          interaction="primary-action"
          feedbackState={isSubmitting ? 'loading' : feedbackState}
          className={cn(
            'gap-2 font-bold shadow-lg',
            !shouldHideHeader
              ? 'px-10 py-6 text-lg h-14'
              : 'px-3 py-5 h-12 sm:px-8'
          )}
        >
          {isSubmitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}
          {isEditing ? 'Update session' : 'Save session'}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={onNext}
          disabled={isSubmitting}
          interaction="primary-action"
          className="h-12 gap-2 px-5 font-semibold sm:px-8"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
