'use client';

import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import { getAiApiErrorMessage } from '@/lib/ai-api-error';
import {
  isSessionAssessment,
  type SessionAssessment,
  type SessionAssessmentInput,
} from '@/lib/jev-client';
import { useToast } from './use-toast';

type AssessmentInput = SessionAssessmentInput;

export function useSessionAssessment() {
  const { canUseAi } = useAuth();
  const { toast } = useToast();
  const controller = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [assessment, setAssessment] = useState<SessionAssessment | null>(null);
  const assessmentRef = useRef<SessionAssessment | null>(null);

  const assess = useCallback(
    async (input: AssessmentInput) => {
      if (!canUseAi || !input.description.trim()) return;
      controller.current?.abort();
      const nextController = new AbortController();
      controller.current = nextController;
      setIsLoading(true);
      let failureMessage =
        'The training check-in could not be completed. Please try again.';
      try {
        const response = await fetch('/api/ai/assess-session', {
          method: 'POST',
          headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(input),
          signal: nextController.signal,
        });
        const payload: unknown = await response.json();
        const candidate =
          payload && typeof payload === 'object'
            ? (payload as { assessment?: unknown }).assessment
            : undefined;
        if (!response.ok) {
          failureMessage = getAiApiErrorMessage(payload);
          throw new Error('Assessment request failed');
        }
        if (!isSessionAssessment(candidate))
          throw new Error('Invalid assessment response');
        if (nextController.signal.aborted) return;
        assessmentRef.current = candidate;
        setAssessment(candidate);
      } catch {
        if (nextController.signal.aborted) return;
        assessmentRef.current = null;
        setAssessment(null);
        toast({
          variant: 'destructive',
          title: 'Check-in unavailable',
          description: failureMessage,
        });
      } finally {
        if (controller.current === nextController) {
          controller.current = null;
          setIsLoading(false);
        }
      }
    },
    [canUseAi, toast]
  );

  const invalidate = useCallback(() => {
    const activeController = controller.current;
    const hasAssessment = assessmentRef.current !== null;

    if (!activeController && !hasAssessment) return;

    if (activeController) {
      activeController.abort();
      controller.current = null;
      setIsLoading(false);
    }
    if (hasAssessment) {
      assessmentRef.current = null;
      setAssessment(null);
    }
  }, []);

  return { assessment, assess, invalidate, isLoading };
}
