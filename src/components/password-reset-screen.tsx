'use client';

import { useEffect, useRef, useState } from 'react';
import { MatMetricsLogo } from '@/components/matmetrics-logo';
import { useAuth } from '@/components/auth-provider';
import { getAuthErrorMessage } from '@/lib/auth-error-message';
import { mountPasswordReset, passwordResetHtml, type PasswordResetProps } from '@/vanilla/password-reset';

export function PasswordResetScreen({ token, hasError }: { token: string | null; hasError: boolean }) {
  const { betterAuthConfigured, resetPassword } = useAuth();
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountPasswordReset> | null>(null);
  const props: PasswordResetProps = {
    token,
    hasError,
    configured: betterAuthConfigured,
    resetPassword,
    errorMessage: error => getAuthErrorMessage(error, 'This password link may have expired. Request a new one and try again.'),
  };
  const [markup] = useState(() => ({ __html: passwordResetHtml(props) }));

  useEffect(() => {
    if (!host.current) return;
    const instance = mountPasswordReset(host.current, props);
    controller.current = instance;
    return () => { instance.destroy(); controller.current = null; };
    // The controller belongs to this host; later props are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { controller.current?.update(props); });

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <MatMetricsLogo size="lg" variant="solid" />
          <h1 className="text-xl font-bold tracking-tight">MatMetrics</h1>
        </div>
        <h2 className="text-lg font-semibold mb-1">Set a new password</h2>
        <p className="text-sm text-muted-foreground mb-6">Choose a password to use alongside your passkey.</p>
        <div ref={host} dangerouslySetInnerHTML={markup} />
      </div>
    </main>
  );
}
