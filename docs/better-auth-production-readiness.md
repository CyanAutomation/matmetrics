# Better Auth Production Readiness

## Code readiness

The application now uses Better Auth for password and passkey authentication.
Email verification and password recovery use Resend from the Cloudflare auth
Worker. Signup is gated off by default. Firebase Auth client code, account
linking, Firebase ID token verification, and Go Firebase verification have
been removed. Firebase Admin/Firestore remains for preference and plugin-state
fallback storage.

The worker integration suite covers signup gating, email verification before
password sign-in, generic duplicate/recovery responses, first-password setup
for a pre-existing passkey account, reset expiry and replay, session revocation,
passkey enrollment access, account ownership, service JWTs, and rate limiting.
These local checks do not verify a production Resend key, browser cookies,
WebAuthn devices, or deployed Go API configuration.

## Before production use

1. Set Cloudflare Worker secrets `BETTER_AUTH_SECRET` and `RESEND_API_KEY`.
2. Set `MATMETRICS_AUTH_EMAIL_FROM` to a sender on a verified Resend domain.
3. Confirm the Worker origin, trusted frontend origin, RP ID, issuer, and
   audience match the deployed Next.js and Go configuration.
4. Deploy the auth Worker and the same-origin `/api/auth/*` rewrite with
   `MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED=false`.
5. In Vercel, enable `NEXT_PUBLIC_BETTER_AUTH_ENABLED` and keep
   `NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED=false`.
6. Complete the existing-account password, passkey, protected API, and data
   ownership checks in
   [`better-auth-passkey-migration.md`](better-auth-passkey-migration.md).
7. Add Vercel Firewall limits for `/api/auth/sign-in/*`,
   `/api/auth/sign-up/*`, `/api/auth/request-password-reset`,
   `/api/auth/reset-password`, and `/api/auth/send-verification-email`.
8. Only after the account checks pass, decide whether to enable public signup
   by setting both the Worker and Next.js signup flags to `true`.

The Worker applies Cloudflare limits to sign-in and account-recovery routes,
keyed by `CF-Connecting-IP`. A request proxied through Vercel can share egress
IP with other users, so the Worker limit is only a coarse safeguard for
browser traffic. A rate-limit binding failure returns HTTP 503. Do not trust
forwarded client-IP headers at the Worker boundary.

## Firebase scope

Firebase Auth is no longer part of the application runtime, and the Go API
accepts only Better Auth EdDSA service JWTs outside test mode. Disabling
Firebase Auth in the Firebase project is a project-wide operations action and
has not been performed by these code changes. Firebase Admin and Firestore
remain configured for the existing fallback data path. Remove that service
account only after a separate Firestore migration and rollback window.
