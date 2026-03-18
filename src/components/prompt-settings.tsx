'use client';

import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/components/auth-provider';
import {
  resetTransformerPromptPreference,
  saveTransformerPromptPreference,
} from '@/lib/user-preferences';

export function PromptSettings() {
  const { toast } = useToast();
  const { user, preferences, canSavePreferences, authAvailable } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const savedIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

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
    if (!user) return;

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
  };

  const handleReset = async () => {
    if (!user) return;

    await resetTransformerPromptPreference(user.uid);
    toast({
      description: 'Prompt reset to default Kodokan standards.',
    });
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

      <Card className="border-primary/10 shadow-sm">
        <CardHeader className="bg-primary/5 border-b">
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
              disabled={!canSavePreferences}
              className="min-h-[400px] font-mono text-sm bg-secondary/5 border-primary/10 focus:border-primary/30 transition-colors leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground italic">
              Note: The AI will automatically append your practice description
              to the end of these instructions during transformation.
            </p>
          </div>
        </CardContent>
        <CardFooter className="bg-primary/5 border-t p-6 flex justify-between items-center">
          <Button
            variant="outline"
            onClick={() => void handleReset()}
            disabled={!canSavePreferences}
            className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!canSavePreferences}
            className="gap-2 px-8 font-bold shadow-lg h-11 transition-all"
          >
            {isSaved ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaved ? 'Saved!' : 'Save Prompt'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
