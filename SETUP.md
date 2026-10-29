# MatMetrics Setup Guide

## Prerequisites

- Node.js 24.x and npm 11.x
- Go 1.26.x only if building or using the Go CLI/API
- A GitHub token for legacy GitHub-backed session storage or sync; allowlisted Keiko accounts use a selected-repository GitHub App instead
- Cloudflare Workers and D1 only for local auth and preference services
- A Resend account and verified sending domain only for real auth email delivery

## Local development

### Guest preview

The credential-free preview needs only the root application dependencies:

```bash
npm ci
npm run dev
```

Open `http://localhost:9002`. The guest preview stores sample sessions and
changes in this browser. It does not start or require either Worker.

### Local Workers and account services

This optional setup starts local D1-backed data and auth Workers with the
Next.js app. It uses local Wrangler state. Do not copy production credentials
or use a production D1 database for local development.

Install the root and Worker dependencies:

```bash
npm ci
npm --prefix workers/matmetrics-data ci
npm --prefix workers/matmetrics-auth ci
```

Copy `.env.example` to `.env.local`, then set these local endpoints and values:

```dotenv
CLOUDFLARE_AUTH_WORKER_URL=http://localhost:8787
CLOUDFLARE_DATA_WORKER_URL=http://localhost:8788
MATMETRICS_AUTH_JWKS_URL=http://localhost:9002/api/auth/jwks
MATMETRICS_AUTH_ISSUER=http://localhost:9002
MATMETRICS_AUTH_AUDIENCE=matmetrics-api
NEXT_PUBLIC_BETTER_AUTH_ENABLED=true
MATMETRICS_INTERNAL_API_SECRET=replace-with-a-local-random-secret
MATMETRICS_BACKGROUND_EXECUTOR_SECRET=replace-with-a-different-local-random-secret
```

`CLOUDFLARE_AUTH_WORKER_HOST` is not needed for the local `http://localhost`
URL above. Set it to the auth Worker's exact bare `*.workers.dev` hostname only
when using a remote Worker for the server-side Keiko session exchange.

Use the same local `MATMETRICS_INTERNAL_API_SECRET` and
`MATMETRICS_BACKGROUND_EXECUTOR_SECRET` in
`workers/matmetrics-data/.dev.vars`. Add a local `BETTER_AUTH_SECRET` in
`workers/matmetrics-auth/.dev.vars`. Generate independent random values (for
example, run `openssl rand -hex 32` once per secret); do not reuse production
secrets. `.dev.vars` files are ignored by git and should stay local. A real
`RESEND_API_KEY` is only needed to test verification or recovery email delivery.

Apply the local D1 migrations once:

```bash
cd workers/matmetrics-data
npm run migrate:local
```

Then run each service in a separate terminal. The data Worker config's default
background executor URL is the hosted MatMetrics app, so the local command
overrides it to keep locally queued jobs on the local app:

```bash
# Terminal 1: local data Worker and D1
cd workers/matmetrics-data
npx wrangler dev --port 8788 --var MATMETRICS_BACKGROUND_EXECUTOR_URL:http://localhost:9002
```

```bash
# Terminal 2: local auth Worker, sharing the data Worker D1 state
cd workers/matmetrics-auth
npm run dev -- --port 8787
```

```bash
# Terminal 3: Next.js app
npm run dev
```

Restart the Next.js server after changing `.env.local`. Public email/password
signup remains disabled by default; see [Authentication Setup](README.md#authentication-setup)
and the [auth Worker guide](workers/matmetrics-auth/README.md) before enabling
signup or email-dependent flows.

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
- `CLOUDFLARE_AUTH_WORKER_HOST` (the exact bare Worker hostname, for example `matmetrics-auth.<account>.workers.dev`)
- `NEXT_PUBLIC_BETTER_AUTH_ENABLED=true` after the auth Worker and rewrite are
  ready
- `NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED=false`
- `NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED=true`
- `MATMETRICS_AUTH_JWKS_URL`, `MATMETRICS_AUTH_ISSUER`, and
  `MATMETRICS_AUTH_AUDIENCE`
- `MATMETRICS_AUTH_FRONTEND_ORIGIN`, `KEIKO_API_BASE_URL`, and
  `KEIKO_SESSION_CUTOVER_USER_IDS` for the server-side Keiko session adapter

Never put `BETTER_AUTH_SECRET` or `RESEND_API_KEY` in Vercel or a
`NEXT_PUBLIC_*` variable. Public browser flags are compiled into the Next.js
build and require a redeploy when changed.

Session routes retain the existing `matmetrics-api` bearer check. For each
allowlisted account, the server forwards only the configured Better Auth
session cookie to the fixed Auth Worker URL. The Worker compares that session
identity to the bearer-authenticated user before issuing a five-minute Keiko
token. The token is signature, issuer, audience, subject, lifetime, and scope
checked by Vercel, then sent only to Keiko. The exchange endpoint lives outside
the `/api/auth/*` rewrite. Browser authentication headers and sign-in flows do
not change.

Run the Markdown importer without `--apply` first. Review parse failures,
duplicate IDs, payload mismatches, and existing records; keep the GitHub
Markdown copy through the rollback window. Do not add a user to
`KEIKO_SESSION_CUTOVER_USER_IDS` until the dry run and import match. Before a
rollback, export the current Keiko D1 data and reconcile writes made since the
import; keep the allowlist change server-side and avoid dual writes.

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

Firebase and Firestore are no longer part of the MatMetrics runtime. Production
data reconciliation found one Firestore preference document, no plugin config
document, one matching D1 preference row, and no D1 plugin overrides. The D1
row is newer, so it remains authoritative; no import or overwrite was needed.
See the [D1 migration record](docs/cloudflare-d1-migration.md) for the comparison
and recovery point. Project retirement still requires checking for other
consumers in the provider console before revoking credentials or deleting
products. The maintainer confirmed the rollback window ended on 2026-10-17;
project-side retirement is not yet verified.

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
