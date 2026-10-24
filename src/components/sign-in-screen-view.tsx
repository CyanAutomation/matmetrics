'use client';

import React from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { MatMetricsLogo } from '@/components/matmetrics-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { FeedbackState } from '@/lib/interaction';

export type AuthMode = 'sign-in' | 'sign-up' | 'reset' | 'verification-sent';

type SignInScreenViewProps = {
  mode: AuthMode;
  isConfigured: boolean;
  betterAuthConfigured: boolean;
  emailPasswordSignupEnabled: boolean;
  onContinueAsGuest?: () => void;
  isSubmitting: boolean;
  name: string;
  email: string;
  password: string;
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  emailFeedbackState: FeedbackState;
  passkeyFeedbackState: FeedbackState;
  onSubmit: (event: React.FormEvent) => void;
  onPasskeySignIn: () => void;
  onResendVerification: () => void;
  onStartSignUp: () => void;
  onStartPasswordReset: () => void;
  onBackToSignIn: () => void;
};

function getAuthModeTitle(mode: AuthMode): string {
  switch (mode) {
    case 'sign-up':
      return 'Create your account';
    case 'reset':
      return 'Reset your password';
    case 'verification-sent':
      return 'Check your email';
    default:
      return 'Sign in';
  }
}

function SignInScreenHeading({
  mode,
  isConfigured,
}: Pick<SignInScreenViewProps, 'mode' | 'isConfigured'>) {
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <MatMetricsLogo size="lg" variant="solid" />
        <h1 className="text-xl font-bold tracking-tight">MatMetrics</h1>
      </div>
      <h2 className="text-lg font-semibold mb-1">{getAuthModeTitle(mode)}</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {mode === 'verification-sent'
          ? 'If this address can be used for the requested action, we sent an email with the next step.'
          : isConfigured
            ? 'Sign in to sync sessions, unlock AI tools, and back up your training data.'
            : 'Authentication is not configured. Explore the app in guest mode.'}
      </p>
    </>
  );
}

function AuthenticationUnavailableNotice() {
  return (
    <Alert className="mb-6 ui-alert-warning">
      <AlertTitle>Authentication is not configured</AlertTitle>
      <AlertDescription>
        Configure Better Auth to enable sign-in. You can still explore the app
        in guest mode.
      </AlertDescription>
    </Alert>
  );
}

function VerificationSentState({
  email,
  emailPasswordSignupEnabled,
  isSubmitting,
  onResendVerification,
  onBackToSignIn,
}: Pick<
  SignInScreenViewProps,
  | 'email'
  | 'emailPasswordSignupEnabled'
  | 'isSubmitting'
  | 'onResendVerification'
  | 'onBackToSignIn'
>) {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>
          We sent the next step to <strong>{email}</strong>, if an account
          action is available for that address.
        </AlertDescription>
      </Alert>
      {emailPasswordSignupEnabled && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onResendVerification}
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Resend verification email
        </Button>
      )}
      <Button
        type="button"
        variant="link"
        size="text"
        className="w-full justify-start text-sm"
        onClick={onBackToSignIn}
      >
        Back to sign in
      </Button>
    </div>
  );
}

function PasskeySignInButton({
  isSubmitting,
  feedbackState,
  onPasskeySignIn,
}: {
  isSubmitting: boolean;
  feedbackState: FeedbackState;
  onPasskeySignIn: () => void;
}) {
  return (
    <Button
      type="button"
      className="w-full"
      feedbackState={feedbackState}
      onClick={onPasskeySignIn}
      disabled={isSubmitting}
    >
      {isSubmitting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Fingerprint className="h-4 w-4" />
      )}
      Use a passkey
    </Button>
  );
}

function EmailAuthenticationForm({
  mode,
  isSubmitting,
  name,
  email,
  password,
  setName,
  setEmail,
  setPassword,
  feedbackState,
  onSubmit,
}: Pick<
  SignInScreenViewProps,
  | 'mode'
  | 'isSubmitting'
  | 'name'
  | 'email'
  | 'password'
  | 'setName'
  | 'setEmail'
  | 'setPassword'
  | 'onSubmit'
> & { feedbackState: FeedbackState }) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
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
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={128}
            required
          />
        </div>
      )}
      <Button
        feedbackState={feedbackState}
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
  );
}

function AuthModeNavigation({
  mode,
  emailPasswordSignupEnabled,
  betterAuthConfigured,
  isSubmitting,
  onStartSignUp,
  onStartPasswordReset,
  onBackToSignIn,
}: Pick<
  SignInScreenViewProps,
  | 'mode'
  | 'emailPasswordSignupEnabled'
  | 'betterAuthConfigured'
  | 'isSubmitting'
  | 'onStartSignUp'
  | 'onStartPasswordReset'
  | 'onBackToSignIn'
>) {
  return (
    <div className="flex items-center justify-between text-sm">
      {mode === 'sign-in' && emailPasswordSignupEnabled ? (
        <Button
          type="button"
          variant="link"
          size="text"
          className="text-primary"
          onClick={onStartSignUp}
          disabled={isSubmitting}
        >
          Create account
        </Button>
      ) : mode !== 'sign-in' ? (
        <Button
          type="button"
          variant="link"
          size="text"
          className="text-primary"
          onClick={onBackToSignIn}
          disabled={isSubmitting}
        >
          Back to sign in
        </Button>
      ) : (
        <span />
      )}
      {mode === 'sign-in' && betterAuthConfigured && (
        <Button
          type="button"
          variant="link"
          size="text"
          className="text-primary"
          onClick={onStartPasswordReset}
          disabled={isSubmitting}
        >
          Forgot password?
        </Button>
      )}
    </div>
  );
}

function EmailAuthDivider() {
  return (
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
  );
}

function SignInMethods({
  props,
}: {
  props: SignInScreenViewProps;
}) {
  const {
    mode,
    betterAuthConfigured,
    emailPasswordSignupEnabled,
    onContinueAsGuest,
    isSubmitting,
    name,
    email,
    password,
    setName,
    setEmail,
    setPassword,
    emailFeedbackState,
    passkeyFeedbackState,
    onSubmit,
    onPasskeySignIn,
    onStartSignUp,
    onStartPasswordReset,
    onBackToSignIn,
  } = props;

  return (
    <>
      {betterAuthConfigured && mode === 'sign-in' && (
        <PasskeySignInButton
          isSubmitting={isSubmitting}
          feedbackState={passkeyFeedbackState}
          onPasskeySignIn={onPasskeySignIn}
        />
      )}
      {mode === 'sign-in' && onContinueAsGuest && <EmailAuthDivider />}
      {betterAuthConfigured && (
        <EmailAuthenticationForm
          mode={mode}
          isSubmitting={isSubmitting}
          name={name}
          email={email}
          password={password}
          setName={setName}
          setEmail={setEmail}
          setPassword={setPassword}
          feedbackState={emailFeedbackState}
          onSubmit={onSubmit}
        />
      )}
      <AuthModeNavigation
        mode={mode}
        emailPasswordSignupEnabled={emailPasswordSignupEnabled}
        betterAuthConfigured={betterAuthConfigured}
        isSubmitting={isSubmitting}
        onStartSignUp={onStartSignUp}
        onStartPasswordReset={onStartPasswordReset}
        onBackToSignIn={onBackToSignIn}
      />
    </>
  );
}

export function SignInScreenView(props: SignInScreenViewProps) {
  const {
    mode,
    isConfigured,
    emailPasswordSignupEnabled,
    onContinueAsGuest,
    isSubmitting,
    email,
    onResendVerification,
    onBackToSignIn,
  } = props;

  return (
    <div className="w-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <SignInScreenHeading mode={mode} isConfigured={isConfigured} />
        {!isConfigured && <AuthenticationUnavailableNotice />}
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
            <VerificationSentState
              email={email}
              emailPasswordSignupEnabled={emailPasswordSignupEnabled}
              isSubmitting={isSubmitting}
              onResendVerification={onResendVerification}
              onBackToSignIn={onBackToSignIn}
            />
          ) : (
            <SignInMethods props={props} />
          )}
        </div>
      </div>
    </div>
  );
}
