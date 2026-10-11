# Next Steps

## Better Auth deployment

1. Set the Cloudflare auth Worker secrets `BETTER_AUTH_SECRET` and
   `RESEND_API_KEY`.
2. Configure `MATMETRICS_AUTH_EMAIL_FROM` to use a sender on a verified Resend
   domain.
3. Deploy the auth Worker and same-origin `/api/auth/*` rewrite with password
   signup disabled.
4. Enable `NEXT_PUBLIC_BETTER_AUTH_ENABLED` in Vercel and keep
   `NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED=false`.
5. Use the password-reset email to set a first password on the existing
   passkey account. Check the account ID, passkey, preferences, sessions, and
   protected Next.js and Go APIs.
6. Add Vercel Firewall limits for sign-in, signup, email verification, and
   password recovery routes.
7. Enable signup only when ready by setting the Worker and matching Vercel
   build flags to `true`.

The auth Worker uses the exact frontend origin and RP ID for WebAuthn. Do not
allow wildcard preview origins. See the [auth rollout checklist](docs/better-auth-passkey-migration.md).

## Firebase data fallback

Firebase Auth is no longer used by the application. Firebase Admin and Firestore
remain as a fallback for preferences and plugin state while those records use
the existing Firestore path. Keep `FIREBASE_SERVICE_ACCOUNT_KEY` server-only
until that fallback is retired. Firebase project Auth can be disabled only
after verifying the deployed account migration and checking for other project
consumers.
