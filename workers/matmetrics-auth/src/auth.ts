import { env, waitUntil } from 'cloudflare:workers';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { queueAuthEmail } from './email';
import { getTrustedAuthOriginConfiguration } from '../../../src/lib/trusted-auth-origins';

const authOrigins = getTrustedAuthOriginConfiguration(env);

export const auth = betterAuth({
  appName: 'MatMetrics',
  baseURL: authOrigins.publicUrl,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: authOrigins.trustedOrigins,
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
  plugins: [
    passkey({
      rpName: 'MatMetrics',
      rpID: authOrigins.rpId,
      origin: authOrigins.passkeyOrigins,
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
