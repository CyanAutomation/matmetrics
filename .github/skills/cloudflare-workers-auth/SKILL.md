---
name: cloudflare-workers-auth
description: Change MatMetrics Cloudflare authentication or data Workers, signed service requests, D1 migrations, or their tests.
license: MIT
---

# Cloudflare Workers and Authentication

Use this skill for changes to `workers/matmetrics-auth`, `workers/matmetrics-data`, or the server clients and contracts they expose.

## Keep the Worker boundaries clear

- The [auth Worker](../../../workers/matmetrics-auth/src/index.ts) hosts Better Auth and browser-facing authentication. The Next.js app exposes it through the same-origin `/api/auth/*` rewrite. Use the exact configured frontend origin and WebAuthn RP ID; do not add wildcard origins. See the [auth Worker setup guide](../../../workers/matmetrics-auth/README.md).
- The [data Worker](../../../workers/matmetrics-data/src/index.ts) owns signed D1 data endpoints and background jobs. The server client is [data-worker-client.server.ts](../../../src/lib/data-worker-client.server.ts). Its HMAC binds the timestamp, method, path and query, and body hash; preserve the matching checks in the Worker.
- The data Worker owns D1 migration history, including tables used by the auth Worker. Add a new migration for schema changes and use the migration preflight and verification scripts where applicable.
- Keep secrets in server-only runtime configuration as documented: `BETTER_AUTH_SECRET` and `RESEND_API_KEY` belong only in the auth Worker; the signed data and background executor secrets are shared with the Next.js server where required. Never expose these values to browser code or commit them in configuration.
- Before changing JWT issuer, audience, subject, app user ID, expiration, or scopes, inspect both the issuer and the matching verifier/caller. Keiko tokens are a separate scoped service flow from browser session cookies.

## Change workflow

1. Identify which Worker owns the behavior and read its entrypoint, configuration, and nearest tests.
2. Preserve the existing trust boundary: authenticate before using user identity, validate request shape and scope, and keep failure responses free of secrets.
3. For D1 changes, add or update a migration and its preflight or verification coverage. Do not update auth tables outside the data Worker migration history.
4. Add or update Worker-runtime tests for the changed behavior. The auth Worker integration suite uses local D1 migrations and mocks email delivery; it does not send real email.
5. Run the relevant checks:
   - `npm --prefix workers/matmetrics-auth run test` and `npm --prefix workers/matmetrics-auth run typecheck`.
   - `npm --prefix workers/matmetrics-data run test` and `npm --prefix workers/matmetrics-data run typecheck`.
   - `npm --prefix workers/matmetrics-data run test:auth:migration-check` when changing migration checks.

## References

- [Auth Worker setup and deployment notes](../../../workers/matmetrics-auth/README.md)
- [Better Auth configuration](../../../workers/matmetrics-auth/src/auth.ts)
- [Auth Worker tests](../../../workers/matmetrics-auth/test/auth-worker.integration.test.ts)
- [Data Worker](../../../workers/matmetrics-data/src/index.ts)
- [Data Worker tests](../../../workers/matmetrics-data/src/index.test.ts)
- [Server data Worker client](../../../src/lib/data-worker-client.server.ts)
- [D1 migration guidance](../../../docs/cloudflare-d1-migration.md)
- [Better Auth and passkey migration](../../../docs/better-auth-passkey-migration.md)
