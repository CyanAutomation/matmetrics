import { env } from 'cloudflare:workers';
import { getAuthenticatorName, passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { getSessionFromCtx } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import { isPasskeyRegistrationAllowed } from '../../../src/lib/passkey-policy';
import { verifyPasskeyRegistrationContext } from '../../../src/lib/passkey-registration-context';
import type { PasskeyRegistrationPolicy } from '../../../src/lib/passkey-policy';
import { completePasskeyRegistration } from './identity';

function registrationPolicy(): PasskeyRegistrationPolicy {
  return {
    enrolmentEnabled: env.MATMETRICS_PASSKEY_ENROLMENT_ENABLED === 'true',
    signupEnabled: env.MATMETRICS_PASSKEY_SIGNUP_ENABLED === 'true',
  };
}

async function reserveRegistrationContext(context: string | null | undefined) {
  if (!context)
    throw new Error('A signed passkey registration context is required');
  const claims = await verifyPasskeyRegistrationContext(
    context,
    env.MATMETRICS_AUTH_CONTEXT_SECRET
  );
  const expiresAt = (await contextExpiration(context)) * 1000;
  const path =
    claims.provider === 'firebase' ? 'firebase-enrolment' : 'new-account';
  if (!isPasskeyRegistrationAllowed(path, registrationPolicy())) {
    throw new Error('Passkey registration is disabled');
  }
  const now = Date.now();
  await env.DB.prepare(
    'DELETE FROM auth_registration_context_claims WHERE expires_at <= ?'
  )
    .bind(now)
    .run();

  const reservationResult = await env.DB.prepare(
    'INSERT OR IGNORE INTO auth_registration_context_claims (nonce, app_user_id, provider, provider_subject, expires_at, completed_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)'
  )
    .bind(
      claims.nonce,
      claims.appUserId,
      claims.provider,
      claims.providerSubject,
      expiresAt,
      now
    )
    .run();
  if (reservationResult.meta.changes !== 1) {
    throw new Error('Passkey registration context has already been reserved');
  }

  const reserved = await env.DB.prepare(
    'SELECT app_user_id, provider, provider_subject, expires_at, completed_at FROM auth_registration_context_claims WHERE nonce = ?'
  )
    .bind(claims.nonce)
    .first<{
      app_user_id: string;
      provider: 'firebase' | 'better-auth';
      provider_subject: string;
      expires_at: number;
      completed_at: number | null;
    }>();
  if (
    !reserved ||
    reserved.completed_at ||
    reserved.app_user_id !== claims.appUserId ||
    reserved.provider !== claims.provider ||
    reserved.provider_subject !== claims.providerSubject ||
    reserved.expires_at !== expiresAt
  ) {
    throw new Error(
      'Passkey registration context does not match its reservation'
    );
  }

  const authUserByEmail = await env.DB.prepare(
    'SELECT id FROM user WHERE lower(email) = lower(?)'
  )
    .bind(claims.email)
    .first<{ id: string }>();
  if (authUserByEmail && authUserByEmail.id !== claims.appUserId) {
    throw new Error(
      'Email is already associated with another MatMetrics account'
    );
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
  // Better Auth's generic SQLite introspection reports no tables for the
  // Cloudflare D1 adapter. The versioned D1 migrations and Worker integration
  // suite validate this schema instead.
  advanced: { database: { validateSchema: false } },
  emailAndPassword: { enabled: false },
  plugins: [
    passkey({
      rpName: 'MatMetrics',
      rpID: env.MATMETRICS_AUTH_RP_ID,
      origin: env.MATMETRICS_AUTH_FRONTEND_ORIGIN,
      registration: {
        requireSession: false,
        resolveUser: async ({ ctx: _ctx, context }) => {
          const claims = await reserveRegistrationContext(context);

          return {
            id: claims.appUserId,
            name: claims.name,
            displayName: claims.name,
          };
        },
        afterVerification: async ({ ctx, user, context, verification }) => {
          if (context) {
            if (ctx.body.createSession !== true) {
              throw new Error(
                'Passkey registration must create an authenticated session'
              );
            }
            const claims = await verifyPasskeyRegistrationContext(
              context,
              env.MATMETRICS_AUTH_CONTEXT_SECRET
            );
            if (user.id !== claims.appUserId) {
              throw new Error(
                'Passkey registration user does not match its signed context'
              );
            }
            const registrationPath =
              claims.provider === 'firebase'
                ? 'firebase-enrolment'
                : 'new-account';
            if (
              !isPasskeyRegistrationAllowed(
                registrationPath,
                registrationPolicy()
              )
            ) {
              throw new Error('Passkey registration is disabled');
            }

            const reservation = await env.DB.prepare(
              'SELECT app_user_id, provider, provider_subject, expires_at, completed_at FROM auth_registration_context_claims WHERE nonce = ?'
            )
              .bind(claims.nonce)
              .first<{
                app_user_id: string;
                provider: 'firebase' | 'better-auth';
                provider_subject: string;
                expires_at: number;
                completed_at: number | null;
              }>();
            const expiresAt = (await contextExpiration(context)) * 1000;
            if (
              !reservation ||
              reservation.completed_at ||
              reservation.app_user_id !== claims.appUserId ||
              reservation.provider !== claims.provider ||
              reservation.provider_subject !== claims.providerSubject ||
              reservation.expires_at !== expiresAt ||
              reservation.expires_at <= Date.now()
            ) {
              throw new Error(
                'Passkey registration context is expired or already used'
              );
            }

            const existingUser = await ctx.context.internalAdapter.findUserById(
              claims.appUserId
            );
            if (existingUser) {
              if (
                existingUser.email.toLowerCase() !== claims.email.toLowerCase()
              ) {
                throw new Error(
                  'Passkey identity is already associated with another account'
                );
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
                throw new Error(
                  'Could not create the MatMetrics authentication user'
                );
              }
            }

            await completePasskeyRegistration(
              env.DB,
              claims,
              expiresAt,
              Date.now()
            );
          } else {
            if (
              !isPasskeyRegistrationAllowed(
                'authenticated-enrolment',
                registrationPolicy()
              )
            ) {
              throw new Error('Passkey enrolment is disabled');
            }
            const session = await getSessionFromCtx(ctx);
            if (!session?.user?.id || session.user.id !== user.id) {
              throw new Error(
                'An active Better Auth session is required to add a passkey'
              );
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
