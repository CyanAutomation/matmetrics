import assert from 'node:assert/strict';
import test from 'node:test';

import {
  derivePromptSettingsUiState,
  runPromptResetFlow,
  runPromptSaveFlow,
} from './prompt-settings';

test('save flow emits success toast when preference write succeeds', async () => {
  const toastCalls: Array<{ title?: string; description?: string; variant?: string }> = [];

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
  const toastCalls: Array<{ title?: string; description?: string; variant?: string }> = [];
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
  const toastCalls: Array<{ title?: string; description?: string; variant?: string }> = [];

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
      description: 'Prompt reset to default Kodokan standards.',
    },
  ]);
});

test('reset flow emits destructive toast and logs error when destructive action fails', async () => {
  const toastCalls: Array<{ title?: string; description?: string; variant?: string }> = [];
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
      description: 'We could not reset your prompt right now. Please try again.',
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

