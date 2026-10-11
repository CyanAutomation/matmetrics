export type AuthRateLimitCategory = 'sign-in' | 'registration';

const SIGN_IN_ENDPOINT_SUFFIXES = [
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  '/sign-in/email',
  '/token',
] as const;

const REGISTRATION_ENDPOINT_SUFFIXES = [
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/sign-up/email',
  '/request-password-reset',
  '/reset-password',
  '/send-verification-email',
] as const;

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
  // Cloudflare sets this from the network peer. Requests proxied through
  // Vercel may share Vercel egress IPs, so Vercel Firewall must enforce the
  // per-client limit for browser-facing authentication paths.
  return request.headers.get('CF-Connecting-IP') || 'unknown-client-ip';
}

export async function applyRateLimit(
  request: Request,
  limiter: RateLimit
): Promise<Response | null> {
  try {
    const result = await limiter.limit({ key: requestIpKey(request) });
    if (result.success) return null;
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
