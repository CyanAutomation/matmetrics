'use client';

import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import { getAiApiErrorMessage } from '@/lib/ai-api-error';
import type { SessionAssessment } from '@/lib/jev-client';
import { useToast } from './use-toast';

type AssessmentInput = {
  description: string;
  notes: string;
};

function isAssessment(value: unknown): value is SessionAssessment {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  const isProbability = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' &&
    Number.isFinite(candidate) &&
    candidate >= 0 &&
    candidate <= 1;
  return (
    typeof result.suggestedCategory === 'string' &&
    ['Technical', 'Randori', 'Shiai', 'Cardio', 'S&C'].includes(
      result.suggestedCategory
    ) &&
    isProbability(result.categoryConfidence) &&
    isProbability(result.categoryFitProbability) &&
    isProbability(result.hasTechniqueDetail) &&
    isProbability(result.hasReflection) &&
    typeof result.fatigueSignal === 'number' &&
    Number.isFinite(result.fatigueSignal) &&
    result.fatigueSignal >= 0 &&
    result.fatigueSignal <= 2 &&
    isProbability(result.injurySignal) &&
    (result.resolvedModel === undefined ||
      typeof result.resolvedModel === 'string')
  );
}

export function useSessionAssessment() {
  const { canUseAi } = useAuth();
  const { toast } = useToast();
  const controller = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [assessment, setAssessment] = useState<SessionAssessment | null>(null);

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
        if (!isAssessment(candidate))
          throw new Error('Invalid assessment response');
        setAssessment(candidate);
      } catch {
        if (nextController.signal.aborted) return;
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

  const clear = useCallback(() => setAssessment(null), []);

  return { assessment, assess, clear, isLoading };
}
