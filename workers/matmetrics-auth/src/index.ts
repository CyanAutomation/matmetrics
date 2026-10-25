import { env } from 'cloudflare:workers';
import { isPasskeyRegistrationAllowed } from '../../../src/lib/passkey-policy';
import { auth } from './auth';
import { hasAuthEmailConfiguration } from './email';
import {
  applyRateLimit,
  getAuthRateLimitCategory,
} from './rate-limit';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };
// Kept outside /api/auth/* so the browser-facing Next.js auth rewrite cannot
// expose the short-lived Keiko token response.
const KEIKO_TOKEN_PATH = '/__internal/keiko-token';
const KEIKO_SCOPES = new Set([
  'sessions:read',
  'sessions:write',
  'backups:read',
  'backups:write',
  'backups:restore',
  'github:read',
  'github:write',
]);
const EMAIL_AUTH_ENDPOINT_SUFFIXES = [
  '/sign-up/email',
  '/sign-in/email',
  '/request-password-reset',
  '/send-verification-email',
] as const;

async function verifiedMatmetricsBearerUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  const match = authorization && /^Bearer ([^\s]{1,16384})$/i.exec(authorization.trim());
  if (!match) return null;
  try {
    const verified = await auth.api.verifyJWT({ body: { token: match[1]! } });
    const payload = verified.payload;
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.appUserId !== 'string' ||
      payload.appUserId !== payload.sub
    ) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function emailDeliveryUnavailableResponse(): Response {
  return Response.json(
    {
      code: 'AUTH_EMAIL_DELIVERY_UNAVAILABLE',
      message: 'Email authentication is temporarily unavailable',
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}

function requiresEmailDelivery(method: string, pathname: string): boolean {
  return (
    method === 'POST' &&
    EMAIL_AUTH_ENDPOINT_SUFFIXES.some((suffix) => pathname.endsWith(suffix))
  );
}

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

async function issueKeikoToken(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
      { status: 405, headers: { ...NO_STORE_HEADERS, Allow: 'POST' } }
    );
  }

  if (
    request.headers.get('Origin') !== env.MATMETRICS_AUTH_FRONTEND_ORIGIN ||
    request.headers.get('Sec-Fetch-Site') !== 'same-origin'
  ) {
    return Response.json(
      { code: 'CSRF_REJECTED', message: 'Request origin is not allowed' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  const contentType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    return Response.json(
      { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Expected JSON' },
      { status: 415, headers: NO_STORE_HEADERS }
    );
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && !/^\d+$/.test(contentLength)) {
    return Response.json(
      { code: 'BAD_REQUEST', message: 'Invalid request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  const declaredLength = contentLength === null ? null : Number(contentLength);
  if (declaredLength !== null && !Number.isSafeInteger(declaredLength)) {
    return Response.json(
      { code: 'BAD_REQUEST', message: 'Invalid request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (declaredLength !== null && declaredLength > 4096) {
    return Response.json(
      { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 4 KiB limit' },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  let bytes: Uint8Array;
  try {
    if (!request.body) throw new Error('Missing request body');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel().catch(() => {});
        return Response.json(
          { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 4 KiB limit' },
          { status: 413, headers: NO_STORE_HEADERS }
        );
      }
      chunks.push(value);
    }
    bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } catch {
    return Response.json(
      { code: 'BAD_REQUEST', message: 'Invalid request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return Response.json(
      { code: 'BAD_REQUEST', message: 'Invalid request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !('expectedUserId' in body) ||
    typeof body.expectedUserId !== 'string' ||
    !body.expectedUserId.trim() ||
    body.expectedUserId.length > 255 ||
    !('scopes' in body) ||
    !Array.isArray(body.scopes) ||
    body.scopes.length < 1 ||
    body.scopes.length > KEIKO_SCOPES.size ||
    body.scopes.some(
      (scope: unknown) => typeof scope !== 'string' || !KEIKO_SCOPES.has(scope)
    ) ||
    new Set(body.scopes).size !== body.scopes.length ||
    Object.keys(body).some((key) => !['expectedUserId', 'scopes'].includes(key))
  ) {
    return Response.json(
      { code: 'BAD_REQUEST', message: 'Invalid request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const bearerUserId = await verifiedMatmetricsBearerUserId(request);
  if (!bearerUserId) {
    return Response.json(
      { code: 'AUTHENTICATION_REQUIRED', message: 'A valid MatMetrics bearer token is required' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (body.expectedUserId !== bearerUserId) {
    return Response.json(
      { code: 'USER_MISMATCH', message: 'Bearer user does not match the requested user' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  let session;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {
    return Response.json(
      { code: 'SESSION_UNAVAILABLE', message: 'Session validation is unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
  if (!session?.user?.id) {
    return Response.json(
      { code: 'AUTHENTICATION_REQUIRED', message: 'A valid session is required' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (session.user.id !== body.expectedUserId) {
    return Response.json(
      { code: 'USER_MISMATCH', message: 'Authenticated user does not match the session' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 300;
  try {
    const result = await auth.api.signJWT({
      body: {
        payload: {
          sub: session.user.id,
          appUserId: session.user.id,
          scope: body.scopes.join(' '),
          iat: now,
          exp: expiresAt,
        },
        overrideOptions: {
          jwt: {
            issuer: env.MATMETRICS_AUTH_ISSUER,
            audience: 'keiko-dojo-api',
            expirationTime: '5m',
          },
        },
      },
    });
    return Response.json(
      { token: result.token, expiresAt, scopes: body.scopes },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    console.error('keiko_token_issuance_failed');
    return Response.json(
      { code: 'TOKEN_ISSUANCE_UNAVAILABLE', message: 'Token issuance is unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
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

    if (pathname === KEIKO_TOKEN_PATH) {
      return issueKeikoToken(request);
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

    if (
      requiresEmailDelivery(request.method, pathname) &&
      !hasAuthEmailConfiguration()
    ) {
      return emailDeliveryUnavailableResponse();
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
