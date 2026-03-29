'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
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
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/components/auth-provider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DEFAULT_TRANSFORMER_PROMPT,
  resetTransformerPromptPreference,
  saveTransformerPromptPreference,
} from '@/lib/user-preferences';

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
      await runPromptResetFlow({
        uid: user.uid,
        resetPreference: resetTransformerPromptPreference,
        feedback: {
          toast,
          logError: (message, error) => {
            console.error(message, error);
          },
        },
      });
    } finally {
      setIsResetDialogOpen(false);
      setIsResetting(false);
    }
  };

  const handleRetryLoad = async () => {
    setIsRetryingLoad(true);
    try {
      await retryPreferencesLoad();
    } finally {
      setIsRetryingLoad(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {!canSavePreferences && (
        <Alert className="bg-amber-50 border-amber-200">
          <Info className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-amber-900 font-bold">
            Sign-in required
          </AlertTitle>
          <AlertDescription className="text-amber-800">
            {authAvailable
              ? 'Custom AI prompts are only available after sign-in because they are saved per account.'
              : 'Custom AI prompts are unavailable because Firebase authentication is not configured for this deployment.'}
          </AlertDescription>
        </Alert>
      )}

      <Alert className="bg-primary/5 border-primary/20">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary font-bold">
          Customizing the AI
        </AlertTitle>
        <AlertDescription className="text-muted-foreground">
          The "AI Transform" button in the log form uses these instructions to
          rewrite your notes. You can change the tone (e.g., "be more formal" or
          "be very brief") or define terminology preferences (e.g., Judo terms
          like "uchi mata" or BJJ terms like "armbar") here.
        </AlertDescription>
      </Alert>

      <Card className="bg-card/95 shadow-sm">
        <CardHeader className="bg-secondary/45">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary text-primary-foreground rounded-lg shadow-md">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>AI Transformation Prompt</CardTitle>
              <CardDescription>
                Edit the instructions used to polish your practice descriptions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-8 space-y-4">
          {isLoadingSavedSettings && (
            <div
              className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading saved prompt settings...
            </div>
          )}

          {hasLoadError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not load saved prompt profile</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  We could not load your saved settings. Retry to fetch the
                  latest prompt profile.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRetryLoad()}
                    disabled={isRetryingLoad}
                  >
                    {isRetryingLoad ? 'Retrying…' : 'Retry'}
                  </Button>
                  <details className="text-xs">
                    <summary className="cursor-pointer">Error details</summary>
                    <p className="mt-1 break-words">
                      {preferencesError?.message ?? 'Unknown load error'}
                    </p>
                  </details>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {isUsingDefaultProfile && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Start your first prompt profile</AlertTitle>
              <AlertDescription>
                You are currently using the default prompt. Add instructions or
                import a profile snippet, then save to create your first custom
                prompt profile.
              </AlertDescription>
            </Alert>
          )}

          {hasSaveError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Prompt save failed</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>Your changes were not saved. Retry when you are ready.</p>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={!canSubmitPrompt}
                  >
                    Retry save
                  </Button>
                  <details className="text-xs">
                    <summary className="cursor-pointer">Error details</summary>
                    <p className="mt-1">
                      {saveError?.message ?? 'Unknown save error'}
                    </p>
                  </details>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {hasSaveSuccess && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Prompt saved</AlertTitle>
              <AlertDescription>
                Your prompt profile is up to date.
              </AlertDescription>
            </Alert>
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
        </CardContent>
        <CardFooter className="bg-secondary/45 p-6 flex justify-between items-center">
          <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
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
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Reset custom prompt?
                </DialogTitle>
                <DialogDescription>
                  This will replace your custom instructions with the default
                  prompt. You can still edit it again afterward.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsResetDialogOpen(false)}
                  disabled={isResetting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleReset()}
                  disabled={isResetting}
                  className="gap-2"
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resetting…
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      Yes, reset prompt
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
        </CardFooter>
      </Card>
    </div>
  );
}
