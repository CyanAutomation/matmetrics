import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  getFirebaseAdminAuth,
  isFirebaseAdminConfigured,
} from './firebase-admin';

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

async function verifyToken(token: string): Promise<DecodedIdToken> {
  if (process.env.MATMETRICS_AUTH_TEST_MODE === 'true') {
    return {
      uid: 'test-user',
      aud: 'matmetrics-test',
      auth_time: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      firebase: { identities: {}, sign_in_provider: 'custom' },
      iat: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/matmetrics-test',
      sub: 'test-user',
    };
  }

  return getFirebaseAdminAuth().verifyIdToken(token);
}

export async function requireAuthenticatedUser(
  request: NextRequest
): Promise<DecodedIdToken | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  if (
    !isFirebaseAdminConfigured() &&
    process.env.MATMETRICS_AUTH_TEST_MODE !== 'true'
  ) {
    return NextResponse.json(
      { error: 'Firebase admin is not configured' },
      { status: 500 }
    );
  }

  try {
    return await verifyToken(token);
  } catch (error) {
    console.error('Failed to verify Firebase ID token', error);
    return NextResponse.json(
      { error: 'Invalid authentication token' },
      { status: 401 }
    );
  }
}
