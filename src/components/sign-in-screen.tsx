'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { getAuthErrorMessage } from '@/lib/auth-error-message';
import { SignInScreenView, type AuthMode } from './sign-in-screen-view';

type SignInScreenProps = {
  onContinueAsGuest?: () => void;
  onAuthenticated?: () => void;
};

export function SignInScreen({
  onContinueAsGuest,
  onAuthenticated,
}: SignInScreenProps) {
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
  const [authError, setAuthError] = useState<string | null>(null);
  const emailFeedback = useActionFeedback();
  const passkeyFeedback = useActionFeedback();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
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
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setAuthError(null);
    setIsSubmitting(true);
    passkeyFeedback.startLoading();
    try {
      await signInWithPasskey();
      onAuthenticated?.();
    } catch (error) {
      passkeyFeedback.showError();
      setAuthError(
        getAuthErrorMessage(
          error,
          'Could not sign in with a passkey. Please try again.'
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await sendEmailVerification(email);
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SignInScreenView
      mode={mode}
      isConfigured={isConfigured}
      betterAuthConfigured={betterAuthConfigured}
      emailPasswordSignupEnabled={emailPasswordSignupEnabled}
      onContinueAsGuest={onContinueAsGuest}
      isSubmitting={isSubmitting}
      name={name}
      email={email}
      password={password}
      setName={setName}
      setEmail={setEmail}
      setPassword={setPassword}
      emailFeedbackState={emailFeedback.feedbackState}
      passkeyFeedbackState={passkeyFeedback.feedbackState}
      authError={authError}
      onSubmit={handleSubmit}
      onPasskeySignIn={handlePasskeySignIn}
      onResendVerification={() => void handleResendVerification()}
      onStartSignUp={() => setMode('sign-up')}
      onStartPasswordReset={() => setMode('reset')}
      onBackToSignIn={() => setMode('sign-in')}
    />
  );
}
