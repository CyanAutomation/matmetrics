'use client';

import React, { useState } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { MatMetricsLogo } from '@/components/matmetrics-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth-provider';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { getAuthErrorMessage } from '@/lib/auth-error-message';

type AuthMode = 'sign-in' | 'sign-up' | 'reset' | 'verification-sent';

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
    betterAuthConfigured,
    emailPasswordSignupEnabled,
    signInWithPasskey,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    sendEmailVerification,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailFeedback = useActionFeedback();
  const passkeyFeedback = useActionFeedback();

  const title =
    mode === 'sign-up'
      ? 'Create your account'
      : mode === 'reset'
        ? 'Reset your password'
        : mode === 'verification-sent'
          ? 'Check your email'
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
        setMode('verification-sent');
        emailFeedback.showSuccess();
        return;
      }

      await sendPasswordReset(email);
      setMode('verification-sent');
      emailFeedback.showSuccess();
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

  const handleResendVerification = async () => {
    setIsSubmitting(true);
    try {
      await sendEmailVerification(email);
      toast({
        title: 'If verification is needed, an email is on its way',
        description: 'Check your inbox for a MatMetrics verification link.',
      });
    } catch (error) {
      toast({
        title: 'Could not send verification email',
        description: getAuthErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <MatMetricsLogo size="lg" variant="solid" />
          <h1 className="text-xl font-bold tracking-tight">MatMetrics</h1>
        </div>

        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === 'verification-sent'
            ? 'If this address can be used for the requested action, we sent an email with the next step.'
            : isConfigured
              ? 'Sign in to sync sessions, unlock AI tools, and back up your training data.'
              : 'Authentication is not configured. Explore the app in guest mode.'}
        </p>

        {!isConfigured && (
          <Alert className="mb-6 ui-alert-warning">
            <AlertTitle>Authentication is not configured</AlertTitle>
            <AlertDescription>
              Configure Better Auth to enable sign-in. You can still explore
              the app in guest mode.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
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

          {mode === 'verification-sent' ? (
            <div className="space-y-4">
              <Alert>
                <AlertTitle>Check your inbox</AlertTitle>
                <AlertDescription>
                  We sent the next step to <strong>{email}</strong>, if an
                  account action is available for that address.
                </AlertDescription>
              </Alert>
              {emailPasswordSignupEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleResendVerification()}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Resend verification email
                </Button>
              )}
              <button
                type="button"
                className="w-full text-sm text-primary"
                onClick={() => setMode('sign-in')}
              >
                Back to sign in
              </button>
            </div>
          ) : (
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

              {mode === 'sign-in' && onContinueAsGuest && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[color:color-mix(in_srgb,var(--color-outline-variant)_0.15,transparent)]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      or use email
                    </span>
                  </div>
                </div>
              )}

              {betterAuthConfigured && (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {mode === 'sign-up' && (
                    <div className="space-y-2">
                      <Label htmlFor="name">Display name</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                        maxLength={100}
                        required
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
                        minLength={8}
                        maxLength={128}
                        required
                      />
                    </div>
                  )}

                  <Button
                    feedbackState={emailFeedback.feedbackState}
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === 'sign-up'
                      ? 'Create account'
                      : mode === 'reset'
                        ? 'Send reset email'
                        : 'Sign in'}
                  </Button>
                </form>
              )}

              <div className="flex items-center justify-between text-sm">
                {mode === 'sign-in' && emailPasswordSignupEnabled ? (
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => setMode('sign-up')}
                    disabled={isSubmitting}
                  >
                    Create account
                  </button>
                ) : mode !== 'sign-in' ? (
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => setMode('sign-in')}
                    disabled={isSubmitting}
                  >
                    Back to sign in
                  </button>
                ) : <span />}

                {mode === 'sign-in' && betterAuthConfigured && (
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => setMode('reset')}
                    disabled={isSubmitting}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
