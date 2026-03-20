'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import {
  type FeedbackState,
  createActionFeedbackController,
} from '@/lib/interaction';

type UseActionFeedbackOptions = {
  resetAfterMs?: number;
};

export function useActionFeedback(options: UseActionFeedbackOptions = {}) {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle');
  const resolveDelay = useEffectEvent((delayMs: number) => {
    return options.resetAfterMs ?? delayMs;
  });

  const [controller] = useState(() =>
    createActionFeedbackController(
      setFeedbackState,
      (callback, delayMs) =>
        setTimeout(callback, resolveDelay(delayMs)) as ReturnType<
          typeof setTimeout
        >,
      (handle) => clearTimeout(handle)
    )
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
