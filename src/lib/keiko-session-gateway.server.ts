import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import type { AuthenticatedPrincipal } from './server-auth-types';

const KEIKO_AUDIENCE = 'keiko-dojo-api';
const SESSION_COOKIE_NAMES = [
  '__Secure-better-auth.session_token',
  'better-auth.session_token',
] as const;
const ALLOWED_SCOPES = new Set([
  'sessions:read',
  'sessions:write',
  'backups:read',
  'backups:write',
  'backups:restore',
  'github:read',
  'github:write',
]);

export type KeikoOperation = {
  path: string;
  query?: URLSearchParams;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  scope: string | string[];
  body?: unknown;
  ifMatch?: string;
};

class GatewayError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

let cachedJwksUrl = '';
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function fail(status: number, message: string): never {
  throw new GatewayError(status, message);
}

function exactOrigin(): string {
  const configured = process.env.MATMETRICS_AUTH_FRONTEND_ORIGIN?.trim();
  if (!configured) fail(503, 'Session authentication is unavailable');
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    fail(503, 'Session authentication is unavailable');
  }
  if (
    url.origin !== configured ||
    (url.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost' && url.protocol === 'http:'))
  ) {
    fail(503, 'Session authentication is unavailable');
  }
  return configured;
}

function validatedBaseUrl(name: string, allowedWorker: boolean): URL {
  const value = process.env[name]?.trim();
  if (!value) fail(503, 'Session service is unavailable');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(503, 'Session service is unavailable');
  }
  const localHttp =
    process.env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  const expectedWorkerHost = process.env.CLOUDFLARE_AUTH_WORKER_HOST?.trim().toLowerCase();
  const validExpectedWorkerHost = Boolean(
    expectedWorkerHost &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+workers\.dev$/.test(expectedWorkerHost)
  );
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '') ||
    (allowedWorker && !localHttp && (
      !validExpectedWorkerHost ||
      url.hostname !== expectedWorkerHost ||
      url.port !== ''
    ))
  ) {
    fail(503, 'Session service is unavailable');
  }
  return url;
}

function sessionCookieHeader(request: NextRequest): string {
  const raw = request.headers.get('cookie');
  if (!raw || raw.length > 4096 || raw.includes(',')) {
    fail(401, 'A valid session is required');
  }
  const matches: string[] = [];
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    if (!(SESSION_COOKIE_NAMES as readonly string[]).includes(name)) continue;
    const value = trimmed.slice(separator + 1).trim();
    if (!value || value.length > 2048 || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z%]+$/.test(value)) {
      fail(401, 'A valid session is required');
    }
    matches.push(`${name}=${value}`);
  }
  if (matches.length !== 1) fail(401, 'A valid session is required');
  return matches[0]!;
}

function verifiedMatmetricsBearerHeader(request: NextRequest): string {
  const authorization = request.headers.get('authorization');
  const match = authorization && /^Bearer ([^\s]{1,16384})$/i.exec(authorization.trim());
  if (!match) fail(401, 'Authentication required');
  return `Bearer ${match[1]}`;
}

function requestedScopes(scope: KeikoOperation['scope']): string[] {
  const scopes = Array.isArray(scope) ? scope : [scope];
  if (
    !scopes.length ||
    scopes.length > 5 ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((item) => !ALLOWED_SCOPES.has(item))
  ) {
    fail(500, 'Invalid Keiko operation');
  }
  return [...scopes].sort();
}

function assertSafePath(path: string): void {
  if (!/^\/v1\/(?:sessions(?:\/[A-Za-z0-9_-]{1,100})?|analytics\/summary|backups(?:\/[A-Za-z0-9_-]{1,100}|\/github-installation)?|github\/(?:health|sync-all|log-doctor(?:\/fix)?|jobs\/[A-Za-z0-9_-]{1,100}))$/.test(path)) {
    fail(500, 'Invalid Keiko operation');
  }
}

function safeQuery(query: URLSearchParams | undefined): URLSearchParams {
  const result = new URLSearchParams();
  if (!query) return result;
  const allowed = new Set(['from', 'to', 'category', 'effort', 'limit', 'cursor']);
  for (const [key, value] of query.entries()) {
    if (!allowed.has(key) || value.length > 512 || result.has(key)) {
      fail(500, 'Invalid Keiko operation');
    }
    result.set(key, value);
  }
  return result;
}

function getJwks(url: string) {
  if (cachedJwks && cachedJwksUrl === url) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(url), { timeoutDuration: 5000 });
  cachedJwksUrl = url;
  return cachedJwks;
}

function validateIssuedTokenPayload(
  payload: JWTPayload,
  userId: string,
  expectedScopes: string[]
): void {
  const scopes = typeof payload.scope === 'string'
    ? payload.scope.split(/\s+/).filter(Boolean).sort()
    : Array.isArray(payload.scope)
      ? payload.scope.filter((value): value is string => typeof value === 'string').sort()
      : [];
  if (
    payload.sub !== userId ||
    payload.appUserId !== userId ||
    !Array.isArray(payload.aud) && payload.aud !== KEIKO_AUDIENCE ||
    Array.isArray(payload.aud) && (payload.aud.length !== 1 || payload.aud[0] !== KEIKO_AUDIENCE) ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number' ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > 300 ||
    payload.iat > Math.floor(Date.now() / 1000) + 30 ||
    scopes.length !== expectedScopes.length ||
    scopes.some((scope, index) => scope !== expectedScopes[index])
  ) {
    fail(502, 'Session token validation failed');
  }
}

async function issueKeikoToken(
  request: NextRequest,
  user: AuthenticatedPrincipal,
  scopes: string[]
): Promise<string> {
  const origin = exactOrigin();
  const requestOrigin = request.headers.get('origin');
  const isSameOriginGetWithoutOrigin =
    request.method === 'GET' && requestOrigin === null;
  if (
    (requestOrigin !== origin && !isSameOriginGetWithoutOrigin) ||
    request.headers.get('sec-fetch-site') !== 'same-origin' ||
    request.nextUrl.origin !== origin
  ) {
    fail(403, 'Request origin could not be verified');
  }
  const authorization = verifiedMatmetricsBearerHeader(request);
  const cookie = sessionCookieHeader(request);
  const workerUrl = validatedBaseUrl('CLOUDFLARE_AUTH_WORKER_URL', true);
  const endpoint = new URL('/__internal/keiko-token', workerUrl);
  const timeout = AbortSignal.timeout(5000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization,
        cookie,
        origin,
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ expectedUserId: user.appUserId, scopes }),
      redirect: 'error',
      cache: 'no-store',
      signal: timeout,
    });
  } catch {
    fail(503, 'Session authentication is unavailable');
  }
  if (!response.ok) fail(response.status === 401 || response.status === 403 ? response.status : 503, 'Session authentication failed');
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    fail(502, 'Session token validation failed');
  }
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    !('token' in envelope) ||
    typeof envelope.token !== 'string' ||
    envelope.token.length > 8192 ||
    !('scopes' in envelope) ||
    !Array.isArray(envelope.scopes) ||
    envelope.scopes.length !== scopes.length ||
    envelope.scopes.some((item, index) => item !== scopes[index])
  ) {
    fail(502, 'Session token validation failed');
  }

  const issuer = process.env.MATMETRICS_AUTH_ISSUER?.trim();
  const jwksUrl = process.env.MATMETRICS_AUTH_JWKS_URL?.trim();
  if (!issuer || !jwksUrl) fail(503, 'Session authentication is unavailable');
  try {
    const { payload } = await jwtVerify(envelope.token, getJwks(jwksUrl), {
      algorithms: ['EdDSA'],
      issuer,
      audience: KEIKO_AUDIENCE,
      maxTokenAge: '5m',
      clockTolerance: 5,
    });
    validateIssuedTokenPayload(payload, user.appUserId, scopes);
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    fail(502, 'Session token validation failed');
  }
  return envelope.token;
}

export async function forwardSessionRequestToKeiko(
  request: NextRequest,
  user: AuthenticatedPrincipal,
  operation: KeikoOperation
): Promise<NextResponse> {
  try {
    assertSafePath(operation.path);
    const scopes = requestedScopes(operation.scope);
    const query = safeQuery(operation.query);
    const token = await issueKeikoToken(request, user, scopes);
    const keikoUrl = validatedBaseUrl('KEIKO_API_BASE_URL', false);
    const target = new URL(operation.path, keikoUrl);
    target.search = query.toString();
    if (target.origin !== keikoUrl.origin) fail(503, 'Session service is unavailable');
    const headers = new Headers({
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    });
    if (operation.body !== undefined) headers.set('content-type', 'application/json');
    if (operation.ifMatch) headers.set('if-match', operation.ifMatch);
    let response: Response;
    try {
      response = await fetch(target, {
        method: operation.method,
        headers,
        ...(operation.body === undefined ? {} : { body: JSON.stringify(operation.body) }),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      fail(503, 'Session service is unavailable');
    }
    const body = await response.text();
    if (body.includes(token)) {
      fail(502, 'Session service returned an invalid response');
    }
    const bodylessStatus = [204, 205, 304].includes(response.status);
    const safeHeaders = new Headers({ 'cache-control': 'no-store' });
    const contentType = response.headers.get('content-type');
    if (!bodylessStatus && contentType) safeHeaders.set('content-type', contentType);
    const etag = response.headers.get('etag');
    const revisionEtag = etag?.match(/^(?:W\/)?"([1-9][0-9]{0,8})"$/);
    if (revisionEtag) safeHeaders.set('etag', `"${revisionEtag[1]}"`);
    return new NextResponse(bodylessStatus ? null : body, {
      status: response.status,
      headers: safeHeaders,
    });
  } catch (error) {
    if (error instanceof GatewayError) {
      return NextResponse.json({ error: error.message }, {
        status: error.status,
        headers: { 'cache-control': 'no-store' },
      });
    }
    console.error('keiko_session_gateway_failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ error: 'Session service is unavailable' }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

export async function keikoSessionRecordResponse(
  response: NextResponse
): Promise<NextResponse> {
  if (!response.ok) return response;
  try {
    const value: unknown = await response.json();
    if (
      !value || typeof value !== 'object' || !('data' in value) ||
      !value.data || typeof value.data !== 'object' || !('session' in value.data)
    ) {
      return NextResponse.json({ error: 'Session service returned an invalid response' }, {
        status: 502,
        headers: { 'cache-control': 'no-store' },
      });
    }
    const etag = response.headers.get('etag');
    return NextResponse.json(value.data.session, {
      status: response.status,
      headers: {
        'cache-control': 'no-store',
        ...(etag ? { etag } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Session service returned an invalid response' }, {
      status: 502,
      headers: { 'cache-control': 'no-store' },
    });
  }
}

export async function listAllKeikoSessions(
  request: NextRequest,
  user: AuthenticatedPrincipal,
  filters: URLSearchParams
): Promise<NextResponse> {
  const sessions: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams(filters);
    query.set('limit', '100');
    if (cursor) query.set('cursor', cursor);
    const response = await forwardSessionRequestToKeiko(request, user, {
      path: '/v1/sessions',
      query,
      method: 'GET',
      scope: 'sessions:read',
    });
    if (!response.ok) return response;
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      return NextResponse.json({ error: 'Session service returned an invalid response' }, {
        status: 502,
        headers: { 'cache-control': 'no-store' },
      });
    }
    if (
      !value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data) ||
      !('pagination' in value) || !value.pagination || typeof value.pagination !== 'object'
    ) {
      return NextResponse.json({ error: 'Session service returned an invalid response' }, {
        status: 502,
        headers: { 'cache-control': 'no-store' },
      });
    }
    sessions.push(...value.data.map((record) =>
      record && typeof record === 'object' && 'session' in record ? record.session : null
    ).filter((session) => session !== null));
    const pagination = value.pagination as { hasMore?: unknown; nextCursor?: unknown };
    if (pagination.hasMore !== true) {
      return NextResponse.json({ sessions, issues: [] }, {
        status: 200,
        headers: { 'cache-control': 'no-store', vary: 'Authorization' },
      });
    }
    if (typeof pagination.nextCursor !== 'string' || !pagination.nextCursor || pagination.nextCursor.length > 512) {
      return NextResponse.json({ error: 'Session service returned an invalid response' }, {
        status: 502,
        headers: { 'cache-control': 'no-store' },
      });
    }
    cursor = pagination.nextCursor;
  }
  return NextResponse.json({ error: 'Session list exceeds the supported size' }, {
    status: 502,
    headers: { 'cache-control': 'no-store' },
  });
}

export function isKeikoCutoverUser(userId: string): boolean {
  const value = process.env.KEIKO_SESSION_CUTOVER_USER_IDS;
  if (!value) return false;
  return value.split(',').map((item) => item.trim()).filter(Boolean).includes(userId);
}
