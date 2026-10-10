import { describe, expect, it } from 'vitest';
import {
  applyRateLimit,
  getPasskeyRateLimitCategory,
} from '../src/rate-limit';

describe('passkey rate limit policy', () => {
  it.each([
    ['/api/auth/passkey/generate-authenticate-options', 'sign-in'],
    ['/api/auth/passkey/verify-authentication', 'sign-in'],
    ['/api/auth/token', 'sign-in'],
    ['/api/auth/passkey/generate-register-options', 'registration'],
    ['/api/auth/passkey/verify-registration', 'registration'],
    ['/api/auth/jwks', null],
    ['/api/auth/passkey/list-user-passkeys', null],
  ] as const)('classifies %s as %s', (pathname, expected) => {
    expect(getPasskeyRateLimitCategory(pathname)).toBe(expected);
  });

  it('uses Cloudflare connection IP and returns a no-store 429 when limited', async () => {
    const keys: string[] = [];
    const limiter = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: false };
      },
    } as unknown as RateLimit;
    const request = new Request('https://auth.example.test/api/auth/token', {
      headers: {
        'CF-Connecting-IP': '203.0.113.7',
        'X-Forwarded-For': '198.51.100.9',
      },
    });

    const response = await applyRateLimit(request, limiter);

    expect(keys).toEqual(['203.0.113.7']);
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Retry-After')).toBe('60');
    await expect(response?.json()).resolves.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('fails closed with a safe 503 if the rate limit binding fails', async () => {
    const limiter = {
      limit: async () => {
        throw new Error('simulated rate limit binding failure');
      },
    } as unknown as RateLimit;

    const response = await applyRateLimit(
      new Request('https://auth.example.test/api/auth/token'),
      limiter
    );

    expect(response?.status).toBe(503);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    await expect(response?.json()).resolves.toMatchObject({
      code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
    });
  });
});
