export type InteractionTone =
  | 'default'
  | 'primary-action'
  | 'subtle'
  | 'destructive';

export type FeedbackState = 'idle' | 'loading' | 'success' | 'error';

export const FIELD_INTERACTION_CLASS =
  'ui-field-interaction transition-[border-color,box-shadow,background-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-primary/35 focus-visible:-translate-y-px focus-visible:border-primary/45';

export const CARD_INTERACTION_CLASS =
  'ui-card-interaction transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/20';

export function getFeedbackResetDelay(state: Exclude<FeedbackState, 'idle'>) {
  return state === 'error' ? 1800 : 1400;
}

export function createActionFeedbackController(
  onStateChange: (state: FeedbackState) => void,
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>,
  clear: (handle: ReturnType<typeof setTimeout>) => void
) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const clearPendingReset = () => {
    if (timeoutHandle !== null) {
      clear(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const setTransientState = (state: Exclude<FeedbackState, 'idle'>) => {
    clearPendingReset();
    onStateChange(state);
    timeoutHandle = schedule(() => {
      timeoutHandle = null;
      onStateChange('idle');
    }, getFeedbackResetDelay(state));
  };

  return {
    startLoading() {
      clearPendingReset();
      onStateChange('loading');
    },
    showSuccess() {
      setTransientState('success');
    },
    showError() {
      setTransientState('error');
    },
    reset() {
      clearPendingReset();
      onStateChange('idle');
    },
    dispose() {
      clearPendingReset();
    },
  };
}
