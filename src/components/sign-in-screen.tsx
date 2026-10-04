'use client';

import React, { useState } from 'react';
import { Fingerprint, GitBranch, Loader2 } from 'lucide-react';
import { MatMetricsLogo } from '@/components/matmetrics-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth-provider';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { getAuthErrorMessage } from '@/lib/auth-error-message';

type AuthMode = 'sign-in' | 'sign-up' | 'passkey-sign-up' | 'reset';

type SignInScreenProps = {
  onContinueAsGuest?: () => void;
  onAuthenticated?: () => void;
};

export function SignInScreen({
  onContinueAsGuest,
  onAuthenticated,
}: SignInScreenProps) {
  const { toast } = useToast();
  const {
    isConfigured,
    firebaseConfigured,
    betterAuthConfigured,
    signInWithPasskey,
    signUpWithPasskey,
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
  const passkeyFeedback = useActionFeedback();

  const title =
    mode === 'sign-up' || mode === 'passkey-sign-up'
      ? 'Create your account'
      : mode === 'reset'
        ? 'Reset your password'
        : 'Sign in';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    emailFeedback.startLoading();

    try {
      if (mode === 'sign-in') {
        await signInWithEmail(email, password);
        onAuthenticated?.();
        return;
      }

      if (mode === 'sign-up') {
        await signUpWithEmail(name, email, password);
        onAuthenticated?.();
        return;
      }

      if (mode === 'passkey-sign-up') {
        await signUpWithPasskey(name, email);
        onAuthenticated?.();
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
      toast({
        title: 'Authentication error',
        description: getAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setIsSubmitting(true);
    passkeyFeedback.startLoading();
    try {
      await signInWithPasskey();
      onAuthenticated?.();
    } catch (error) {
      passkeyFeedback.showError();
      toast({
        title: 'Passkey sign-in failed',
        description: getAuthErrorMessage(
          error,
          'Could not sign in with a passkey. Please try again.'
        ),
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
      onAuthenticated?.();
    } catch (error) {
      googleFeedback.showError();
      toast({
        title: 'Authentication error',
        description: getAuthErrorMessage(
          error,
          'Google sign-in failed. Please try again.'
        ),
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
      onAuthenticated?.();
    } catch (error) {
      githubFeedback.showError();
      toast({
        title: 'Authentication error',
        description: getAuthErrorMessage(
          error,
          'GitHub sign-in failed. Please try again.'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-6">
          <MatMetricsLogo size="lg" variant="solid" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">MatMetrics</h1>
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {isConfigured
            ? 'Sign in to sync sessions, unlock AI tools, and back up your training data.'
            : 'Authentication is not configured. Explore the app in guest mode.'}
        </p>

        {!isConfigured && (
          <Alert className="mb-6 ui-alert-warning">
            <AlertTitle>Authentication is not configured</AlertTitle>
            <AlertDescription>
              Configure Better Auth or Firebase to enable sign-in. You can
              still explore the app in guest mode.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {onContinueAsGuest && (
            <Button
              type="button"
              className="w-full"
              variant="outline"
              onClick={onContinueAsGuest}
              disabled={isSubmitting}
            >
              Continue as guest
            </Button>
          )}

          {isConfigured && (
            <>
              {betterAuthConfigured && mode === 'sign-in' && (
                <Button
                  type="button"
                  className="w-full"
                  feedbackState={passkeyFeedback.feedbackState}
                  onClick={handlePasskeySignIn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Fingerprint className="h-4 w-4" />
                  )}
                  Use a passkey
                </Button>
              )}

              {betterAuthConfigured && mode === 'sign-in' && firebaseConfigured && (
                <p className="text-center text-xs text-muted-foreground">
                  Existing accounts can continue with Firebase while passkeys
                  are being linked.
                </p>
              )}

              {onContinueAsGuest && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[color:color-mix(in_srgb,var(--color-outline-variant)_0.15,transparent)]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      or sign in
                    </span>
                  </div>
                </div>
              )}

              {firebaseConfigured && <Button
                type="button"
                variant="outline"
                className="w-full"
                feedbackState={googleFeedback.feedbackState}
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleMark className="h-4 w-4" />
                )}
                Google
              </Button>}

              {firebaseConfigured && <Button
                type="button"
                variant="outline"
                className="w-full"
                feedbackState={githubFeedback.feedbackState}
                onClick={handleGitHubSignIn}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GitBranch className="h-4 w-4" />
                )}
                GitHub
              </Button>}

              {firebaseConfigured && <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[color:color-mix(in_srgb,var(--color-outline-variant)_0.15,transparent)]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    or use email
                  </span>
                </div>
              </div>}

              {mode !== 'sign-in' || firebaseConfigured ? <form className="space-y-4" onSubmit={handleSubmit}>
                {(mode === 'sign-up' || mode === 'passkey-sign-up') && (
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

                {mode !== 'reset' && mode !== 'passkey-sign-up' && (
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

                {mode === 'passkey-sign-up' && (
                  <p className="text-xs text-muted-foreground">
                    Your email is an account label, not a recovery method.
                    Passkeys are the only sign-in credential for this account.
                  </p>
                )}

                <Button
                  feedbackState={emailFeedback.feedbackState}
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {mode === 'sign-up'
                    ? 'Create account'
                    : mode === 'passkey-sign-up'
                      ? 'Create account with a passkey'
                    : mode === 'reset'
                      ? 'Send reset email'
                      : 'Sign in'}
                </Button>
              </form> : null}

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-primary"
                  onClick={() => {
                    if (mode === 'passkey-sign-up' || mode === 'reset') {
                      setMode('sign-in');
                    } else {
                      setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                    }
                  }}
                >
                  {mode === 'sign-in' ? 'Create account' : 'Back to sign in'}
                </button>

                {mode === 'sign-in' && firebaseConfigured && (
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => setMode('reset')}
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {betterAuthConfigured && mode === 'sign-in' && (
                <button
                  type="button"
                  className="w-full text-sm text-primary"
                  onClick={() => setMode('passkey-sign-up')}
                  disabled={isSubmitting}
                >
                  Create an account with a passkey
                </button>
              )}

            </>
          )}
        </div>
      </div>
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
