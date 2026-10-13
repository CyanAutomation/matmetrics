'use client';

import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
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
      onSubmit={handleSubmit}
      onPasskeySignIn={handlePasskeySignIn}
      onResendVerification={() => void handleResendVerification()}
      onStartSignUp={() => setMode('sign-up')}
      onStartPasswordReset={() => setMode('reset')}
      onBackToSignIn={() => setMode('sign-in')}
    />
  );
}
