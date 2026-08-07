import { DEFAULT_TRANSFORMER_PROMPT } from '@/lib/user-preferences';

export type PromptSettingsUiState = {
  isPromptMeaningful: boolean;
  areControlsDisabled: boolean;
  canSubmitPrompt: boolean;
};

export type PromptSettingsViewState = PromptSettingsUiState & {
  loading: boolean;
  isLoadingSavedSettings: boolean;
  hasLoadError: boolean;
  isUsingDefaultProfile: boolean;
  emptyStateCtaAction: 'edit-prompt-profile';
  isEmptyStateCtaAvailable: boolean;
  hasSaveError: boolean;
  hasSaveSuccess: boolean;
};

export type PromptSettingsToast = {
  variant?: 'destructive';
  title?: string;
  description: string;
};

type Feedback = {
  toast: (config: PromptSettingsToast) => void;
  logError: (message: string, error: unknown) => void;
};

export const PROMPT_SETTINGS_LOADING_TEXT = 'Loading saved prompt settings...';
export const PROMPT_SETTINGS_ERROR_RETRY_LABEL = 'Retry';
export const PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT =
  'Add instructions or import a profile snippet, then save to create your first custom prompt profile.';
export const PROMPT_SETTINGS_EMPTY_STATE_CTA_ACTION = 'edit-prompt-profile';
export const PROMPT_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL = 'Yes, reset prompt';
export const PROMPT_SETTINGS_DESTRUCTIVE_CANCEL_LABEL = 'Cancel';

export async function runPromptSaveFlow({
  uid,
  prompt,
  savePreference,
  feedback,
}: {
  uid: string;
  prompt: string;
  savePreference: (uid: string, prompt: string) => Promise<void>;
  feedback: Feedback;
}): Promise<boolean> {
  try {
    await savePreference(uid, prompt);
    feedback.toast({
      title: 'Prompt updated',
      description:
        'Your AI transformation instructions have been saved successfully.',
    });
    return true;
  } catch (error) {
    feedback.logError('Failed to save transformer prompt preference', error);
    feedback.toast({
      variant: 'destructive',
      title: 'Could not save prompt',
      description: 'Your prompt was not saved. Please try again in a moment.',
    });
    return false;
  }
}

export async function runPromptResetFlow({
  uid,
  resetPreference,
  feedback,
}: {
  uid: string;
  resetPreference: (uid: string) => Promise<void>;
  feedback: Feedback;
}): Promise<boolean> {
  try {
    await resetPreference(uid);
    feedback.toast({
      description: 'Prompt reset to default training terminology guidelines.',
    });
    return true;
  } catch (error) {
    feedback.logError('Failed to reset transformer prompt preference', error);
    feedback.toast({
      variant: 'destructive',
      title: 'Could not reset prompt',
      description:
        'We could not reset your prompt right now. Please try again.',
    });
    return false;
  }
}

export async function runPromptLoadRecoveryFlow({
  retryLoad,
}: {
  retryLoad: () => Promise<void>;
}): Promise<boolean> {
  try {
    await retryLoad();
    return true;
  } catch {
    return false;
  }
}

export function resolvePromptAfterDestructiveResetAction({
  action,
  currentPrompt,
  defaultPrompt = DEFAULT_TRANSFORMER_PROMPT,
}: {
  action: 'confirm' | 'cancel';
  currentPrompt: string;
  defaultPrompt?: string;
}): string {
  return action === 'confirm' ? defaultPrompt : currentPrompt;
}

export function derivePromptSettingsUiState({
  prompt,
  canSavePreferences,
  isSaving,
  isResetting,
}: {
  prompt: string;
  canSavePreferences: boolean;
  isSaving: boolean;
  isResetting: boolean;
}): PromptSettingsUiState {
  const isPromptMeaningful = prompt.trim().length > 0;
  const areControlsDisabled = !canSavePreferences || isSaving || isResetting;
  return {
    isPromptMeaningful,
    areControlsDisabled,
    canSubmitPrompt: isPromptMeaningful && !areControlsDisabled,
  };
}

export function derivePromptSettingsViewState({
  canSavePreferences,
  preferencesReady,
  preferencesError,
  prompt,
  isSaving,
  isResetting,
  saveStatus,
}: {
  canSavePreferences: boolean;
  preferencesReady: boolean;
  preferencesError: Error | null;
  prompt: string;
  isSaving: boolean;
  isResetting: boolean;
  saveStatus: 'idle' | 'success' | 'error';
}): PromptSettingsViewState {
  const uiState = derivePromptSettingsUiState({
    prompt,
    canSavePreferences,
    isSaving,
    isResetting,
  });
  return {
    ...uiState,
    loading: canSavePreferences && !preferencesReady,
    isLoadingSavedSettings: canSavePreferences && !preferencesReady,
    hasLoadError: canSavePreferences && preferencesError !== null,
    isUsingDefaultProfile:
      canSavePreferences &&
      preferencesReady &&
      prompt.trim() === DEFAULT_TRANSFORMER_PROMPT.trim(),
    emptyStateCtaAction: PROMPT_SETTINGS_EMPTY_STATE_CTA_ACTION,
    isEmptyStateCtaAvailable:
      canSavePreferences &&
      preferencesReady &&
      preferencesError === null &&
      !uiState.areControlsDisabled,
    hasSaveError: saveStatus === 'error',
    hasSaveSuccess: saveStatus === 'success',
  };
}
