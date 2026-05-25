'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  EffortLevel,
  JudoSession,
  SessionCategory,
} from '@/lib/types';
import { saveSession, updateSession } from '@/lib/storage';
import { formatLocalDateInputValue } from '@/lib/utils';

/**
 * useSessionFormState Hook
 *
 * Manages the complete form state for session logging/editing
 * Handles initialization, resets, and dependent effects
 */
export function useSessionFormState(sessionToEdit?: JudoSession) {
  const isEditing = !!sessionToEdit;

  const [date, setDate] = useState(sessionToEdit?.date || '');
  const [duration, setDuration] = useState<string>(
    sessionToEdit?.duration?.toString() ?? ''
  );
  const [description, setDescription] = useState(
    sessionToEdit?.description || ''
  );
  const [techniques, setTechniques] = useState<string[]>(
    sessionToEdit?.techniques || []
  );
  const [newTech, setNewTech] = useState('');
  const [effort, setEffort] = useState<EffortLevel>(sessionToEdit?.effort || 3);
  const [category, setCategory] = useState<SessionCategory>(
    sessionToEdit?.category || 'Technical'
  );
  const [notes, setNotes] = useState(sessionToEdit?.notes || '');
  const [videoUrl, setVideoUrl] = useState(sessionToEdit?.videoUrl || '');

  // Sync with sessionToEdit when it changes
  useEffect(() => {
    setDate(sessionToEdit?.date || '');
    setDuration(sessionToEdit?.duration?.toString() ?? '');
    setDescription(sessionToEdit?.description || '');
    setTechniques(sessionToEdit?.techniques || []);
    setNewTech('');
    setEffort(sessionToEdit?.effort || 3);
    setCategory(sessionToEdit?.category || 'Technical');
    setNotes(sessionToEdit?.notes || '');
    setVideoUrl(sessionToEdit?.videoUrl || '');
  }, [sessionToEdit]);

  // Set default date for new sessions
  useEffect(() => {
    if (!date && !isEditing) {
      setDate(formatLocalDateInputValue(new Date()));
    }
  }, [date, isEditing]);

  const reset = useCallback(() => {
    setTechniques([]);
    setDescription('');
    setNotes('');
    setVideoUrl('');
    setDuration('');
    setEffort(3);
    setCategory('Technical');
    setNewTech('');
  }, []);

  return {
    date,
    setDate,
    duration,
    setDuration,
    description,
    setDescription,
    techniques,
    setTechniques,
    newTech,
    setNewTech,
    effort,
    setEffort,
    category,
    setCategory,
    notes,
    setNotes,
    videoUrl,
    setVideoUrl,
    reset,
    isEditing,
  };
}

/**
 * useFormSubmit Hook
 *
 * Handles form validation, API calls, and submission logic
 */
export interface FormSubmitOptions {
  onSuccess: () => void;
  onError: () => void;
  onStart: () => void;
  showToast: (toast: {
    variant?: string;
    title: string;
    description?: string;
  }) => void;
}

export function useFormSubmit(
  formData: {
    date: string;
    duration: string;
    description: string;
    techniques: string[];
    effort: EffortLevel;
    category: SessionCategory;
    notes: string;
    videoUrl: string;
  },
  sessionToEdit: JudoSession | undefined,
  options: FormSubmitOptions
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!sessionToEdit;

  const validateForm = useCallback((): boolean => {
    if (formData.techniques.length === 0) {
      options.showToast({
        variant: 'destructive',
        title: 'Incomplete log',
        description: 'Please add at least one technique tag.',
      });
      return false;
    }

    const trimmedVideoUrl = formData.videoUrl.trim();
    if (trimmedVideoUrl) {
      try {
        const parsedVideoUrl = new URL(trimmedVideoUrl);
        if (
          parsedVideoUrl.protocol !== 'http:' &&
          parsedVideoUrl.protocol !== 'https:'
        ) {
          throw new Error('unsupported protocol');
        }
      } catch {
        options.showToast({
          variant: 'destructive',
          title: 'Invalid video URL',
          description:
            'Please provide a valid absolute http(s) URL (for example, a YouTube link).',
        });
        return false;
      }
    }

    return true;
  }, [formData, options]);

  const buildSessionData = useCallback((): JudoSession => {
    const parsedDuration =
      formData.duration.trim() !== ''
        ? parseInt(formData.duration, 10)
        : undefined;
    const trimmedVideoUrl = formData.videoUrl.trim();

    return {
      id:
        sessionToEdit?.id ||
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : typeof crypto !== 'undefined' &&
              typeof crypto.getRandomValues === 'function'
            ? Array.from(crypto.getRandomValues(new Uint8Array(16)))
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('')
            : `session-${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}`),
      date: formData.date,
      techniques: formData.techniques,
      effort: formData.effort,
      category: formData.category,
      description: formData.description,
      notes: formData.notes,
      ...(trimmedVideoUrl && { videoUrl: trimmedVideoUrl }),
      ...(Number.isFinite(parsedDuration) && { duration: parsedDuration }),
    };
  }, [formData, sessionToEdit]);

  const submit = useCallback(async (): Promise<boolean> => {
    if (isSubmitting) {
      return false;
    }

    if (!validateForm()) {
      return false;
    }

    setIsSubmitting(true);
    options.onStart();

    try {
      const sessionData = buildSessionData();
      const result = isEditing
        ? await updateSession(sessionData)
        : await saveSession(sessionData);

      options.showToast({
        title: isEditing ? 'Session Updated!' : 'Session Saved!',
        description:
          result.status === 'queued'
            ? 'Changes are saved locally and queued to sync when the connection is ready.'
            : undefined,
      });

      options.onSuccess();
      return true;
    } catch {
      options.showToast({
        variant: 'destructive',
        title: isEditing ? 'Update Failed' : 'Save Failed',
        description:
          'The change could not be saved. Your local view has been reconciled to match persisted data.',
      });
      options.onError();
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    validateForm,
    buildSessionData,
    isEditing,
    options,
  ]);

  return {
    isSubmitting,
    submit,
  };
}

/**
 * useVideoUrlValidation Hook
 *
 * Validates and provides error messages for video URLs
 */
export function useVideoUrlValidation(videoUrl: string): string {
  const trimmedVideoUrl = videoUrl.trim();

  if (!trimmedVideoUrl) {
    return '';
  }

  try {
    const parsedVideoUrl = new URL(trimmedVideoUrl);
    if (
      parsedVideoUrl.protocol !== 'http:' &&
      parsedVideoUrl.protocol !== 'https:'
    ) {
      return 'Use an absolute URL that starts with http:// or https://.';
    }
    return '';
  } catch {
    return 'Use a valid absolute URL (for example, https://youtube.com/watch?v=...).';
  }
}
