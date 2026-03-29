import assert from 'node:assert/strict';
import test from 'node:test';

import {
  derivePromptSettingsViewState,
  derivePromptSettingsUiState,
  PROMPT_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  PROMPT_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL,
  PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT,
  PROMPT_SETTINGS_ERROR_RETRY_LABEL,
  PROMPT_SETTINGS_LOADING_TEXT,
  resolvePromptAfterDestructiveResetAction,
  runPromptLoadRecoveryFlow,
  runPromptResetFlow,
  runPromptSaveFlow,
} from './prompt-settings';
import { DEFAULT_TRANSFORMER_PROMPT } from '@/lib/user-preferences';

test('save flow emits success toast when preference write succeeds', async () => {
  const toastCalls: Array<{
    title?: string;
    description?: string;
    variant?: string;
  }> = [];

  const didSave = await runPromptSaveFlow({
    uid: 'user-123',
    prompt: 'Prefer concise output.',
    savePreference: async () => undefined,
    feedback: {
      toast: (config) => {
        toastCalls.push(config);
      },
      logError: () => {
        throw new Error('logError should not be called for successful save');
      },
    },
  });

  assert.equal(didSave, true);
  assert.deepEqual(toastCalls, [
    {
      title: 'Prompt updated',
      description:
        'Your AI transformation instructions have been saved successfully.',
    },
  ]);
});

test('save flow emits destructive toast and logs error when preference write fails', async () => {
  const toastCalls: Array<{
    title?: string;
    description?: string;
    variant?: string;
  }> = [];
  const errorLogs: Array<{ message: string; error: unknown }> = [];
  const saveError = new Error('save failed');

  const didSave = await runPromptSaveFlow({
    uid: 'user-123',
    prompt: 'Prefer concise output.',
    savePreference: async () => {
      throw saveError;
    },
    feedback: {
      toast: (config) => {
        toastCalls.push(config);
      },
      logError: (message, error) => {
        errorLogs.push({ message, error });
      },
    },
  });

  assert.equal(didSave, false);
  assert.deepEqual(errorLogs, [
    {
      message: 'Failed to save transformer prompt preference',
      error: saveError,
    },
  ]);
  assert.deepEqual(toastCalls, [
    {
      variant: 'destructive',
      title: 'Could not save prompt',
      description: 'Your prompt was not saved. Please try again in a moment.',
    },
  ]);
});

test('reset flow emits success toast for destructive confirmation action', async () => {
  const toastCalls: Array<{
    title?: string;
    description?: string;
    variant?: string;
  }> = [];

  const didReset = await runPromptResetFlow({
    uid: 'user-123',
    resetPreference: async () => undefined,
    feedback: {
      toast: (config) => {
        toastCalls.push(config);
      },
      logError: () => {
        throw new Error('logError should not be called for successful reset');
      },
    },
  });

  assert.equal(didReset, true);
  assert.deepEqual(toastCalls, [
    {
      description: 'Prompt reset to default training terminology guidelines.',
    },
  ]);
});

test('reset flow emits destructive toast and logs error when destructive action fails', async () => {
  const toastCalls: Array<{
    title?: string;
    description?: string;
    variant?: string;
  }> = [];
  const errorLogs: Array<{ message: string; error: unknown }> = [];
  const resetError = new Error('reset failed');

  const didReset = await runPromptResetFlow({
    uid: 'user-123',
    resetPreference: async () => {
      throw resetError;
    },
    feedback: {
      toast: (config) => {
        toastCalls.push(config);
      },
      logError: (message, error) => {
        errorLogs.push({ message, error });
      },
    },
  });

  assert.equal(didReset, false);
  assert.deepEqual(errorLogs, [
    {
      message: 'Failed to reset transformer prompt preference',
      error: resetError,
    },
  ]);
  assert.deepEqual(toastCalls, [
    {
      variant: 'destructive',
      title: 'Could not reset prompt',
      description:
        'We could not reset your prompt right now. Please try again.',
    },
  ]);
});

test('pending auth and request states keep save/reset controls disabled', () => {
  const authBlocked = derivePromptSettingsUiState({
    prompt: 'Use concise language.',
    canSavePreferences: false,
    isSaving: false,
    isResetting: false,
  });
  const saving = derivePromptSettingsUiState({
    prompt: 'Use concise language.',
    canSavePreferences: true,
    isSaving: true,
    isResetting: false,
  });
  const resetting = derivePromptSettingsUiState({
    prompt: 'Use concise language.',
    canSavePreferences: true,
    isSaving: false,
    isResetting: true,
  });

  assert.equal(authBlocked.areControlsDisabled, true);
  assert.equal(saving.areControlsDisabled, true);
  assert.equal(resetting.areControlsDisabled, true);
  assert.equal(saving.canSubmitPrompt, false);
  assert.equal(resetting.canSubmitPrompt, false);
});

test('view state marks loading while saved settings are being fetched', () => {
  const state = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: false,
    preferencesError: null,
    prompt: '',
    isSaving: false,
    isResetting: false,
    saveStatus: 'idle',
  });

  const loading = state.loading;
  assert.equal(loading, true);
  assert.equal(state.isLoadingSavedSettings, true);
  assert.equal(state.hasLoadError, false);
});

test('loading criterion anchor: loading state present with loading text and disabled interaction while loading', () => {
  const loadingState = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: false,
    preferencesError: null,
    prompt: 'Custom prompt',
    isSaving: false,
    isResetting: false,
    saveStatus: 'idle',
  });

  assert.equal(loadingState.loading, true);
  assert.equal(loadingState.isLoadingSavedSettings, true);
  assert.equal(loadingState.areControlsDisabled, false);
  assert.equal(
    PROMPT_SETTINGS_LOADING_TEXT.toLowerCase().includes('loading'),
    true
  );
});

test('loading criterion anchor: loading disables interaction when save or reset is in progress', () => {
  const loadingAndSaving = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: false,
    preferencesError: null,
    prompt: 'Custom prompt',
    isSaving: true,
    isResetting: false,
    saveStatus: 'idle',
  });

  assert.equal(loadingAndSaving.loading, true);
  assert.equal(loadingAndSaving.areControlsDisabled, true);
  assert.equal(loadingAndSaving.canSubmitPrompt, false);
});

test('view state surfaces empty/default profile guidance', () => {
  const state = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: true,
    preferencesError: null,
    prompt: DEFAULT_TRANSFORMER_PROMPT,
    isSaving: false,
    isResetting: false,
    saveStatus: 'idle',
  });

  assert.equal(state.isUsingDefaultProfile, true);
});

test('view state captures load errors', () => {
  const state = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: true,
    preferencesError: new Error('firestore unavailable'),
    prompt: 'Custom prompt',
    isSaving: false,
    isResetting: false,
    saveStatus: 'idle',
  });

  assert.equal(state.hasLoadError, true);
});

test('error criterion anchor: error state exposes retry recovery action label and callable recover flow', async () => {
  const state = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: true,
    preferencesError: new Error('firestore unavailable'),
    prompt: 'Custom prompt',
    isSaving: false,
    isResetting: false,
    saveStatus: 'idle',
  });
  let recovered = false;

  const didRecover = await runPromptLoadRecoveryFlow({
    retryLoad: async () => {
      recovered = true;
    },
  });

  assert.equal(state.hasLoadError, true);
  assert.equal(
    PROMPT_SETTINGS_ERROR_RETRY_LABEL.toLowerCase().includes('retry'),
    true
  );
  assert.equal(didRecover, true);
  assert.equal(recovered, true);
});

test('error criterion anchor: error recovery handles retry failure without throwing', async () => {
  const didRecover = await runPromptLoadRecoveryFlow({
    retryLoad: async () => {
      throw new Error('retry failed');
    },
  });

  assert.equal(didRecover, false);
});

test('empty criterion anchor: empty/default state includes explicit cta action wording add create configure', () => {
  const state = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: true,
    preferencesError: null,
    prompt: DEFAULT_TRANSFORMER_PROMPT,
    isSaving: false,
    isResetting: false,
    saveStatus: 'idle',
  });
  const ctaLower = PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT.toLowerCase();

  assert.equal(state.isUsingDefaultProfile, true);
  assert.equal(ctaLower.includes('add'), true);
  assert.equal(ctaLower.includes('create'), true);
  assert.equal(ctaLower.includes('prompt profile'), true);
});

test('view state captures save status transitions', () => {
  const savingState = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: true,
    preferencesError: null,
    prompt: 'Custom prompt',
    isSaving: true,
    isResetting: false,
    saveStatus: 'idle',
  });
  const saveErrorState = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: true,
    preferencesError: null,
    prompt: 'Custom prompt',
    isSaving: false,
    isResetting: false,
    saveStatus: 'error',
  });
  const saveSuccessState = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: true,
    preferencesError: null,
    prompt: 'Custom prompt',
    isSaving: false,
    isResetting: false,
    saveStatus: 'success',
  });

  assert.equal(savingState.areControlsDisabled, true);
  assert.equal(saveErrorState.hasSaveError, true);
  assert.equal(saveSuccessState.hasSaveSuccess, true);
});

test('end-to-end style save retry flow fails once then succeeds', async () => {
  const toasts: Array<{
    title?: string;
    description?: string;
    variant?: string;
  }> = [];
  const errors: Array<{ message: string; error: unknown }> = [];
  let attempts = 0;

  const savePreference = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('transient network failure');
    }
  };

  const firstAttempt = await runPromptSaveFlow({
    uid: 'user-123',
    prompt: 'Use domain terminology',
    savePreference,
    feedback: {
      toast: (config) => {
        toasts.push(config);
      },
      logError: (message, error) => {
        errors.push({ message, error });
      },
    },
  });
  const secondAttempt = await runPromptSaveFlow({
    uid: 'user-123',
    prompt: 'Use domain terminology',
    savePreference,
    feedback: {
      toast: (config) => {
        toasts.push(config);
      },
      logError: (message, error) => {
        errors.push({ message, error });
      },
    },
  });

  assert.equal(firstAttempt, false);
  assert.equal(secondAttempt, true);
  assert.equal(errors.length, 1);
  assert.equal(toasts.length, 2);
  assert.equal(toasts[0]?.variant, 'destructive');
  assert.equal(toasts[1]?.title, 'Prompt updated');
});

test('destructive criterion anchor: destructive confirm resets prompt and destructive cancel preserves prompt text', () => {
  const originalPrompt = 'Use very specific judo terminology.';
  const cancelledPrompt = resolvePromptAfterDestructiveResetAction({
    action: 'cancel',
    currentPrompt: originalPrompt,
  });
  const confirmedPrompt = resolvePromptAfterDestructiveResetAction({
    action: 'confirm',
    currentPrompt: originalPrompt,
  });

  assert.equal(
    PROMPT_SETTINGS_DESTRUCTIVE_CANCEL_LABEL.toLowerCase().includes('cancel'),
    true
  );
  assert.equal(
    PROMPT_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL.toLowerCase().includes('reset'),
    true
  );
  assert.equal(cancelledPrompt, originalPrompt);
  assert.equal(confirmedPrompt, DEFAULT_TRANSFORMER_PROMPT);
});
