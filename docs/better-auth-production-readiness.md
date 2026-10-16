# Better Auth Production Readiness

## Code readiness

The application now uses Better Auth for password and passkey authentication.
Email verification and password recovery use Resend from the Cloudflare auth
Worker. Signup is gated off by default. Firebase Auth client code, account
linking, Firebase ID token verification, and Go Firebase verification have
been removed. User preferences and plugin state are stored in D1 through the
signed Cloudflare data Worker.

The worker integration suite covers signup gating, email verification before
password sign-in, generic duplicate/recovery responses, first-password setup
for a pre-existing passkey account, reset expiry and replay, session revocation,
passkey enrollment access, account ownership, service JWTs, rate limiting,
email delivery retries, missing email configuration, and atomic identity
creation/retry. These local checks do not verify a production Resend key,
browser cookies, WebAuthn devices, or deployed Go API configuration.

## Production status

As of 2026-10-11, the maintainer confirmed the deployed Better Auth Worker has
its Resend configuration and secrets, and verified email verification,
password reset by email, username/password sign-in, and passkey sign-in.

The production D1 preflight passed and migration `0006_retire_firebase_auth.sql`
was applied. Post-migration checks confirmed no Firebase identity rows or
legacy registration tables remain, the Better Auth identity is canonical, the
Better Auth user and passkey guard triggers remain, and the existing D1
preference row is preserved. The migration removed one redundant Firebase
identity mapping and one completed legacy registration claim/completion.

Public password signup remains disabled by default. Before opening signup,
configure Vercel Firewall limits for `/api/auth/sign-in/*`,
`/api/auth/sign-up/*`, `/api/auth/request-password-reset`,
`/api/auth/reset-password`, and `/api/auth/send-verification-email`, then decide
whether public signup should be enabled in both the Worker and Next.js build.

The Worker applies Cloudflare limits to sign-in and account-recovery routes,
keyed by `CF-Connecting-IP`. A request proxied through Vercel can share egress
IP with other users, so the Worker limit is only a coarse safeguard for
browser traffic. A rate-limit binding failure returns HTTP 503. Do not trust
forwarded client-IP headers at the Worker boundary.

## Former Firebase scope

Firebase Auth is no longer part of the application runtime, and the Go API
accepts only Better Auth EdDSA service JWTs outside test mode. The D1 schema and
legacy registration metadata have also been retired. Disabling Firebase Auth
in the Firebase project is the remaining project-level operation; it has not
been performed or verified here because this session has no Firebase project
admin access. Firebase Admin and Firestore have been removed from application
runtime code. Verify the preference and plugin override data import to D1
before deploying the D1-only application. Disable or delete unused Firebase
products and revoke credentials after the rollback window.
