'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { error_boundary: 'app' },
      contexts: error.digest ? { nextjs: { digest: error.digest } } : undefined,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground">
          We&apos;ve recorded the problem. Please try again.
        </p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={retry}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
