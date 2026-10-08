import { NextResponse, type NextRequest } from 'next/server';
import { isFirebaseAdminConfigured } from './firebase-admin';
import { PREFERENCE_API_ERROR_CODES } from './preference-api-errors';
import { AuthConfigurationError } from './server-auth-errors';
import type { AuthenticatedPrincipal } from './server-auth-types';

export type { AuthenticatedPrincipal } from './server-auth-types';

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  const parts = authorization.trim().split(/\s+/);
  if (
    parts.length !== 2 ||
    parts[0]?.toLowerCase() !== 'bearer' ||
    !parts[1]
  ) {
    return null;
  }

  return parts[1];
}

function isAuthTestModeEnabled(): boolean {
  return (
    process.env.MATMETRICS_AUTH_TEST_MODE === 'true' &&
    process.env.NODE_ENV === 'test'
  );
}

function getTokenAlgorithm(token: string): string {
  const [encodedHeader, payload, signature, extra] = token.split('.');
  if (
    !encodedHeader ||
    !payload ||
    !signature ||
    extra !== undefined ||
    encodedHeader.length > 8192
  ) {
    throw new Error('Malformed authentication token');
  }

  const header: unknown = JSON.parse(
    Buffer.from(encodedHeader, 'base64url').toString('utf8')
  );
  if (
    !header ||
    typeof header !== 'object' ||
    !('alg' in header) ||
    typeof header.alg !== 'string'
  ) {
    throw new Error('Malformed authentication token header');
  }
  return header.alg;
}

async function verifyToken(token: string): Promise<AuthenticatedPrincipal> {
  if (isAuthTestModeEnabled()) {
    if (token !== 'test-token') throw new Error('Invalid test token');
    return {
      userId: 'test-user',
      appUserId: 'test-user',
      provider: 'test',
      email: null,
      displayName: null,
      emailVerified: false,
    };
  }

  const alg = getTokenAlgorithm(token);
  if (alg === 'EdDSA') {
    const { verifyBetterAuthToken } = await import(
      './better-auth-token-verifier.server'
    );
    return verifyBetterAuthToken(token);
  }
  if (alg === 'RS256') {
    if (!isFirebaseAdminConfigured()) throw new AuthConfigurationError();
    const { verifyFirebaseToken } = await import(
      './firebase-token-verifier.server'
    );
    return verifyFirebaseToken(token);
  }
  throw new Error('Unsupported authentication token algorithm');
}

export async function requireAuthenticatedUser(
  request: NextRequest,
  options: { includeErrorCode?: boolean } = {}
): Promise<AuthenticatedPrincipal | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      {
        error: 'Authentication required',
        ...(options.includeErrorCode
          ? { code: PREFERENCE_API_ERROR_CODES.authenticationRequired }
          : {}),
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    return await verifyToken(token);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(options.includeErrorCode
            ? { code: PREFERENCE_API_ERROR_CODES.authenticationConfiguration }
            : {}),
        },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    console.error('Failed to verify authentication token');
    return NextResponse.json(
      {
        error: 'Invalid authentication token',
        ...(options.includeErrorCode
          ? { code: PREFERENCE_API_ERROR_CODES.authenticationFailed }
          : {}),
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
