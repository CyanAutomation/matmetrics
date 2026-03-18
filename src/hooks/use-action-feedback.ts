'use client';

import { useEffect, useRef, useState } from 'react';

import {
  type FeedbackState,
  createActionFeedbackController,
} from '@/lib/interaction';

type UseActionFeedbackOptions = {
  resetAfterMs?: number;
};

export function useActionFeedback(options: UseActionFeedbackOptions = {}) {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle');
  const resetAfterMsRef = useRef(options.resetAfterMs);

  resetAfterMsRef.current = options.resetAfterMs;

  const controllerRef = useRef(
    createActionFeedbackController(
      setFeedbackState,
      (callback, delayMs) =>
        setTimeout(
          callback,
          resetAfterMsRef.current ?? delayMs
        ) as ReturnType<typeof setTimeout>,
      (handle) => clearTimeout(handle)
    )
  );

  useEffect(() => {
    const controller = controllerRef.current;
    return () => controller.dispose();
  }, []);

  return {
    feedbackState,
    startLoading: controllerRef.current.startLoading,
    showSuccess: controllerRef.current.showSuccess,
    showError: controllerRef.current.showError,
    reset: controllerRef.current.reset,
  };
}
