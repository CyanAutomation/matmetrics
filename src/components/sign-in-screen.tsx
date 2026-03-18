'use client';

import React, { useState } from 'react';
import { Github, Loader2, LockKeyhole } from 'lucide-react';
import { RessaImage } from '@/components/ressa-image';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth-provider';
import { CARD_INTERACTION_CLASS } from '@/lib/interaction';
import { useActionFeedback } from '@/hooks/use-action-feedback';

type AuthMode = 'sign-in' | 'sign-up' | 'reset';

type SignInScreenProps = {
  onContinueAsGuest?: () => void;
};

export function SignInScreen({ onContinueAsGuest }: SignInScreenProps) {
  const { toast } = useToast();
  const {
    isConfigured,
    signInWithGoogle,
    signInWithGitHub,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const googleFeedback = useActionFeedback();
  const githubFeedback = useActionFeedback();
  const emailFeedback = useActionFeedback();

  const title =
    mode === 'sign-up'
      ? 'Create your account'
      : mode === 'reset'
        ? 'Reset your password'
        : 'Sign in to MatMetrics';

  const description =
    mode === 'sign-up'
      ? 'Use Google or create an email/password account.'
      : mode === 'reset'
        ? 'Enter your email and Firebase will send a password reset link.'
        : 'Sign in to unlock AI tools, GitHub sync, and cloud-backed preferences.';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    emailFeedback.startLoading();

    try {
      if (mode === 'sign-in') {
        await signInWithEmail(email, password);
        return;
      }

      if (mode === 'sign-up') {
        await signUpWithEmail(name, email, password);
        return;
      }

      await sendPasswordReset(email);
      emailFeedback.showSuccess();
      toast({
        title: 'Password reset sent',
        description: 'Check your inbox for a Firebase password reset email.',
      });
      setMode('sign-in');
    } catch (error) {
      emailFeedback.showError();
      const message =
        error instanceof Error ? error.message : 'Authentication failed';
      toast({
        title: 'Authentication error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    googleFeedback.startLoading();
    try {
      await signInWithGoogle();
    } catch (error) {
      googleFeedback.showError();
      const message =
        error instanceof Error ? error.message : 'Google sign-in failed';
      toast({
        title: 'Authentication error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setIsSubmitting(true);
    githubFeedback.startLoading();
    try {
      await signInWithGitHub();
    } catch (error) {
      githubFeedback.showError();
      const message =
        error instanceof Error ? error.message : 'GitHub sign-in failed';
      toast({
        title: 'Authentication error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.16),_transparent_40%),linear-gradient(135deg,_hsl(var(--background)),_hsl(var(--secondary)/0.35))] flex items-center justify-center p-1">
      <Card
        className={`w-full max-w-md shadow-2xl border-primary/15 ${CARD_INTERACTION_CLASS}`}
      >
        <CardHeader className="space-y-4">
          <RessaImage
            pose={3}
            size="medium"
            alt="Ressa welcomes you to MatMetrics"
          />
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground">
              🐾
            </div>
            <div>
              <CardTitle className="text-2xl">MatMetrics</CardTitle>
              <CardDescription>
                {isConfigured
                  ? 'Firebase-backed accounts and preferences'
                  : 'Guest mode is available'}
              </CardDescription>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">
              {isConfigured
                ? description
                : 'Authentication is unavailable right now, but you can still explore the app in guest mode with local demo data.'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConfigured && (
            <Alert className="border-destructive/30 bg-destructive/5">
              <LockKeyhole className="h-4 w-4" />
              <AlertTitle>Firebase is not configured</AlertTitle>
              <AlertDescription>
                Add the `NEXT_PUBLIC_FIREBASE_*` variables and
                `FIREBASE_SERVICE_ACCOUNT_KEY` to enable authentication.
              </AlertDescription>
            </Alert>
          )}

          {onContinueAsGuest && (
            <Button
              type="button"
              className="w-full h-11"
              variant={isConfigured ? 'secondary' : 'default'}
              interaction={isConfigured ? 'subtle' : 'primary-action'}
              onClick={onContinueAsGuest}
              disabled={isSubmitting}
            >
              Continue in Guest Mode
            </Button>
          )}

          {isConfigured && (
            <>
              {onContinueAsGuest && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      or sign in
                    </span>
                  </div>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full h-11"
                interaction="subtle"
                feedbackState={googleFeedback.feedbackState}
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleMark className="h-4 w-4" />
                )}
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11"
                interaction="subtle"
                feedbackState={githubFeedback.feedbackState}
                onClick={handleGitHubSignIn}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Github className="h-4 w-4" />
                )}
                Continue with GitHub
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    or use email
                  </span>
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'sign-up' && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Display name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>

                {mode !== 'reset' && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={
                        mode === 'sign-up' ? 'new-password' : 'current-password'
                      }
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                )}

                <Button
                  interaction="primary-action"
                  feedbackState={emailFeedback.feedbackState}
                  type="submit"
                  className="w-full h-11"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {mode === 'sign-up'
                    ? 'Create account'
                    : mode === 'reset'
                      ? 'Send reset email'
                      : 'Sign in'}
                </Button>
              </form>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-primary"
                  onClick={() =>
                    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
                  }
                >
                  {mode === 'sign-in' ? 'Create account' : 'Back to sign in'}
                </button>

                {mode === 'sign-in' && (
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => setMode('reset')}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M21.35 11.1H12v2.98h5.35c-.23 1.5-1.74 4.4-5.35 4.4-3.22 0-5.85-2.67-5.85-5.97s2.63-5.97 5.85-5.97c1.84 0 3.07.78 3.77 1.45l2.57-2.5C16.7 3.95 14.58 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c5.2 0 8.65-3.65 8.65-8.8 0-.59-.06-1.04-.14-1.5Z" />
    </svg>
  );
}
