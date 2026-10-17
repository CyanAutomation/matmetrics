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

## External Service Retirement

Firebase Auth and Firestore are not used by the application runtime. The Go API
accepts only Better Auth EdDSA service JWTs outside test mode, and migration
`0006` removed the Firebase identity mapping from D1. On 2026-10-17, the
maintainer compared the Firestore export with D1 and retained the newer D1
preference state; no import or database write was needed. The detailed counts,
timestamps, and recovery bookmark are in the
[D1 migration record](cloudflare-d1-migration.md).

Disabling Firebase Auth, revoking credentials, and retiring Firestore remain
project-side operations. Their completion has not been verified here. Check
for other project consumers, keep the export and D1 recovery point through the
rollback window, and account for the older Firestore snapshot before restoring
an application that depends on it.
