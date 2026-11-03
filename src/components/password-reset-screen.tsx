'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { MatMetricsLogo } from '@/components/matmetrics-logo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { VanillaTextField } from '@/components/vanilla-text-field';
import { useAuth } from '@/components/auth-provider';
import { getAuthErrorMessage } from '@/lib/auth-error-message';

type PasswordResetScreenProps = {
  token: string | null;
  hasError: boolean;
};

export function PasswordResetScreen({
  token,
  hasError,
}: PasswordResetScreenProps) {
  const { betterAuthConfigured, resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || password !== confirmation) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await resetPassword(token, password);
      setIsComplete(true);
    } catch (error) {
      setErrorMessage(
        getAuthErrorMessage(
          error,
          'This password link may have expired. Request a new one and try again.'
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const invalidLink = !token || hasError;

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <MatMetricsLogo size="lg" variant="solid" />
          <h1 className="text-xl font-bold tracking-tight">MatMetrics</h1>
        </div>

        <h2 className="text-lg font-semibold mb-1">Set a new password</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Choose a password to use alongside your passkey.
        </p>

        {!betterAuthConfigured ? (
          <Alert className="mb-4 ui-alert-warning">
            <AlertTitle>Password reset is unavailable</AlertTitle>
            <AlertDescription>
              Authentication is not configured in this deployment.
            </AlertDescription>
          </Alert>
        ) : isComplete ? (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>Password updated</AlertTitle>
              <AlertDescription>
                Your password is ready. Sign in with it or use your passkey.
              </AlertDescription>
            </Alert>
            <Button asChild className="w-full">
              <Link href="/">Return to MatMetrics</Link>
            </Button>
          </div>
        ) : invalidLink ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTitle>This password link is invalid or expired</AlertTitle>
              <AlertDescription>
                Request a new password link from the sign-in screen.
              </AlertDescription>
            </Alert>
            <Button asChild className="w-full">
              <Link href="/">Return to sign in</Link>
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {errorMessage ? (
              <Alert variant="destructive">
                <AlertTitle>Could not reset your password</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}
            <VanillaTextField
              id="new-password"
              label="New password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              onInput={setPassword}
            />
            <VanillaTextField
              id="confirm-password"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={confirmation}
              onInput={setConfirmation}
              invalid={confirmation.length > 0 && password !== confirmation}
              hint={confirmation.length > 0 && password !== confirmation
                ? 'Passwords do not match.'
                : 'Use at least 8 characters.'}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || password !== confirmation}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
