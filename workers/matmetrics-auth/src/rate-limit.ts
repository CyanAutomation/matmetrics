export type PasskeyRateLimitCategory = 'sign-in' | 'registration';

const SIGN_IN_ENDPOINT_SUFFIXES = [
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  '/token',
] as const;

const REGISTRATION_ENDPOINT_SUFFIXES = [
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
] as const;

export function getPasskeyRateLimitCategory(
  pathname: string
): PasskeyRateLimitCategory | null {
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
  // per-client limit for the browser-facing paths.
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
