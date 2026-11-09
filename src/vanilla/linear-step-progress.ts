import { escapeHtml, type ComponentController } from './component';

export interface LinearStepProgressProps {
  steps: readonly string[];
  currentStep: number;
}

function getStepState(index: number, currentStep: number): 'complete' | 'current' | 'upcoming' {
  if (index < currentStep) return 'complete';
  if (index === currentStep) return 'current';
  return 'upcoming';
}

/** Render an accessible, responsive progress indicator for a multi-step form. */
export function linearStepProgressHtml(props: LinearStepProgressProps): string {
  const currentLabel = props.steps[props.currentStep] ?? props.steps[0] ?? '';
  const steps = props.steps
    .map((step, index) => {
      const state = getStepState(index, props.currentStep);
      const completeLabel = state === 'complete' ? ', complete' : '';
      const currentAttribute = state === 'current' ? ' aria-current="step"' : '';
      const compactLabelClass = state === 'current'
        ? ' ui-linear-step-progress__label--current'
        : ' ui-linear-step-progress__label--compact-hidden';
      const connector = index < props.steps.length - 1
        ? `<span class="ui-linear-step-progress__connector" data-complete="${state === 'complete'}" aria-hidden="true"></span>`
        : '';

      return `<li class="ui-linear-step-progress__item"${currentAttribute} aria-label="Step ${index + 1}: ${escapeHtml(step)}${completeLabel}">
        <span class="ui-linear-step-progress__indicator" data-state="${state}" aria-hidden="true">${index + 1}</span>
        <span class="ui-linear-step-progress__label${compactLabelClass}">${escapeHtml(step)}</span>
        ${connector}
      </li>`;
    })
    .join('');

  return `<nav class="ui-linear-step-progress" aria-label="Form progress">
    <p class="ui-linear-step-progress__status" role="status" aria-live="polite" aria-atomic="true">
      Step ${props.currentStep + 1} of ${props.steps.length}<span class="ui-linear-step-progress__current-label"> · ${escapeHtml(currentLabel)}</span>
    </p>
    <ol class="ui-linear-step-progress__list" aria-label="Steps">${steps}</ol>
  </nav>`;
}

/** Mount a progress indicator into a caller-owned host element. */
export function mountLinearStepProgress(
  host: HTMLElement,
  initialProps: LinearStepProgressProps
): ComponentController<LinearStepProgressProps> {
  let current = initialProps;

  const render = (): void => {
    host.innerHTML = linearStepProgressHtml(current);
  };

  render();

  return {
    update(next) {
      current = next;
      render();
    },
    destroy() {
      // The host belongs to the caller and this component owns no listeners.
    },
  };
}
