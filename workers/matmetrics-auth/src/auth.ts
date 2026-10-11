import { env, waitUntil } from 'cloudflare:workers';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { betterAuthIdentityForUser } from '../../../src/lib/auth-identity';
import { ensureAuthIdentity } from './identity';
import { queueAuthEmail } from './email';

export const auth = betterAuth({
  appName: 'MatMetrics',
  baseURL: env.MATMETRICS_AUTH_PUBLIC_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.MATMETRICS_AUTH_FRONTEND_ORIGIN],
  database: env.DB,
  // Better Auth's generic SQLite introspection reports no tables for the
  // Cloudflare D1 adapter. The versioned D1 migrations and Worker integration
  // suite validate this schema instead.
  advanced: {
    database: { validateSchema: false },
    backgroundTasks: { handler: waitUntil },
  },
  emailAndPassword: {
    enabled: true,
    // The Worker request gate applies this launch flag per request. Keeping
    // Better Auth enabled here lets the integration suite exercise both flag
    // states without recreating its module-level auth instance.
    disableSignUp: false,
    requireEmailVerification: true,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => {
      queueAuthEmail('password-reset', user.email, url, token);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url, token }) => {
      queueAuthEmail('verification', user.email, url, token);
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureAuthIdentity(
            env.DB,
            betterAuthIdentityForUser(user.id)
          );
        },
      },
    },
  },
  plugins: [
    passkey({
      rpName: 'MatMetrics',
      rpID: env.MATMETRICS_AUTH_RP_ID,
      origin: env.MATMETRICS_AUTH_FRONTEND_ORIGIN,
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
