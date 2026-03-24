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
  resetTransformerPromptPreference,
  saveTransformerPromptPreference,
} from '@/lib/user-preferences';

type PromptSettingsUiState = {
  isPromptMeaningful: boolean;
  areControlsDisabled: boolean;
  canSubmitPrompt: boolean;
};

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
  const areControlsDisabled =
    !canSavePreferences || isSaving || isResetting;

  return {
    isPromptMeaningful,
    areControlsDisabled,
    canSubmitPrompt: isPromptMeaningful && !areControlsDisabled,
  };
}

export function PromptSettings() {
  const { toast } = useToast();
  const { user, preferences, canSavePreferences, authAvailable } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const savedIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const { isPromptMeaningful, areControlsDisabled, canSubmitPrompt } =
    derivePromptSettingsUiState({
      prompt,
      canSavePreferences,
      isSaving,
      isResetting,
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
    try {
      await saveTransformerPromptPreference(user.uid, prompt);
      setIsSaved(true);
      toast({
        title: 'Prompt updated',
        description:
          'Your AI transformation instructions have been saved successfully.',
      });
      if (savedIndicatorTimeoutRef.current !== null) {
        clearTimeout(savedIndicatorTimeoutRef.current);
      }
      savedIndicatorTimeoutRef.current = setTimeout(() => {
        savedIndicatorTimeoutRef.current = null;
        setIsSaved(false);
      }, 3000);
    } catch (error) {
      console.error('Failed to save transformer prompt preference', error);
      toast({
        variant: 'destructive',
        title: 'Could not save prompt',
        description:
          'Your prompt was not saved. Please try again in a moment.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!user || isSaving || isResetting) return;

    setIsResetting(true);
    try {
      await resetTransformerPromptPreference(user.uid);
      setIsResetDialogOpen(false);
      toast({
        description: 'Prompt reset to default Kodokan standards.',
      });
    } catch (error) {
      console.error('Failed to reset transformer prompt preference', error);
      toast({
        variant: 'destructive',
        title: 'Could not reset prompt',
        description:
          'We could not reset your prompt right now. Please try again.',
      });
    } finally {
      setIsResetting(false);
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
          "be very brief") or add your own terminology rules here.
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
              onChange={(e) => setPrompt(e.target.value)}
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
            ) : isSaved ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving…' : isSaved ? 'Saved!' : 'Save Prompt'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
