import { env } from 'cloudflare:workers';
import { isPasskeyRegistrationAllowed } from '../../../src/lib/passkey-policy';
import { auth } from './auth';
import {
  applyRateLimit,
  getAuthRateLimitCategory,
} from './rate-limit';

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
      code: 'AUTH_SIGN_IN_DISABLED',
      message: 'Sign-in is temporarily unavailable',
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}

function registrationPolicy() {
  return {
    enrolmentEnabled: env.MATMETRICS_PASSKEY_ENROLMENT_ENABLED === 'true',
  };
}

async function checkRegistrationPolicy(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);
  const isRegistrationOptions =
    request.method === 'GET' &&
    url.pathname.endsWith('/passkey/generate-register-options');
  const isRegistrationVerification =
    request.method === 'POST' &&
    url.pathname.endsWith('/passkey/verify-registration');
  if (!isRegistrationOptions && !isRegistrationVerification) {
    return null;
  }

  return isPasskeyRegistrationAllowed(registrationPolicy())
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

    const rateLimitCategory = getAuthRateLimitCategory(pathname);
    if (rateLimitCategory === 'sign-in') {
      if (env.MATMETRICS_AUTH_SIGNIN_ENABLED !== 'true') {
        return signInDisabledResponse();
      }
      const limited = await applyRateLimit(request, env.AUTH_SIGNIN_LIMITER);
      if (limited) return limited;
    }

    if (rateLimitCategory === 'registration') {
      const limited = await applyRateLimit(
        request,
        env.AUTH_REGISTRATION_LIMITER
      );
      if (limited) return limited;
    }

    if (
      request.method === 'POST' &&
      pathname.endsWith('/sign-up/email') &&
      env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED !== 'true'
    ) {
      return Response.json(
        {
          code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
          message: 'Email account creation is currently disabled',
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
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
