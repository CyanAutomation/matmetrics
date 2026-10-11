# MatMetrics Setup Guide

## Prerequisites

- Node.js 24.x and npm 11.x
- A GitHub token for GitHub-backed session storage
- Cloudflare Workers and D1 for Better Auth and preference APIs
- A Resend account with a verified sending domain
- Firebase Admin credentials only while the Firestore preference/plugin-state
  fallback remains in use

## Local development

Copy the environment template and add the server-side integrations you use:

```bash
cp .env.example .env.local
```

Set `GITHUB_TOKEN`, `CLOUDFLARE_API_TOKEN`, and the Better Auth Worker URL and
JWT settings. For local Firestore fallback, set
`FIREBASE_SERVICE_ACCOUNT_KEY` to the service-account JSON on one line. That
credential is server-only and is unrelated to authentication.

Apply the existing D1 schema through the data Worker migration owner, then
start the data Worker, auth Worker, and Next.js app:

```bash
cd workers/matmetrics-data && npm run migrate:local
cd ../matmetrics-auth && npm run dev
```

The auth Worker needs local `.dev.vars` values for `BETTER_AUTH_SECRET` and
`RESEND_API_KEY` if you want to receive real verification or recovery email.
Keep `MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED=false` until you intentionally
open signup. The authenticated user can enroll another passkey from account
settings.

## Deploy Better Auth and email

Configure these Cloudflare Worker secrets before deployment:

- `BETTER_AUTH_SECRET`: random secret of at least 32 characters.
- `RESEND_API_KEY`: Resend API key with send permission for your verified
  domain.

Set `MATMETRICS_AUTH_EMAIL_FROM` to a sender on that verified domain. Set the
Worker's frontend origin, public URL, RP ID, JWT issuer, and audience to match
the deployed MatMetrics hostname. Keep
`MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED=false` during the existing-account
rollout.

In Vercel, configure:

- `CLOUDFLARE_AUTH_WORKER_URL`
- `NEXT_PUBLIC_BETTER_AUTH_ENABLED=true` after the auth Worker and rewrite are
  ready
- `NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED=false`
- `NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED=true`
- `MATMETRICS_AUTH_JWKS_URL`, `MATMETRICS_AUTH_ISSUER`, and
  `MATMETRICS_AUTH_AUDIENCE`

Never put `BETTER_AUTH_SECRET` or `RESEND_API_KEY` in Vercel or a
`NEXT_PUBLIC_*` variable. Public browser flags are compiled into the Next.js
build and require a redeploy when changed.

## Existing account and launch checks

Use the emailed password-reset link on the existing passkey account to set its
first password. Confirm the user ID, passkey, preferences, and session
ownership remain unchanged. Then verify password sign-in, passkey sign-in,
passkey enrollment, reset expiry/replay rejection, session revocation, and
protected Next.js and Go APIs.

Only after those checks pass should public signup be opened by setting both
`MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED=true` in Cloudflare and
`NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED=true` in the corresponding Vercel
build. Add Vercel Firewall rate limits for sign-in, signup, verification, and
password recovery endpoints before launch.

Firebase Auth is no longer used by MatMetrics code. Keep Firebase Admin and its
service account for the Firestore fallback. Disabling Firebase Auth in the
Firebase project is a separate project-wide action; do it only after checking
the deployed account and any other Firebase Auth consumers.

## Other setup

- GitHub-backed session storage requires `GITHUB_TOKEN` with access to the
  configured repositories.
- `CLOUDFLARE_API_TOKEN` enables AI-assisted technique suggestions and
  description transforms.
- `OPENROUTER_API_KEY` enables optional JEV check-ins and AI fidelity checks.
- `SENTRY_DSN` enables browser error reporting; `SENTRY_AUTH_TOKEN` is for
  source-map uploads in CI/Vercel.

See the [README](README.md), [auth Worker setup](workers/matmetrics-auth/README.md),
and [auth rollout checklist](docs/better-auth-passkey-migration.md) for detail.
