# MatMetrics Auth Worker

This Cloudflare Worker hosts Better Auth and binds directly to the existing
MatMetrics D1 database. The data Worker remains the only owner of D1 migration
history; auth tables are introduced by
`workers/matmetrics-data/migrations/0003_better_auth_identity.sql`.

The Vercel app should expose the Worker through a same-origin rewrite at
`/api/auth/*`. Configure the frontend origin, external auth URL, and WebAuthn
RP ID for each deployment. Never use wildcard origins. For development, run
this Worker on a local port and proxy it through the Next.js app running at
`http://localhost:9002`; the RP ID is `localhost`.

Before starting the Worker, apply the additive local migration through the
existing data Worker:

```bash
cd workers/matmetrics-data
npm run migrate:local
```

`wrangler.jsonc` contains localhost defaults for development. Start the data
Worker migration owner first, then run `npm run dev` here. The Next.js app runs
at `http://localhost:9002` and rewrites `/api/auth/*` to the local auth Worker.
Keep the browser-facing URL, trusted origin, issuer, and WebAuthn origin on
that exact frontend origin; `MATMETRICS_AUTH_RP_ID` is `localhost` locally.

Set these Worker secrets locally with Wrangler and in the Cloudflare
environment before deploying:

- `BETTER_AUTH_SECRET`: random server-only Better Auth secret, at least 32
  characters.
- `MATMETRICS_AUTH_CONTEXT_SECRET`: distinct random server-only secret shared
  with Vercel so it can sign short-lived passkey registration contexts after
  Firebase verification.

Production and preview bindings must target the matching D1 database. The
committed database ID follows the current data Worker configuration; replace
it in each deployment environment as already described in
`docs/cloudflare-d1-migration.md`.

Set these non-secret Worker vars for every deployment:

- `MATMETRICS_AUTH_PUBLIC_URL`: the externally visible frontend origin used
  to construct Better Auth URLs and cookies.
- `MATMETRICS_AUTH_FRONTEND_ORIGIN`: the exact browser origin allowed by
  Better Auth and accepted by WebAuthn.
- `MATMETRICS_AUTH_RP_ID`: the hostname used for passkey credentials. It must
  be the frontend hostname or a valid parent domain controlled by the app.
- `MATMETRICS_AUTH_ISSUER`: the issuer encoded in Better Auth service JWTs.
- `MATMETRICS_AUTH_AUDIENCE`: the API audience encoded in those JWTs.

Configure Vercel's `CLOUDFLARE_AUTH_WORKER_URL` as the server-side rewrite
destination and set `MATMETRICS_AUTH_JWKS_URL` to the same-origin
`/api/auth/jwks` URL. Vercel previews have changing hostnames, which cannot
share production passkeys; use a stable preview hostname with isolated
credentials or keep passkey UI disabled there. Never use wildcard trusted
origins.
