export type AuthRateLimitCategory = 'sign-in' | 'registration';

const SIGN_IN_ENDPOINT_SUFFIXES = [
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  '/sign-in/email',
  '/token',
  '/keiko-token',
  '/__internal/keiko-token',
] as const;

const REGISTRATION_ENDPOINT_SUFFIXES = [
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/sign-up/email',
  '/request-password-reset',
  '/reset-password',
  '/send-verification-email',
] as const;
const EMAIL_SIGN_IN_SUFFIX = '/sign-in/email';
const MAX_SIGN_IN_BODY_BYTES = 4096;

export function getAuthRateLimitCategory(
  pathname: string
): AuthRateLimitCategory | null {
  if (SIGN_IN_ENDPOINT_SUFFIXES.some((suffix) => pathname.endsWith(suffix))) {
    return 'sign-in';
  }
  if (
    REGISTRATION_ENDPOINT_SUFFIXES.some((suffix) => pathname.endsWith(suffix))
  ) {
    return 'registration';
  }
  return null;
}

function requestIpKey(request: Request): string {
  // Cloudflare sets this from the network peer. Do not substitute forwarded
  // client-IP headers at the public Worker boundary.
  return request.headers.get('CF-Connecting-IP') || 'unknown-client-ip';
}

async function accountKey(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !url.pathname.endsWith(EMAIL_SIGN_IN_SUFFIX)) {
    return null;
  }

  try {
    const body = request.clone().body;
    if (!body) return null;
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SIGN_IN_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    );
    if (
      !value ||
      typeof value !== 'object' ||
      !('email' in value) ||
      typeof value.email !== 'string'
    ) {
      return null;
    }
    const email = value.email.trim().toLowerCase();
    if (!email || email.length > 320) return null;
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(email)
    );
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    return `account:${hex}`;
  } catch {
    return null;
  }
}

export async function applyRateLimit(
  request: Request,
  limiter: RateLimit
): Promise<Response | null> {
  try {
    const keys = [requestIpKey(request)];
    const emailKey = await accountKey(request);
    if (emailKey) keys.push(emailKey);
    for (const key of keys) {
      const result = await limiter.limit({ key });
      if (!result.success) {
        return Response.json(
          {
            code: 'RATE_LIMITED',
            message: 'Too many authentication attempts. Try again shortly.',
          },
          {
            status: 429,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': '60',
            },
          }
        );
      }
    }
    return null;
  } catch {
    return Response.json(
      {
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
