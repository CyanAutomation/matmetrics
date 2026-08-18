'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import { getTransformerPrompt } from '@/lib/storage';
import { useToast } from './use-toast';

interface UseSessionFormAiState {
  isLoadingTransform: boolean;
  isLoadingSuggest: boolean;
  suggestedTechniques: string[];
  transformedDescription: string | null;
}

interface UseSessionFormAiActions {
  transform: (
    description: string,
    onSuccess: (result: string) => void
  ) => Promise<void>;
  suggest: (
    description: string,
    existingTechniques: string[],
    onSuccess: (suggestions: string[]) => void
  ) => Promise<void>;
  reset: () => void;
}

export interface UseSessionFormAiOptions {
  canUseAi?: boolean;
  authAvailable?: boolean;
  fetch?: typeof fetch;
  getAuthHeaders?: typeof getAuthHeaders;
  getTransformerPrompt?: typeof getTransformerPrompt;
}

type TransformFailure =
  | 'invalid-input'
  | 'authentication'
  | 'too-large'
  | 'rate-limit'
  | 'unavailable'
  | 'network'
  | 'unusable-result';

class TransformFailureError extends Error {
  constructor(readonly failure: TransformFailure) {
    super(failure);
  }
}

async function readTransformError(
  response: Response
): Promise<TransformFailure> {
  let code: string | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      const error = (body as { error?: unknown }).error;
      code =
        typeof (body as { code?: unknown }).code === 'string'
          ? (body as { code: string }).code
          : error &&
              typeof error === 'object' &&
              typeof (error as { code?: unknown }).code === 'string'
            ? (error as { code: string }).code
            : undefined;
    }
  } catch {
    // Status-based messages still work when an error response is not JSON.
  }

  const normalizedCode = code?.toUpperCase();
  if (
    normalizedCode &&
    ['UNAUTHORIZED', 'FORBIDDEN', 'AUTH_REQUIRED', 'SESSION_EXPIRED'].includes(
      normalizedCode
    )
  ) {
    return 'authentication';
  }
  if (
    normalizedCode === 'PAYLOAD_TOO_LARGE' ||
    normalizedCode === 'TOO_LARGE'
  ) {
    return 'too-large';
  }
  if (
    normalizedCode === 'RATE_LIMITED' ||
    normalizedCode === 'RATE_LIMIT_EXCEEDED'
  ) {
    return 'rate-limit';
  }
  if (normalizedCode === 'SERVICE_UNAVAILABLE') return 'unavailable';

  if (response.status === 400) return 'invalid-input';
  if (response.status === 401 || response.status === 403)
    return 'authentication';
  if (response.status === 413) return 'too-large';
  if (response.status === 429) return 'rate-limit';
  if ([500, 502, 503, 504].includes(response.status)) return 'unavailable';
  return 'unavailable';
}

const transformFailureDescriptions: Record<TransformFailure, string> = {
  'invalid-input': 'Check the description and custom prompt, then try again.',
  authentication: 'Your session expired. Sign in and try again.',
  'too-large':
    'The description or request is too large. Shorten it and try again.',
  'rate-limit': 'The AI request limit has been reached. Please retry later.',
  unavailable:
    'The AI service is temporarily unavailable. Please try again later.',
  network: 'Check your connection and try again.',
  'unusable-result': 'The AI returned an unusable result. Please try again.',
};

/**
 * Hook that consolidates AI-powered form enhancements
 * Handles description transformation and technique suggestions with proper AbortController support
 */
export function useSessionFormAi(
  options: UseSessionFormAiOptions = {}
): UseSessionFormAiState & UseSessionFormAiActions {
  const { toast } = useToast();
  const auth = useAuth();
  const canUseAi = options.canUseAi ?? auth.canUseAi;
  const authAvailable = options.authAvailable ?? auth.authAvailable;
  const request = options.fetch ?? fetch;
  const readAuthHeaders = options.getAuthHeaders ?? getAuthHeaders;
  const readTransformerPrompt =
    options.getTransformerPrompt ?? getTransformerPrompt;

  const [isLoadingTransform, setIsLoadingTransform] = useState(false);
  const [isLoadingSuggest, setIsLoadingSuggest] = useState(false);
  const [suggestedTechniques, setSuggestedTechniques] = useState<string[]>([]);
  const [transformedDescription, setTransformedDescription] = useState<
    string | null
  >(null);

  // AbortControllers for handling in-flight requests
  const transformControllerRef = useRef<AbortController | null>(null);
  const suggestControllerRef = useRef<AbortController | null>(null);

  const transform = useCallback(
    async (description: string, onSuccess: (result: string) => void) => {
      if (!canUseAi) {
        toast({
          title: 'Sign-in required',
          description: authAvailable
            ? 'AI description transforms are available after sign-in.'
            : 'AI description transforms are unavailable because authentication is not configured.',
        });
        return;
      }

      if (!description.trim()) {
        toast({
          variant: 'destructive',
          title: 'Nothing to transform',
          description: 'Please write a draft of what you practiced first.',
        });
        return;
      }

      // Cancel any in-flight transform request
      if (transformControllerRef.current) {
        transformControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const controller = new AbortController();
      transformControllerRef.current = controller;

      setIsLoadingTransform(true);
      try {
        const customPrompt = readTransformerPrompt();
        const headers = await readAuthHeaders({
          'Content-Type': 'application/json',
        });
        const response = await request('/api/ai/transform-description', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            description,
            customPrompt,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new TransformFailureError(await readTransformError(response));
        }
        let result: unknown;
        try {
          result = await response.json();
        } catch {
          throw new TransformFailureError('unusable-result');
        }
        if (controller.signal.aborted) return;
        const transformed =
          result && typeof result === 'object'
            ? (result as { transformedDescription?: unknown })
                .transformedDescription
            : undefined;
        if (typeof transformed !== 'string' || transformed.trim() === '') {
          throw new TransformFailureError('unusable-result');
        }
        setTransformedDescription(transformed);
        onSuccess(transformed);
        toast({
          title: 'Description Refined',
          description:
            'AI has polished your training notes based on your prompt settings.',
        });
      } catch (error) {
        // Ignore abort errors (expected when cancelling)
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return;
        }
        const failure =
          error instanceof TransformFailureError ? error.failure : 'network';
        toast({
          variant: 'destructive',
          title: 'Transformation Failed',
          description: transformFailureDescriptions[failure],
        });
      } finally {
        if (transformControllerRef.current === controller) {
          transformControllerRef.current = null;
          setIsLoadingTransform(false);
        }
      }
    },
    [
      canUseAi,
      authAvailable,
      toast,
      readTransformerPrompt,
      readAuthHeaders,
      request,
    ]
  );

  const suggest = useCallback(
    async (
      description: string,
      existingTechniques: string[],
      onSuccess: (suggestions: string[]) => void
    ) => {
      if (!canUseAi) {
        toast({
          title: 'Sign-in required',
          description: authAvailable
            ? 'AI tag suggestions are available after sign-in.'
            : 'AI tag suggestions are unavailable because authentication is not configured.',
        });
        return;
      }

      if (!description.trim()) {
        toast({
          variant: 'destructive',
          title: 'Missing description',
          description: 'Please write what you practiced to get suggestions.',
        });
        return;
      }

      // Cancel any in-flight suggest request
      if (suggestControllerRef.current) {
        suggestControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const controller = new AbortController();
      suggestControllerRef.current = controller;

      setIsLoadingSuggest(true);
      try {
        const headers = await readAuthHeaders({
          'Content-Type': 'application/json',
        });
        const response = await request('/api/ai/suggest-techniques', {
          method: 'POST',
          headers,
          body: JSON.stringify({ description }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to suggest techniques');
        }
        const payload = await response.json();
        if (controller.signal.aborted) return;
        const suggestions: string[] = Array.isArray(payload.suggestions)
          ? payload.suggestions.filter(
              (suggestion: unknown): suggestion is string =>
                typeof suggestion === 'string'
            )
          : [];

        const uniqueNew = suggestions.filter(
          (s) => !existingTechniques.includes(s)
        );

        if (uniqueNew.length > 0) {
          setSuggestedTechniques(uniqueNew);
          onSuccess(uniqueNew);
          toast({
            title: 'AI Suggestions Added',
            description: `Identified ${uniqueNew.length} techniques from your description.`,
          });
        } else {
          toast({
            description:
              suggestions.length > 0
                ? 'All suggested techniques are already tagged.'
                : "AI couldn't identify specific techniques.",
          });
        }
      } catch (error) {
        // Ignore abort errors (expected when cancelling)
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return;
        }
        toast({
          variant: 'destructive',
          title: 'AI Suggestion Failed',
          description: 'There was an error connecting to the AI helper.',
        });
      } finally {
        if (suggestControllerRef.current === controller) {
          suggestControllerRef.current = null;
          setIsLoadingSuggest(false);
        }
      }
    },
    [canUseAi, authAvailable, toast, readAuthHeaders, request]
  );

  const reset = useCallback(() => {
    const transformController = transformControllerRef.current;
    const suggestController = suggestControllerRef.current;
    transformControllerRef.current = null;
    suggestControllerRef.current = null;
    transformController?.abort();
    suggestController?.abort();
    setIsLoadingTransform(false);
    setIsLoadingSuggest(false);
    setSuggestedTechniques([]);
    setTransformedDescription(null);
  }, []);

  useEffect(
    () => () => {
      transformControllerRef.current?.abort();
      suggestControllerRef.current?.abort();
    },
    []
  );

  return {
    isLoadingTransform,
    isLoadingSuggest,
    suggestedTechniques,
    transformedDescription,
    transform,
    suggest,
    reset,
  };
}
