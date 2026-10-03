import { env } from 'cloudflare:workers';
import { getAuthenticatorName, passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import {
  verifyPasskeyRegistrationContext,
} from '../../../src/lib/passkey-registration-context';
import {
  betterAuthIdentityForUser,
  ensureAuthIdentity,
  firebaseIdentityForUid,
} from './identity';

async function resolveRegistrationUser(
  context: string | null | undefined
) {
  if (!context) throw new Error('A signed passkey registration context is required');
  const claims = await verifyPasskeyRegistrationContext(
    context,
    env.MATMETRICS_AUTH_CONTEXT_SECRET
  );
  const expiresAt = (await contextExpiration(context)) * 1000;

  const now = Date.now();
  if (claims.provider === 'firebase') {
    await ensureAuthIdentity(env.DB, firebaseIdentityForUid(claims.providerSubject), now);
  }
  await ensureAuthIdentity(
    env.DB,
    betterAuthIdentityForUser(claims.appUserId, claims.appUserId),
    now
  );

  const registration = await env.DB
    .prepare(
      'SELECT app_user_id, expires_at, completed_at FROM auth_registration_contexts WHERE nonce = ?'
    )
    .bind(claims.nonce)
    .first<{
      app_user_id: string;
      expires_at: number;
      completed_at: number | null;
    }>();

  if (registration?.completed_at) {
    throw new Error('Passkey registration context has already been used');
  }
  if (
    registration &&
    (registration.app_user_id !== claims.appUserId ||
      registration.expires_at !== expiresAt)
  ) {
    throw new Error('Passkey registration context does not match its stored record');
  }

  await env.DB
    .prepare(
      'INSERT OR IGNORE INTO auth_registration_contexts (nonce, app_user_id, expires_at, completed_at, created_at) VALUES (?, ?, ?, NULL, ?)'
    )
    .bind(claims.nonce, claims.appUserId, expiresAt, now)
    .run();

  const authUserByEmail = await env.DB
    .prepare('SELECT id FROM user WHERE lower(email) = lower(?)')
    .bind(claims.email)
    .first<{ id: string }>();
  if (authUserByEmail && authUserByEmail.id !== claims.appUserId) {
    throw new Error('Email is already associated with another MatMetrics account');
  }
  return claims;
}

async function contextExpiration(context: string): Promise<number> {
  const [, payloadSegment] = context.split('.');
  if (!payloadSegment) throw new Error('Invalid passkey registration context');
  const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const payload = JSON.parse(atob(padded));
  if (typeof payload.exp !== 'number') {
    throw new Error('Passkey registration context has no expiration');
  }
  return payload.exp;
}

export const auth = betterAuth({
  appName: 'MatMetrics',
  baseURL: env.MATMETRICS_AUTH_PUBLIC_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.MATMETRICS_AUTH_FRONTEND_ORIGIN],
  database: env.DB,
  emailAndPassword: { enabled: false },
  plugins: [
    passkey({
      rpName: 'MatMetrics',
      rpID: env.MATMETRICS_AUTH_RP_ID,
      origin: env.MATMETRICS_AUTH_FRONTEND_ORIGIN,
      registration: {
        requireSession: false,
        resolveUser: async ({ ctx, context }) => {
          const claims = await resolveRegistrationUser(context);

          return {
            id: claims.appUserId,
            name: claims.name,
            displayName: claims.name,
          };
        },
        afterVerification: async ({ ctx, user, context, verification }) => {
          if (context) {
            const claims = await verifyPasskeyRegistrationContext(
              context,
              env.MATMETRICS_AUTH_CONTEXT_SECRET
            );
            if (user.id !== claims.appUserId) {
              throw new Error('Passkey registration user does not match its signed context');
            }

            const existingUser = await ctx.context.internalAdapter.findUserById(
              claims.appUserId
            );
            if (existingUser) {
              if (existingUser.email.toLowerCase() !== claims.email.toLowerCase()) {
                throw new Error('Passkey identity is already associated with another account');
              }
            } else {
              const createdUser = await ctx.context.internalAdapter.createUser(
                {
                  id: claims.appUserId,
                  name: claims.name,
                  email: claims.email,
                  emailVerified: claims.emailVerified,
                },
                { method: 'passkey-registration' }
              );
              if (!createdUser || createdUser.id !== claims.appUserId) {
                throw new Error('Could not create the MatMetrics authentication user');
              }
            }

            const now = Date.now();
            const result = await env.DB
              .prepare(
                'UPDATE auth_registration_contexts SET completed_at = ? WHERE nonce = ? AND app_user_id = ? AND completed_at IS NULL AND expires_at > ?'
              )
              .bind(now, claims.nonce, claims.appUserId, now)
              .run();
            if (result.meta.changes !== 1) {
              throw new Error('Passkey registration context is expired or already used');
            }
          }

          return {
            name:
              getAuthenticatorName(verification.registrationInfo?.aaguid) ??
              undefined,
          };
        },
      },
    }),
    jwt({
      jwt: {
        issuer: env.MATMETRICS_AUTH_ISSUER,
        audience: env.MATMETRICS_AUTH_AUDIENCE,
        definePayload: ({ user }) => ({ appUserId: user.id }),
      },
    }),
  ],
});
