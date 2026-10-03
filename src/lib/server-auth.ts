import { decodeProtectedHeader, createRemoteJWKSet, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import {
  getFirebaseAdminAuth,
  isFirebaseAdminConfigured,
} from './firebase-admin';

export type AuthenticatedPrincipal = {
  /** Provider-specific subject. */
  userId: string;
  /** Stable MatMetrics account key used to scope application data. */
  appUserId: string;
  provider: 'firebase' | 'better-auth' | 'test';
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
};

class AuthConfigurationError extends Error {}

let remoteJwksUrl: string | null = null;
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

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

function requiredBetterAuthConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AuthConfigurationError(`${name} is not configured`);
  return value;
}

function getBetterAuthJwks(): ReturnType<typeof createRemoteJWKSet> {
  const url = requiredBetterAuthConfig('MATMETRICS_AUTH_JWKS_URL');
  if (!remoteJwks || remoteJwksUrl !== url) {
    remoteJwksUrl = url;
    remoteJwks = createRemoteJWKSet(new URL(url));
  }
  return remoteJwks;
}

async function verifyBetterAuthToken(
  token: string
): Promise<AuthenticatedPrincipal> {
  const { payload } = await jwtVerify(token, getBetterAuthJwks(), {
    algorithms: ['EdDSA'],
    issuer: requiredBetterAuthConfig('MATMETRICS_AUTH_ISSUER'),
    audience: requiredBetterAuthConfig('MATMETRICS_AUTH_AUDIENCE'),
  });
  const appUserId = payload.appUserId;
  if (
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    typeof appUserId !== 'string' ||
    !appUserId ||
    payload.sub !== appUserId
  ) {
    throw new Error('Better Auth token subject is invalid');
  }

  return {
    userId: payload.sub,
    appUserId,
    provider: 'better-auth',
    email: typeof payload.email === 'string' ? payload.email : null,
    displayName: typeof payload.name === 'string' ? payload.name : null,
    emailVerified: payload.emailVerified === true,
  };
}

async function verifyFirebaseToken(
  token: string
): Promise<AuthenticatedPrincipal> {
  if (!isFirebaseAdminConfigured()) {
    throw new AuthConfigurationError('Firebase admin is not configured');
  }
  const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
  return {
    userId: decoded.uid,
    appUserId: decoded.uid,
    provider: 'firebase',
    email: typeof decoded.email === 'string' ? decoded.email : null,
    displayName: typeof decoded.name === 'string' ? decoded.name : null,
    emailVerified: decoded.email_verified === true,
  };
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

  const { alg } = decodeProtectedHeader(token);
  if (alg === 'EdDSA') return verifyBetterAuthToken(token);
  if (alg === 'RS256') return verifyFirebaseToken(token);
  throw new Error('Unsupported authentication token algorithm');
}

export async function requireAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedPrincipal | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    return await verifyToken(token);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    console.error('Failed to verify authentication token');
    return NextResponse.json(
      { error: 'Invalid authentication token' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
