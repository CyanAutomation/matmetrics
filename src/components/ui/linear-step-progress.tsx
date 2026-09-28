'use client';

import { cn } from '@/lib/utils';

type LinearStepProgressProps = {
  steps: readonly string[];
  currentStep: number;
};

export function LinearStepProgress({
  steps,
  currentStep,
}: LinearStepProgressProps) {
  const currentLabel = steps[currentStep] ?? steps[0] ?? '';

  return (
    <nav aria-label="Form progress" className="space-y-3">
      <p
        className="text-sm font-medium text-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        Step {currentStep + 1} of {steps.length}
        <span className="text-muted-foreground"> · {currentLabel}</span>
      </p>
      <ol className="flex items-center gap-2" aria-label="Steps">
        {steps.map((step, index) => {
          const isCurrent = index === currentStep;
          const isComplete = index < currentStep;

          return (
            <li
              key={step}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Step ${index + 1}: ${step}${isComplete ? ', complete' : ''}`}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  isCurrent &&
                    'border-primary bg-primary text-primary-foreground',
                  isComplete && 'border-primary/40 bg-primary/10 text-primary',
                  !isCurrent &&
                    !isComplete &&
                    'border-border bg-muted text-muted-foreground'
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  'truncate text-xs',
                  isCurrent
                    ? 'font-semibold text-foreground'
                    : 'sr-only text-muted-foreground sm:not-sr-only'
                )}
              >
                {step}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-px min-w-2 flex-1',
                    isComplete ? 'bg-primary/50' : 'bg-border'
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
