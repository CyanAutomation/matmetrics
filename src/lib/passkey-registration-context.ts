import { SignJWT, jwtVerify } from 'jose';

const CONTEXT_ISSUER = 'matmetrics-passkey-registration';
const CONTEXT_AUDIENCE = 'matmetrics-auth';
export const PASSKEY_REGISTRATION_CONTEXT_TTL_SECONDS = 10 * 60;

export type PasskeyRegistrationProvider = 'firebase' | 'better-auth';

export type PasskeyRegistrationClaims = {
  appUserId: string;
  provider: PasskeyRegistrationProvider;
  providerSubject: string;
  email: string;
  name: string;
  emailVerified: boolean;
  nonce: string;
};

export class InvalidPasskeyRegistrationContextError extends Error {
  constructor() {
    super('Invalid or expired passkey registration context');
    this.name = 'InvalidPasskeyRegistrationContextError';
  }
}

function secretKey(secret: string): Uint8Array {
  if (secret.length < 32) {
    throw new Error(
      'MATMETRICS_AUTH_CONTEXT_SECRET must be at least 32 characters'
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createPasskeyRegistrationContext(
  claims: Omit<PasskeyRegistrationClaims, 'nonce'>,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  const nonce = crypto.randomUUID();
  return new SignJWT({
    purpose: 'passkey-registration',
    appUserId: claims.appUserId,
    provider: claims.provider,
    providerSubject: claims.providerSubject,
    email: claims.email.trim().toLowerCase(),
    name: claims.name.trim(),
    emailVerified: claims.emailVerified,
    nonce,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(CONTEXT_ISSUER)
    .setAudience(CONTEXT_AUDIENCE)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + PASSKEY_REGISTRATION_CONTEXT_TTL_SECONDS)
    .sign(secretKey(secret));
}

export async function verifyPasskeyRegistrationContext(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<PasskeyRegistrationClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ['HS256'],
      issuer: CONTEXT_ISSUER,
      audience: CONTEXT_AUDIENCE,
      currentDate: new Date(nowSeconds * 1000),
      maxTokenAge: `${PASSKEY_REGISTRATION_CONTEXT_TTL_SECONDS}s`,
    });

    if (
      payload.purpose !== 'passkey-registration' ||
      typeof payload.appUserId !== 'string' ||
      !payload.appUserId ||
      (payload.provider !== 'firebase' && payload.provider !== 'better-auth') ||
      typeof payload.providerSubject !== 'string' ||
      !payload.providerSubject ||
      typeof payload.email !== 'string' ||
      !payload.email ||
      typeof payload.name !== 'string' ||
      !payload.name ||
      typeof payload.emailVerified !== 'boolean' ||
      typeof payload.nonce !== 'string' ||
      !payload.nonce ||
      payload.providerSubject !== payload.appUserId
    ) {
      throw new InvalidPasskeyRegistrationContextError();
    }

    return {
      appUserId: payload.appUserId,
      provider: payload.provider,
      providerSubject: payload.providerSubject,
      email: payload.email,
      name: payload.name,
      emailVerified: payload.emailVerified,
      nonce: payload.nonce,
    };
  } catch {
    throw new InvalidPasskeyRegistrationContextError();
  }
}
