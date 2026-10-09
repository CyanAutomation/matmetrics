# MatMetrics Auth Worker

This Cloudflare Worker hosts Better Auth and binds directly to the existing
MatMetrics D1 database. The data Worker remains the only owner of D1 migration
history. Auth migrations live in
`workers/matmetrics-data/migrations/`; migration `0004` adds registration
claims/completions and a database trigger that prevents deleting a user's final
passkey, including concurrent deletes.

The Vercel app exposes the Worker through a same-origin rewrite at
`/api/auth/*`. The browser keeps a host-only session cookie on the MatMetrics
origin. Configure an exact frontend origin and matching WebAuthn RP hostname;
do not use wildcard origins. For local development, proxy this Worker through
the Next.js app on `http://localhost:9002` and use RP ID `localhost`.

## Local setup

Apply the additive schema using the data Worker migration owner:

```bash
cd workers/matmetrics-data
npm run migrate:local
```

Then start the data Worker migration owner and the auth Worker (`npm run dev`)
and Next.js app. The auth Worker package commands are:

```bash
npm ci
npm test
npm run typecheck
```

The Vitest suite uses Cloudflare's Worker runtime and D1, loads the real data
Worker migrations, and invokes the Worker entrypoint. It does not add a
production authentication bypass.

## Secrets and variables

Set these Worker secrets locally with Wrangler and in each Cloudflare
environment before deploying:

- `BETTER_AUTH_SECRET`: random, server-only Better Auth secret of at least 32
  characters.
- `MATMETRICS_AUTH_CONTEXT_SECRET`: separate random, server-only secret shared
  with Vercel to sign short-lived registration contexts.

Set these non-secret values for each deployment:

- `MATMETRICS_AUTH_PUBLIC_URL`: externally visible frontend origin used for
  Better Auth URLs and cookies.
- `MATMETRICS_AUTH_FRONTEND_ORIGIN`: exact browser origin trusted by Better
  Auth and WebAuthn.
- `MATMETRICS_AUTH_RP_ID`: frontend hostname or controlled parent domain.
- `MATMETRICS_AUTH_ISSUER` and `MATMETRICS_AUTH_AUDIENCE`: service JWT claims.
- `MATMETRICS_PASSKEY_SIGNIN_ENABLED`: allows passkey authentication and
  service JWT issuance from an authenticated Better Auth session.
- `MATMETRICS_PASSKEY_ENROLMENT_ENABLED`: allows Firebase-linked and
  authenticated-user passkey enrolment.
- `MATMETRICS_PASSKEY_SIGNUP_ENABLED`: allows public passkey-only account
  creation. Keep false for this pilot.

The committed local config enables sign-in/enrolment and leaves signup off.
Production config defaults all three Worker flags to false. The browser also
uses `NEXT_PUBLIC_BETTER_AUTH_ENABLED`,
`NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED`, and
`NEXT_PUBLIC_PASSKEY_SIGNUP_ENABLED`; these control UI visibility, while
Worker/Vercel server flags enforce policy. See
[`docs/better-auth-passkey-migration.md`](../../docs/better-auth-passkey-migration.md)
for the exact rollout and rollback steps.

Vercel needs `CLOUDFLARE_AUTH_WORKER_URL`,
`MATMETRICS_AUTH_CONTEXT_SECRET`, `MATMETRICS_AUTH_JWKS_URL`,
`MATMETRICS_AUTH_ISSUER`, and `MATMETRICS_AUTH_AUDIENCE`. It also needs the
server-side enrolment/signup flags to match the Worker. Keep `BETTER_AUTH_SECRET`
only in Cloudflare.

## Rate limiting and production deployment

Cloudflare Rate Limiting bindings protect passkey sign-in (30 requests/minute)
and registration challenge endpoints (10 requests/minute), keyed by
`CF-Connecting-IP`. Cloudflare sets this from its network peer; direct Worker
requests use the caller IP, while requests proxied through Vercel may share
Vercel egress IPs. Treat the Worker limit as a coarse guard for proxied traffic,
not a per-browser limit. Add Vercel Firewall rules for the browser-facing
passkey and registration-context paths before the production pilot; see the
migration guide for paths and thresholds. Forwarded client-IP headers are not
trusted by the Worker. A rate-limit service failure fails closed with HTTP 503. The limits are per-location approximations, not exact global quotas.
Confirm the configured namespace IDs are unique in the target Cloudflare
account before deployment.

Apply production D1 migrations through `workers/matmetrics-data`, then deploy
the Worker with production flags off:

```bash
cd workers/matmetrics-data
npm run migrate:remote
cd ../matmetrics-auth
npm ci
npx wrangler deploy --env production
```

Set production Worker secrets with Wrangler. Before the existing-user pilot,
configure the production Worker sign-in and enrolment flags and matching
Vercel flags as described in the migration guide. Keep public signup off. Add
and test the Vercel Firewall rules before enabling the pilot; the Vercel
rewrite and registration-context route are outside the Worker's per-browser
visibility.

Better Auth's generic SQLite schema introspection does not correctly discover
the D1 tables in the Cloudflare test runtime, so auth config disables that
generic check. The integration suite validates the actual schema by applying
the versioned migrations to D1 before tests.
