import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  AuthConfigurationError,
  AuthVerificationUnavailableError,
  isRemoteJwksUnavailable,
} from './server-auth-errors';
import type { AuthenticatedPrincipal } from './server-auth-types';

let remoteJwksUrl: string | null = null;
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function requiredBetterAuthConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AuthConfigurationError();
  return value;
}

function getBetterAuthJwks(): ReturnType<typeof createRemoteJWKSet> {
  const url = requiredBetterAuthConfig('MATMETRICS_AUTH_JWKS_URL');
  if (!remoteJwks || remoteJwksUrl !== url) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new AuthConfigurationError();
    }
    const nextRemoteJwks = createRemoteJWKSet(parsedUrl);
    remoteJwks = nextRemoteJwks;
    remoteJwksUrl = url;
  }
  return remoteJwks;
}

export async function verifyBetterAuthToken(
  token: string
): Promise<AuthenticatedPrincipal> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getBetterAuthJwks(), {
      algorithms: ['EdDSA'],
      issuer: requiredBetterAuthConfig('MATMETRICS_AUTH_ISSUER'),
      audience: requiredBetterAuthConfig('MATMETRICS_AUTH_AUDIENCE'),
    }));
  } catch (error) {
    if (isRemoteJwksUnavailable(error)) {
      throw new AuthVerificationUnavailableError();
    }
    throw error;
  }
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
