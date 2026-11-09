'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import type { JudoSession } from '@/lib/types';
import { SessionFormController } from '@/vanilla/session-form-controller';
import {
  SessionFormSubmitController,
  type SessionFormData,
  type SessionFormSubmitOptions,
} from '@/vanilla/session-form-submit-controller';

/**
 * useSessionFormState Hook
 *
 * Manages the complete form state for session logging/editing
 * Handles initialization, resets, and dependent effects
 */
export function useSessionFormState(sessionToEdit?: JudoSession) {
  const [controller] = useState(
    () => new SessionFormController(sessionToEdit, { deferDefaultDate: true })
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  useEffect(() => {
    controller.setSessionToEdit(sessionToEdit);
    controller.ensureDefaultDate();
  }, [controller, sessionToEdit]);

  useEffect(() => () => controller.destroy(), [controller]);

  return {
    ...state,
    setDate: controller.setDate,
    setDuration: controller.setDuration,
    setDescription: controller.setDescription,
    setTechniques: controller.setTechniques,
    setNewTech: controller.setNewTech,
    setEffort: controller.setEffort,
    setCategory: controller.setCategory,
    setNotes: controller.setNotes,
    setVideoUrl: controller.setVideoUrl,
    reset: controller.reset,
  };
}

/**
 * useFormSubmit Hook
 *
 * Handles form validation, API calls, and submission logic
 */
export type FormSubmitOptions = SessionFormSubmitOptions;

export function useFormSubmit(
  formData: SessionFormData,
  sessionToEdit: JudoSession | undefined,
  options: FormSubmitOptions
) {
  const [controller] = useState(() => new SessionFormSubmitController());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  useEffect(() => () => controller.destroy(), [controller]);

  return {
    ...state,
    submit: () => controller.submit(formData, sessionToEdit, options),
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
