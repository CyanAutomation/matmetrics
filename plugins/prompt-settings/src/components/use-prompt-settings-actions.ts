import { useEffect, useRef, useState } from 'react';

import {
  resetTransformerPromptPreference,
  saveTransformerPromptPreference,
} from '@/lib/user-preferences';
import {
  resolvePromptAfterDestructiveResetAction,
  runPromptLoadRecoveryFlow,
  runPromptResetFlow,
  runPromptSaveFlow,
} from './prompt-settings-view-model';

type UsePromptSettingsActionsParams = {
  user: { uid: string } | null;
  prompt: string;
  setPrompt: (value: string | ((current: string) => string)) => void;
  toast: (config: {
    variant?: 'destructive';
    title?: string;
    description?: string;
  }) => unknown;
  retryPreferencesLoad: () => Promise<void>;
};

export function usePromptSettingsActions({
  user,
  prompt,
  setPrompt,
  toast,
  retryPreferencesLoad,
}: UsePromptSettingsActionsParams) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const savedIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(
    () => () => {
      if (savedIndicatorTimeoutRef.current !== null) {
        clearTimeout(savedIndicatorTimeoutRef.current);
      }
    },
    []
  );

  const handleSave = async () => {
    if (!user || !prompt.trim() || isSaving || isResetting) return;
    setIsSaving(true);
    setSaveStatus('idle');
    setSaveError(null);
    try {
      const didSave = await runPromptSaveFlow({
        uid: user.uid,
        prompt,
        savePreference: saveTransformerPromptPreference,
        feedback: {
          toast,
          logError: (message, error) => console.error(message, error),
        },
      });
      if (!didSave) {
        setSaveStatus('error');
        setSaveError(new Error('Save request failed.'));
        return;
      }
      setSaveStatus('success');
      if (savedIndicatorTimeoutRef.current !== null) {
        clearTimeout(savedIndicatorTimeoutRef.current);
      }
      savedIndicatorTimeoutRef.current = setTimeout(() => {
        savedIndicatorTimeoutRef.current = null;
        setSaveStatus('idle');
      }, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!user || isSaving || isResetting) return;
    setIsResetting(true);
    try {
      const didReset = await runPromptResetFlow({
        uid: user.uid,
        resetPreference: resetTransformerPromptPreference,
        feedback: {
          toast,
          logError: (message, error) => console.error(message, error),
        },
      });
      if (didReset) {
        setPrompt((currentPrompt) =>
          resolvePromptAfterDestructiveResetAction({
            action: 'confirm',
            currentPrompt,
          })
        );
        setSaveStatus('idle');
        setSaveError(null);
      }
    } finally {
      setIsResetDialogOpen(false);
      setIsResetting(false);
    }
  };

  const handleRetryLoad = async () => {
    setIsRetryingLoad(true);
    try {
      await runPromptLoadRecoveryFlow({ retryLoad: retryPreferencesLoad });
    } finally {
      setIsRetryingLoad(false);
    }
  };

  return {
    saveStatus,
    saveError,
    setSaveStatus,
    setSaveError,
    isRetryingLoad,
    isSaving,
    isResetting,
    isResetDialogOpen,
    setIsResetDialogOpen,
    handleSave,
    handleReset,
    handleRetryLoad,
  };
}
