'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { error_boundary: 'global' },
      contexts: error.digest ? { nextjs: { digest: error.digest } } : undefined,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            alignItems: 'center',
            display: 'flex',
            fontFamily: 'system-ui, sans-serif',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <section>
            <h1>Something went wrong</h1>
            <p>We&apos;ve recorded the problem. Please try again.</p>
            <button onClick={retry} type="button">
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
