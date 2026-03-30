'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  BrainCircuit,
  Save,
  RotateCcw,
  Info,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/components/auth-provider';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginNotice } from '@/components/plugins/plugin-notice';
import { getPluginThemeTokens } from '@/components/plugins/plugin-theme';
import {
  DEFAULT_TRANSFORMER_PROMPT,
  resetTransformerPromptPreference,
  saveTransformerPromptPreference,
} from '@/lib/user-preferences';
import {
  PluginEmptyState,
  PluginErrorState,
  PluginLoadingState,
  PluginSuccessState,
} from '@/components/plugins/plugin-state';
import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';
import {
  PluginFormSection,
  PluginStatusPanel,
} from '@/components/plugins/plugin-kit';

type PromptSettingsUiState = {
  isPromptMeaningful: boolean;
  areControlsDisabled: boolean;
  canSubmitPrompt: boolean;
};

type PromptSettingsViewState = PromptSettingsUiState & {
  loading: boolean;
  isLoadingSavedSettings: boolean;
  hasLoadError: boolean;
  isUsingDefaultProfile: boolean;
  hasSaveError: boolean;
  hasSaveSuccess: boolean;
};

export const PROMPT_SETTINGS_LOADING_TEXT = 'Loading saved prompt settings...';
export const PROMPT_SETTINGS_ERROR_RETRY_LABEL = 'Retry';
export const PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT =
  'Add instructions or import a profile snippet, then save to create your first custom prompt profile.';
export const PROMPT_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL = 'Yes, reset prompt';
export const PROMPT_SETTINGS_DESTRUCTIVE_CANCEL_LABEL = 'Cancel';

type PromptSettingsToast = {
  variant?: 'destructive';
  title?: string;
  description: string;
};

type PromptSettingsFeedbackDeps = {
  toast: (config: PromptSettingsToast) => void;
  logError: (message: string, error: unknown) => void;
};

export async function runPromptSaveFlow({
  uid,
  prompt,
  savePreference,
  feedback,
}: {
  uid: string;
  prompt: string;
  savePreference: (uid: string, prompt: string) => Promise<void>;
  feedback: PromptSettingsFeedbackDeps;
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
  feedback: PromptSettingsFeedbackDeps;
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
  if (action === 'confirm') {
    return defaultPrompt;
  }

  return currentPrompt;
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
    hasSaveError: saveStatus === 'error',
    hasSaveSuccess: saveStatus === 'success',
  };
}

export function PromptSettings() {
  const { toast } = useToast();
  const {
    user,
    preferences,
    preferencesReady,
    preferencesError,
    canSavePreferences,
    authAvailable,
    retryPreferencesLoad,
  } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const theme = getPluginThemeTokens('info');
  const savedIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const {
    isPromptMeaningful,
    areControlsDisabled,
    canSubmitPrompt,
    isLoadingSavedSettings,
    hasLoadError,
    isUsingDefaultProfile,
    hasSaveError,
    hasSaveSuccess,
  } = derivePromptSettingsViewState({
    prompt,
    canSavePreferences,
    preferencesReady,
    preferencesError,
    isSaving,
    isResetting,
    saveStatus,
  });

  useEffect(() => {
    setPrompt(preferences.transformerPrompt);
  }, [preferences.transformerPrompt]);

  useEffect(() => {
    return () => {
      if (savedIndicatorTimeoutRef.current !== null) {
        clearTimeout(savedIndicatorTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    if (!user || !isPromptMeaningful || isSaving || isResetting) return;

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
          logError: (message, error) => {
            console.error(message, error);
          },
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
          logError: (message, error) => {
            console.error(message, error);
          },
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
      await runPromptLoadRecoveryFlow({
        retryLoad: retryPreferencesLoad,
      });
    } finally {
      setIsRetryingLoad(false);
    }
  };

  return (
    <PluginPageShell
      title="AI Transformation Prompt"
      description="Edit the instructions used to polish your practice descriptions."
      tone="info"
      icon={<BrainCircuit className="h-6 w-6" />}
      notice={
        <PluginNotice
          tone="info"
          icon={<Info className="h-4 w-4" />}
          title="Customizing the AI"
          description='The "AI Transform" button in the log form uses these instructions to rewrite your notes. You can change the tone (e.g., "be more formal" or "be very brief") or define terminology preferences (e.g., Judo terms like "uchi mata" or BJJ terms like "armbar") here.'
        />
      }
      className="animate-in slide-in-from-bottom-4 fade-in duration-500"
    >
      {!canSavePreferences && (
        <Alert className={theme.warningTone}>
          <Info className="h-4 w-4" />
          <AlertTitle className="font-bold">Sign-in required</AlertTitle>
          <AlertDescription className="text-current/90">
            {authAvailable
              ? 'Custom AI prompts are only available after sign-in because they are saved per account.'
              : 'Custom AI prompts are unavailable because Firebase authentication is not configured for this deployment.'}
          </AlertDescription>
        </Alert>
      )}

      <PluginFormSection
        title="Prompt profile"
        description="Define system instructions used by the AI transform action."
        className="shadow-sm"
        contentClassName="p-6 pt-8"
        footerClassName="p-6"
        footerActions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsResetDialogOpen(true)}
              disabled={areControlsDisabled}
              className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
            >
              {isResetting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {isResetting ? 'Resetting…' : 'Reset to Default'}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={!canSubmitPrompt}
              className="gap-2 px-8 font-bold shadow-lg h-11 transition-all"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : hasSaveSuccess ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? 'Saving…' : hasSaveSuccess ? 'Saved!' : 'Save Prompt'}
            </Button>
          </>
        }
      >
          {isLoadingSavedSettings && (
            <PluginLoadingState description={PROMPT_SETTINGS_LOADING_TEXT} />
          )}

          {hasLoadError && (
            <PluginErrorState
              title="Could not load saved prompt profile"
              message="We could not load your saved settings. Retry to fetch the latest prompt profile."
              onRetry={() => void handleRetryLoad()}
              retryLabel={
                isRetryingLoad ? 'Retrying…' : PROMPT_SETTINGS_ERROR_RETRY_LABEL
              }
              details={preferencesError?.message ?? 'Unknown load error'}
            />
          )}

          {isUsingDefaultProfile && (
            <PluginEmptyState
              title="Start your first prompt profile"
              description={
                <>
                  You are currently using the default prompt.{' '}
                  {PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT}
                </>
              }
              icon={<Info className="h-4 w-4" />}
            />
          )}

          {hasSaveError && (
            <PluginStatusPanel
              variant="error"
              title="Prompt save failed"
              description={
                saveError?.message
                  ? `Your changes were not saved. ${saveError.message}`
                  : 'Your changes were not saved. Retry when you are ready.'
              }
              onCta={() => void handleSave()}
              ctaLabel="Retry save"
            />
          )}

          {hasSaveSuccess && (
            <PluginSuccessState
              title="Prompt saved"
              description="Your prompt profile is up to date."
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            />
          )}

          {!isLoadingSavedSettings && (
            <div className="space-y-3">
              <Label
                htmlFor="custom-prompt"
                className="text-sm font-bold flex items-center gap-2"
              >
                System Instructions
                <span className="text-xs font-normal text-muted-foreground">
                  (Requires Handlebars syntax for context)
                </span>
              </Label>
              <Textarea
                id="custom-prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setSaveStatus('idle');
                  setSaveError(null);
                }}
                placeholder="Enter your custom instructions here..."
                disabled={areControlsDisabled}
                className="min-h-[400px] font-mono text-sm bg-background/75 border-ghost focus:border-primary/30 transition-colors leading-relaxed"
              />
              <p className="text-[11px] text-muted-foreground italic">
                {isPromptMeaningful
                  ? 'Note: The AI will automatically append your practice description to the end of these instructions during transformation.'
                  : 'Add at least one instruction before saving. Blank prompts cannot be saved.'}
              </p>
            </div>
          )}
      </PluginFormSection>
      <PluginConfirmationDialog
        open={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        title="Reset custom prompt?"
        description="This will replace your custom instructions with the default prompt. You can still edit it again afterward."
        confirmLabel={PROMPT_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL}
        pendingLabel="Resetting…"
        cancelLabel={PROMPT_SETTINGS_DESTRUCTIVE_CANCEL_LABEL}
        onCancel={() => {
          setPrompt((currentPrompt) =>
            resolvePromptAfterDestructiveResetAction({
              action: 'cancel',
              currentPrompt,
            })
          );
          setIsResetDialogOpen(false);
        }}
        onConfirm={() => void handleReset()}
        isPending={isResetting}
      />
    </PluginPageShell>
  );
}
