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

## D1 data cutover and Firebase retirement

Before deploying the D1-only application, export Firestore preferences and
per-user plugin overrides, import them into the existing D1 tables, and
reconcile counts and sampled values. Confirm the data Worker URL and signing
secret are configured in every Vercel environment and exercise reads and
writes. Keep the Firestore export and credentials through the rollback window.
Afterward revoke the service account and disable or delete Firebase products
only after checking for other project consumers.
