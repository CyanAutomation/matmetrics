import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getFirebaseAuthProjectId } from './firebase-admin';
import {
  AuthConfigurationError,
  AuthVerificationUnavailableError,
  isRemoteJwksUnavailable,
} from './server-auth-errors';
import type { AuthenticatedPrincipal } from './server-auth-types';

const FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getFirebaseJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(FIREBASE_JWKS_URL);
  }
  return remoteJwks;
}

export async function verifyFirebaseToken(
  token: string
): Promise<AuthenticatedPrincipal> {
  const projectId = getFirebaseAuthProjectId();
  if (!projectId) throw new AuthConfigurationError();

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getFirebaseJwks(), {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      requiredClaims: ['exp', 'iat', 'auth_time', 'sub'],
    }));
  } catch (error) {
    if (isRemoteJwksUnavailable(error)) {
      throw new AuthVerificationUnavailableError();
    }
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const allowedClockSkewSeconds = 60;
  if (
    payload.aud !== projectId ||
    typeof payload.iat !== 'number' ||
    !Number.isFinite(payload.iat) ||
    payload.iat > now + allowedClockSkewSeconds ||
    typeof payload.auth_time !== 'number' ||
    !Number.isFinite(payload.auth_time) ||
    payload.auth_time > now + allowedClockSkewSeconds ||
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0 ||
    payload.sub.length > 128
  ) {
    throw new Error('Firebase token claims are invalid');
  }

  return {
    userId: payload.sub,
    appUserId: payload.sub,
    provider: 'firebase',
    email: typeof payload.email === 'string' ? payload.email : null,
    displayName: typeof payload.name === 'string' ? payload.name : null,
    emailVerified: payload.email_verified === true,
  };
}
