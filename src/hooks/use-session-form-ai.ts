'use client';

import { useState, useRef, useCallback } from 'react';
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
  transform: (description: string, onSuccess: (result: string) => void) => Promise<void>;
  suggest: (
    description: string,
    existingTechniques: string[],
    onSuccess: (suggestions: string[]) => void
  ) => Promise<void>;
  reset: () => void;
}

/**
 * Hook that consolidates AI-powered form enhancements
 * Handles description transformation and technique suggestions with proper AbortController support
 */
export function useSessionFormAi(): UseSessionFormAiState & UseSessionFormAiActions {
  const { toast } = useToast();
  const { canUseAi, authAvailable } = useAuth();

  const [isLoadingTransform, setIsLoadingTransform] = useState(false);
  const [isLoadingSuggest, setIsLoadingSuggest] = useState(false);
  const [suggestedTechniques, setSuggestedTechniques] = useState<string[]>([]);
  const [transformedDescription, setTransformedDescription] = useState<string | null>(null);

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
        const customPrompt = getTransformerPrompt();
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });
        const response = await fetch('/api/ai/transform-description', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            description,
            customPrompt,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to transform description');
        }
        const result = await response.json();
        const transformed = result.transformedDescription;
        setTransformedDescription(transformed);
        onSuccess(transformed);
        toast({
          title: 'Description Refined',
          description: 'AI has polished your training notes based on your prompt settings.',
        });
      } catch (error) {
        // Ignore abort errors (expected when cancelling)
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        toast({
          variant: 'destructive',
          title: 'Transformation Failed',
          description: 'There was an error refining your description.',
        });
      } finally {
        setIsLoadingTransform(false);
      }
    },
    [canUseAi, authAvailable, toast]
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
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });
        const response = await fetch('/api/ai/suggest-techniques', {
          method: 'POST',
          headers,
          body: JSON.stringify({ description }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to suggest techniques');
        }
        const payload = await response.json();
        const suggestions: string[] = Array.isArray(payload.suggestions)
          ? payload.suggestions.filter(
              (suggestion: unknown): suggestion is string =>
                typeof suggestion === 'string'
            )
          : [];

        const uniqueNew = suggestions.filter((s) => !existingTechniques.includes(s));

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
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        toast({
          variant: 'destructive',
          title: 'AI Suggestion Failed',
          description: 'There was an error connecting to the AI helper.',
        });
      } finally {
        setIsLoadingSuggest(false);
      }
    },
    [canUseAi, authAvailable, toast]
  );

  const reset = useCallback(() => {
    if (transformControllerRef.current) {
      transformControllerRef.current.abort();
    }
    if (suggestControllerRef.current) {
      suggestControllerRef.current.abort();
    }
    setIsLoadingTransform(false);
    setIsLoadingSuggest(false);
    setSuggestedTechniques([]);
    setTransformedDescription(null);
  }, []);

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
