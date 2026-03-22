'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  type FeedbackState,
  createActionFeedbackController,
} from '@/lib/interaction';

type UseActionFeedbackOptions = {
  resetAfterMs?: number;
};

export function useActionFeedback(options: UseActionFeedbackOptions = {}) {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle');

  const controller = useMemo(
    () =>
      createActionFeedbackController(
        setFeedbackState,
        (callback, delayMs) =>
          setTimeout(callback, options.resetAfterMs ?? delayMs) as ReturnType<
            typeof setTimeout
          >,
        (handle) => clearTimeout(handle)
      ),
    [options.resetAfterMs]
  );

  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  return {
    feedbackState,
    startLoading: controller.startLoading,
    showSuccess: controller.showSuccess,
    showError: controller.showError,
    reset: controller.reset,
  };
}
