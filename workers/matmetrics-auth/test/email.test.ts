import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { deliverAuthEmail, isSafeAuthEmailUrl } from '../src/email';

describe('auth email delivery', () => {
  it('only accepts links on the configured auth origin', () => {
    const allowed = new URL(
      '/api/auth/verify-email?token=test',
      env.MATMETRICS_AUTH_PUBLIC_URL
    );
    const nestedRedirect = new URL(
      '/api/auth/verify-email?token=test&callbackURL=' +
        encodeURIComponent('https://attacker.example/steal'),
      env.MATMETRICS_AUTH_PUBLIC_URL
    );

    expect(isSafeAuthEmailUrl(allowed.toString())).toBe(true);
    expect(
      isSafeAuthEmailUrl('https://attacker.example/api/auth/verify-email?token=test')
    ).toBe(false);
    expect(isSafeAuthEmailUrl(nestedRedirect.toString())).toBe(false);
    expect(isSafeAuthEmailUrl('not a URL')).toBe(false);
  });

  it('retries transient Resend failures with the same idempotency key', async () => {
    const previousApiKey = env.RESEND_API_KEY;
    const previousSender = env.MATMETRICS_AUTH_EMAIL_FROM;
    const previousFetch = globalThis.fetch;
    const attempts: Array<{ url: string; idempotencyKey: string | null }> = [];

    env.RESEND_API_KEY = 're_test_email_retry';
    env.MATMETRICS_AUTH_EMAIL_FROM = 'MatMetrics <auth@example.test>';
    vi.stubGlobal(
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : input.toString();
        attempts.push({
          url,
          idempotencyKey: new Headers(init?.headers).get('Idempotency-Key'),
        });
        if (attempts.length === 1) {
          return new Response(
            JSON.stringify({
              name: 'application_error',
              statusCode: 503,
              message: 'temporary test failure',
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
        return Response.json({ id: 'test-email-id' });
      }
    );

    try {
      await deliverAuthEmail(
        'verification',
        'person@example.test',
        new URL(
          '/api/auth/verify-email?token=test',
          env.MATMETRICS_AUTH_PUBLIC_URL
        ).toString(),
        'test-token'
      );

      expect(attempts).toHaveLength(2);
      expect(attempts[0].url).toBe('https://api.resend.com/emails');
      expect(attempts[1].url).toBe(attempts[0].url);
      expect(attempts[0].idempotencyKey).toBeTruthy();
      expect(attempts[1].idempotencyKey).toBe(attempts[0].idempotencyKey);
    } finally {
      env.RESEND_API_KEY = previousApiKey;
      env.MATMETRICS_AUTH_EMAIL_FROM = previousSender;
      vi.stubGlobal('fetch', previousFetch);
    }
  });
});
