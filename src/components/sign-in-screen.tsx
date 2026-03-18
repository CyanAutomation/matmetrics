'use client';

import React, { useState } from 'react';
import { BrainCircuit, Github, Loader2, LockKeyhole } from 'lucide-react';
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

type AuthMode = 'sign-in' | 'sign-up' | 'reset';

export function SignInScreen() {
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
        : 'Authentication is required before sessions, AI tools, and GitHub sync are available.';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

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
      toast({
        title: 'Password reset sent',
        description: 'Check your inbox for a Firebase password reset email.',
      });
      setMode('sign-in');
    } catch (error) {
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
    try {
      await signInWithGoogle();
    } catch (error) {
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
    try {
      await signInWithGitHub();
    } catch (error) {
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

  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Alert className="max-w-xl border-destructive/30 bg-destructive/5">
          <LockKeyhole className="h-4 w-4" />
          <AlertTitle>Firebase is not configured</AlertTitle>
          <AlertDescription>
            Add the `NEXT_PUBLIC_FIREBASE_*` variables and
            `FIREBASE_SERVICE_ACCOUNT_KEY` before using authentication.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.16),_transparent_40%),linear-gradient(135deg,_hsl(var(--background)),_hsl(var(--secondary)/0.35))] flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-2xl border-primary/15">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl">MatMetrics</CardTitle>
              <CardDescription>
                Firebase-backed accounts and preferences
              </CardDescription>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
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
            {mode !== 'reset' && (
              <button
                type="button"
                className="text-muted-foreground"
                onClick={() => setMode('reset')}
              >
                Forgot password?
              </button>
            )}
          </div>
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
      role="img"
    >
      <path
        fill="#4285F4"
        d="M21.805 12.23c0-.682-.061-1.338-.174-1.968H12v3.723h5.498a4.705 4.705 0 0 1-2.04 3.087v2.56h3.303c1.932-1.78 3.044-4.402 3.044-7.402Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.76 0 5.073-.915 6.764-2.468l-3.303-2.56c-.915.613-2.084.975-3.461.975-2.657 0-4.908-1.794-5.713-4.204H2.872v2.642A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.287 13.743A5.997 5.997 0 0 1 5.968 12c0-.605.109-1.192.319-1.743V7.615H2.872A10 10 0 0 0 2 12c0 1.611.386 3.137 1.072 4.385l3.215-2.642Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.053c1.5 0 2.848.516 3.909 1.528l2.931-2.93C17.069 2.999 14.756 2 12 2a10 10 0 0 0-9.128 5.615l3.415 2.642C7.092 7.847 9.343 6.053 12 6.053Z"
      />
    </svg>
  );
}
