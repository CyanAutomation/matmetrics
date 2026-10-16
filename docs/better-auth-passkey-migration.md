# Better Auth Password and Passkey Rollout

## Current design

Better Auth is MatMetrics' sole authentication provider. It supports verified
email/password accounts and passkeys on the same account. Password signup is
disabled by default while the existing account is migrated and checked.
Firebase Auth client sign-in, linking, and Firebase ID token verification have
been removed. Preferences and plugin overrides use D1 through the signed data
Worker; no Firebase runtime fallback remains.

The Better Auth Worker uses the existing D1 schema and canonical MatMetrics user
IDs. Existing passkey account IDs remain unchanged. First-password setup uses
Better Auth's password-reset email; the reset route creates the credential if
one does not exist, consumes the token once, and revokes active sessions.
Verification and password-reset links are sent through Resend callbacks and
Cloudflare `waitUntil`. Email-dependent auth requests return the same generic
503 if the sender configuration is missing. Transient send failures are
retried with an idempotency key and logged if all attempts fail.

## Production verification

On 2026-10-11, the maintainer confirmed the deployed Worker has its Resend
configuration and secrets and verified email verification, password reset by
email, username/password sign-in, and passkey sign-in. D1 migration
`0006_retire_firebase_auth.sql` was applied after its read-only preflight passed.
Post-migration checks confirmed the canonical Better Auth identity remains,
the Firebase identity mapping and legacy registration tables are gone, and the
existing preference row is preserved.

## Required configuration

In Cloudflare, configure:

- Worker secrets `BETTER_AUTH_SECRET` and `RESEND_API_KEY`.
- `MATMETRICS_AUTH_EMAIL_FROM` as a sender on a verified Resend domain.
- `MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED=false` until launch.
- `MATMETRICS_AUTH_SIGNIN_ENABLED=true` and
  `MATMETRICS_PASSKEY_ENROLMENT_ENABLED=true`.
- The exact frontend origin, WebAuthn RP ID, JWT issuer, and audience.

In Vercel, configure the auth Worker URL, the same-origin JWKS URL, issuer and
audience, `NEXT_PUBLIC_BETTER_AUTH_ENABLED=true`,
`NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED=false`, and
`NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED=true`. Do not copy `BETTER_AUTH_SECRET`
or `RESEND_API_KEY` into Vercel. Keep the browser signup flag aligned with the
Worker flag; the Worker is authoritative.

Use the exact frontend hostname for the WebAuthn RP ID and origin. Do not use
wildcard preview hosts. Apply D1 changes through `workers/matmetrics-data`,
which remains the migration owner. Migration `0005` backfills canonical Better
Auth identity rows and installs D1 triggers that reject conflicting mappings and
create each new Better Auth identity atomically with its user row. Migration
`0006` restricts identity providers to Better Auth and removes the retired
Firebase registration metadata. For future D1 migrations, run the read-only
preflight before applying pending migrations and the verification command
afterward.

## Existing-account migration

After deploying the auth Worker and same-origin Next.js rewrite:

1. Sign in to the existing account with its passkey.
2. From account settings, request the password setup email for the account's
   verified email address.
3. Follow the link and choose a password. The existing Better Auth user ID and
   passkey remain attached to the account; preferences and session ownership
   continue to use that ID.
4. Sign in with the password, then sign out and verify passkey sign-in still
   works.
5. Request another reset, confirm a new password works, and confirm previous
   sessions were revoked. Confirm an expired or replayed reset link is
   rejected.
6. Add a second passkey from account settings and verify it can sign in.
7. Exercise protected Next.js and Go APIs and confirm the Better Auth service
   JWT identifies the same account ID.

Password reset and verification responses are generic so they do not reveal
whether an email address belongs to an account. Password sign-in is rejected
until email verification is complete. Public signup remains unavailable while
the Worker flag is false.

## Open public signup

Only after the existing account and protected API checks pass, enable
`MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED=true` in the Cloudflare environment
and `NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED=true` in the matching Vercel
build. Before launch, set Vercel Firewall limits for browser-facing sign-in,
signup, verification, and password recovery routes; proxied traffic can share
Vercel egress IPs and the Worker IP limiter is a coarse guard.

## Firebase retirement

Firebase Auth has been removed from the application runtime and D1 schema, and
Firebase Admin/Firestore have been removed from the application runtime.
The maintainer verified the existing account's email verification, password
reset, password sign-in, and passkey sign-in in production. The only remaining
Firebase Auth retirement action is disabling Firebase Auth in the Firebase
project; this session did not have project-admin access to perform or verify
that setting. Before deploying the D1-only application, confirm that Firestore
preferences and per-user plugin overrides have been exported, imported to D1,
and reconciled. Keep the old data and credentials through the rollback window.
