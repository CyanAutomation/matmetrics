import assert from 'node:assert/strict';
import test from 'node:test';

import { derivePromptSettingsUiState } from './prompt-settings';

test('keeps auth guard behavior by disabling controls when preferences cannot be saved', () => {
  const state = derivePromptSettingsUiState({
    prompt: 'Use a concise tone.',
    canSavePreferences: false,
    isSaving: false,
    isResetting: false,
  });

  assert.equal(state.isPromptMeaningful, true);
  assert.equal(state.areControlsDisabled, true);
  assert.equal(state.canSubmitPrompt, false);
});

test('disables save for blank prompt text even when auth allows preference writes', () => {
  const state = derivePromptSettingsUiState({
    prompt: '   \n\t',
    canSavePreferences: true,
    isSaving: false,
    isResetting: false,
  });

  assert.equal(state.isPromptMeaningful, false);
  assert.equal(state.areControlsDisabled, false);
  assert.equal(state.canSubmitPrompt, false);
});

test('disables submit while save or reset requests are pending', () => {
  const savingState = derivePromptSettingsUiState({
    prompt: 'Keep Japanese terminology where possible.',
    canSavePreferences: true,
    isSaving: true,
    isResetting: false,
  });
  const resettingState = derivePromptSettingsUiState({
    prompt: 'Keep Japanese terminology where possible.',
    canSavePreferences: true,
    isSaving: false,
    isResetting: true,
  });

  assert.equal(savingState.areControlsDisabled, true);
  assert.equal(savingState.canSubmitPrompt, false);
  assert.equal(resettingState.areControlsDisabled, true);
  assert.equal(resettingState.canSubmitPrompt, false);
});
