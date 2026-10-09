import { env } from 'cloudflare:workers';
import { verifyPasskeyRegistrationContext } from '../../../src/lib/passkey-registration-context';
import { isPasskeyRegistrationAllowed } from '../../../src/lib/passkey-policy';
import { auth } from './auth';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };
function registrationDisabledResponse(): Response {
  return Response.json(
    {
      code: 'PASSKEY_REGISTRATION_DISABLED',
      message: 'Passkey registration is disabled',
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}

function signInDisabledResponse(): Response {
  return Response.json(
    {
      code: 'PASSKEY_SIGN_IN_DISABLED',
      message: 'Passkey sign-in is disabled',
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}

function registrationPolicy() {
  return {
    enrolmentEnabled: env.MATMETRICS_PASSKEY_ENROLMENT_ENABLED === 'true',
    signupEnabled: env.MATMETRICS_PASSKEY_SIGNUP_ENABLED === 'true',
  };
}

function requestIpKey(request: Request): string {
  // Cloudflare sets this from the connection it receives. Direct Worker
  // requests get the caller IP; requests through Vercel may share Vercel egress
  // IPs, so Vercel Firewall must enforce per-browser limits on proxied paths.
  return request.headers.get('CF-Connecting-IP') || 'unknown-client-ip';
}

async function applyRateLimit(
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
        headers: { ...NO_STORE_HEADERS, 'Retry-After': '60' },
      }
    );
  } catch {
    return Response.json(
      {
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable',
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

async function checkRegistrationPolicy(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    !url.pathname.endsWith('/passkey/generate-register-options')
  ) {
    return null;
  }

  const context = url.searchParams.get('context');
  let path: 'firebase-enrolment' | 'authenticated-enrolment' | 'new-account';
  if (!context) {
    path = 'authenticated-enrolment';
  } else {
    try {
      const claims = await verifyPasskeyRegistrationContext(
        context,
        env.MATMETRICS_AUTH_CONTEXT_SECRET
      );
      path =
        claims.provider === 'firebase' ? 'firebase-enrolment' : 'new-account';
    } catch {
      return Response.json(
        {
          code: 'INVALID_REGISTRATION_CONTEXT',
          message: 'Passkey registration context is invalid or expired',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
  }

  return isPasskeyRegistrationAllowed(path, registrationPolicy())
    ? null
    : registrationDisabledResponse();
}

async function checkFinalPasskeyDeletion(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    request.method !== 'POST' ||
    !url.pathname.endsWith('/passkey/delete-passkey')
  ) {
    return null;
  }

  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return null;
  }
  const id =
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    typeof body.id === 'string'
      ? body.id
      : null;
  if (!id) return null;

  let session;
  let credential;
  let count;
  try {
    session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return null;
    credential = await env.DB.prepare('SELECT userId FROM passkey WHERE id = ?')
      .bind(id)
      .first<{ userId: string }>();
    if (credential?.userId !== session.user.id) return null;
    count = await env.DB.prepare(
      'SELECT count(*) AS count FROM passkey WHERE userId = ?'
    )
      .bind(session.user.id)
      .first<{ count: number }>();
  } catch {
    return Response.json(
      {
        code: 'PASSKEY_DELETE_UNAVAILABLE',
        message: 'Passkey deletion is temporarily unavailable',
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  if ((count?.count ?? 0) <= 1) return lastPasskeyResponse();
  return null;
}

function lastPasskeyResponse(): Response {
  return Response.json(
    {
      code: 'LAST_PASSKEY_REQUIRED',
      message: 'Keep at least one passkey on your account.',
    },
    { status: 409, headers: NO_STORE_HEADERS }
  );
}

export default {
  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/healthz') {
      return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    const passkeySignInRoute =
      pathname.endsWith('/passkey/generate-authenticate-options') ||
      pathname.endsWith('/passkey/verify-authentication') ||
      pathname.endsWith('/token');
    if (passkeySignInRoute) {
      if (env.MATMETRICS_PASSKEY_SIGNIN_ENABLED !== 'true') {
        return signInDisabledResponse();
      }
      const limited = await applyRateLimit(request, env.PASSKEY_SIGNIN_LIMITER);
      if (limited) return limited;
    }

    const passkeyRegistrationRoute =
      pathname.endsWith('/passkey/generate-register-options') ||
      pathname.endsWith('/passkey/verify-registration');
    if (passkeyRegistrationRoute) {
      const limited = await applyRateLimit(
        request,
        env.PASSKEY_REGISTRATION_LIMITER
      );
      if (limited) return limited;
    }

    const registrationPolicyResponse = await checkRegistrationPolicy(request);
    if (registrationPolicyResponse) return registrationPolicyResponse;

    const finalPasskeyResponse = await checkFinalPasskeyDeletion(request);
    if (finalPasskeyResponse) return finalPasskeyResponse;

    const response = await auth.handler(request);
    if (
      pathname.endsWith('/passkey/delete-passkey') &&
      response.status >= 500
    ) {
      const body = await response
        .clone()
        .text()
        .catch(() => '');
      if (body.includes('LAST_PASSKEY_REQUIRED')) return lastPasskeyResponse();
    }
    return response;
  },
} satisfies ExportedHandler<Cloudflare.Env>;
