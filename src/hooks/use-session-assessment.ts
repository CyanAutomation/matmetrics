'use client';

import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import type { SessionAssessment } from '@/lib/jev-client';
import type { SessionCategory } from '@/lib/types';
import { useToast } from './use-toast';

type AssessmentInput = {
  description: string;
  notes: string;
  category: SessionCategory;
};

function isAssessment(value: unknown): value is SessionAssessment {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.suggestedCategory === 'string' &&
    ['Technical', 'Randori', 'Shiai', 'Cardio', 'S&C'].includes(
      result.suggestedCategory
    ) &&
    [
      'categoryConfidence',
      'hasTechniqueDetail',
      'hasReflection',
      'fatigueSignal',
      'injurySignal',
    ].every((key) => typeof result[key] === 'number')
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
        if (!response.ok || !isAssessment(candidate))
          throw new Error('Invalid assessment response');
        setAssessment(candidate);
      } catch {
        if (nextController.signal.aborted) return;
        setAssessment(null);
        toast({
          variant: 'destructive',
          title: 'Check-in unavailable',
          description:
            'The training check-in could not be completed. Please try again.',
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
