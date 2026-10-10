# Better Auth Production Readiness

This audit records the current production state for the incremental Firebase to
Better Auth migration. It separates source-controlled safeguards from checks
made against the deployed Cloudflare and Vercel resources. No migration, secret,
feature flag, or application row was intentionally changed during this audit.

## Gap analysis

Observed on 2026-10-10. D1 queries returned schema names, migration history,
and aggregate row counts only; no account IDs, preference values, credentials,
or session contents were read. The initial audit invoked two SELECT-only SQL
files through `wrangler d1 execute --remote --file`; Wrangler reported zero rows
written but also `changed_db: true` and an advanced D1 bookmark. Follow-up
SELECTs through Cloudflare's direct D1 query API reported `changed_db: false`,
zero rows written, and unchanged schema/history/counts. The initial Wrangler
metadata means this audit cannot claim that no D1-level state changed. The
repeatable scripts below use the direct API and stop unless D1 confirms no
database change and zero rows written.

| Workstream | Current state | Missing work | Risk | Proposed PR |
| --- | --- | --- | --- | --- |
| D1 migration | Production D1 is the configured `matmetrics-data` database. Migration `0004_auth_registration_guards.sql` is recorded as applied at 2026-10-09 20:59:31 UTC; Wrangler reports no pending migrations. The claims/completions tables and both triggers exist. | Keep the repeatable read-only preflight and verification commands in use for future schema changes. The pre-migration cleanup counts cannot be reconstructed from the post-migration database. | The migration deletes legacy registration reservations, orphan Better Auth identity rows, and canonical `app_users` rows without any identity mapping. Current post-migration counts for those categories are zero. | PR A |
| Deployment configuration | Latest Vercel production deployment is `main` at `1893166`. The live auth Worker uses the same D1 database and exact production frontend origin, RP ID, issuer, audience, and JWKS route as the project config. Worker and Vercel passkey flags are all `false`; required Worker secret bindings are present. | Secret values were not read or validated. Project environment settings are verified, but this does not prove every secret works at runtime. | Incorrect secrets or a later environment/config change could break auth despite the current alignment. | PR A |
| Rate limiting | The deployed Worker has a 30-per-minute sign-in limiter and a 10-per-minute registration limiter. Source covers passkey options/verification and JWT issuance. It keys Cloudflare limits with `CF-Connecting-IP`. | Vercel's active custom Firewall configuration lookup returned 404 (“Seawall Config not found”). Add and verify per-client rules for the same-origin Vercel routes before a pilot. | Requests proxied by Vercel can share a Worker-visible egress address. Without Vercel limits, the Worker limiter is only a coarse backstop and may group unrelated browsers. | PR A; operator configuration remains pending |
| Production smoke tests | Read-only production checks returned Worker `/healthz` 200 and same-origin `/api/auth/jwks` 200 with one public key. Worker integration tests cover identity linking, registration-context replay, session/JWT handling, credential rename, second passkey, and final-key deletion. | A controlled Firebase-to-passkey browser journey, protected API/data ownership checks, rollback, and blocked/rate-limited response checks have not been run against production. | A healthy Worker/JWKS does not prove account linking, browser cookies, existing data ownership, or rollback. | PR A |
| Go JWT verification | Source now verifies Firebase RS256 ID tokens and Better Auth EdDSA service JWTs, and attaches a provider-neutral principal with the canonical MatMetrics user ID. Local tests cover issuer, audience, expiry, not-before, signature, identity matching, JWKS failure, unknown keys, and key rotation. | Verify the Go API deployment has the shared JWKS URL, issuer, and audience configured, then run a protected endpoint smoke check after PR B is deployed. | Production Go endpoint acceptance has not yet been demonstrated; missing configuration returns 500 and unavailable signing keys return 503. | PR B |
| Account recovery | A recovery policy is documented; there is no recovery endpoint or administrator grant implementation. | Threat model, operational staffing decision, and an implementation plan with replay protection and audit records. | A passkey-only account could be unrecoverable if its user loses every credential. | PR C |
| Public signup | Worker, Vercel server, and browser signup flags are all off in production. | Keep disabled until a tested recovery process and abuse controls are approved. | Enabling it before recovery and abuse review could create accounts that cannot be recovered or can be created abusively. | PR C |
| Firebase retirement | Firebase remains in browser sign-in, Next.js token verification, registration-context issuance, Go verification, and Firestore fallback code. | Complete the dependency inventory and staged cutover/rollback plan after dual-provider Go support and recovery are ready. | Removing Firebase now could strand existing identities or remove a working fallback. | PR D, planning only |

The production auth registry currently has zero `app_users`, zero
`auth_identities`, and zero Better Auth user rows. D1 contains one preference
row. Those aggregate counts do not establish ownership for that preference or
prove historical data preservation; the production account journey remains
pending. GitHub-backed training sessions were not queried or changed.

## Production configuration observed

The Vercel production hostname is `matmetrics-teal.vercel.app`. Its latest
production deployment is `main` at commit `1893166` (`Fix stale session history
after login`, #845). The production project settings contain:

- `CLOUDFLARE_AUTH_WORKER_URL` pointing to `matmetrics-auth-production`.
- `MATMETRICS_AUTH_JWKS_URL` pointing to the same-origin `/api/auth/jwks` route.
- Issuer `https://matmetrics-teal.vercel.app` and audience `matmetrics-api`.
- `NEXT_PUBLIC_BETTER_AUTH_ENABLED=false`.
- Enrolment and public-signup flags set to `false` in both server and browser
  configuration.

The deployed Worker uses:

- Public URL, frontend origin, and issuer `https://matmetrics-teal.vercel.app`.
- RP ID `matmetrics-teal.vercel.app` and audience `matmetrics-api`.
- Sign-in, enrolment, and signup flags set to `false`.
- The same D1 database UUID configured by `workers/matmetrics-data`.
- Rate-limit bindings of 30 requests per 60 seconds for sign-in and 10 per 60
  seconds for registration.

The live Worker health route and public JWKS endpoint both returned HTTP 200.
The Vercel Firewall API did not return an active custom-rule configuration, so
the browser-facing abuse controls are not verified as deployed. Treat the
rules below as required operator setup before a production pilot.

## D1 preflight and verification

The data Worker remains the sole owner of D1 migration history. The scripts in
`workers/matmetrics-data/scripts/` issue only `SELECT` statements and return
aggregate counts or schema/migration check results; they do not expose account
IDs or row contents.

From `workers/matmetrics-data`, first provide `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_D1_DATABASE_ID` through the operator's
secure environment or secret manager. The API token should have the minimum
Cloudflare D1 permissions needed to run queries. Do not put token values in
commands, files, or logs. The database ID must match the `matmetrics-data`
binding in the Worker configuration. Then use these checks before any remote
migration:

```bash
npm ci
npm run migrate:remote:list
npm run auth:migration:preflight
```

The preflight calls Cloudflare's D1 query API directly for each statement. It
accepts only SQL statements beginning with `SELECT`, rejects redirects, and
fails unless every response reports `changed_db: false`, `rows_written: 0`,
and `changes: 0`. Do not substitute `wrangler d1 execute --remote --file` for
these checks: during this audit Wrangler reported `changed_db: true` for
SELECT-only files even though it reported zero rows written.

The preflight count is meaningful as a pre-migration estimate only while
`0004_auth_registration_guards.sql` is still pending. Review every non-zero
count before applying it. That migration deletes all rows from
`auth_registration_contexts`, deletes Better Auth identity rows with no
matching Better Auth user, then deletes any `app_users` rows left with no
identity mapping. It does not modify `user_preferences` or GitHub-backed
Markdown session records.

For an approved production migration, keep an encrypted export outside the
repository and record a D1 Time Travel bookmark before applying SQL:

```bash
npx wrangler d1 time-travel info matmetrics-data
npx wrangler d1 export matmetrics-data --remote --output=/secure/path/matmetrics-data-before-migration.sql
chmod 600 /secure/path/matmetrics-data-before-migration.sql
shasum -a 256 /secure/path/matmetrics-data-before-migration.sql
```

Replace `/secure/path` with an access-controlled backup location. Do not store
the export in the repository: it contains production data. D1 Time Travel
retention depends on the account plan; confirm the available window before a
change. A Time Travel restore overwrites the database and must be treated as a
separate recovery operation. See [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
and [D1 export guidance](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Only after reviewing the complete pending migration list, cleanup counts,
backup, and rollback plan should an operator apply remote migrations. Wrangler
applies all pending migrations in order, so review every pending file, not only
`0004`:

```bash
npx wrangler d1 migrations apply matmetrics-data --remote
npm run auth:migration:verify
npm run migrate:remote:list
```

The verification command uses the same direct API and unchanged-database
assertions. It exits unsuccessfully if any expected migration/schema check
fails or if D1 reports a write or database change.

The last command should report no migrations to apply. The verification SQL
checks the `0004` history row, both registration tables, and both guards.
Migration application is **not** performed by Worker deployment. Current
production verification found `0004` applied and no migrations pending, so no
operator action is needed for migration `0004` itself.

Cloudflare recommends Wrangler configuration as the source of truth. A normal
deploy can replace dashboard-managed Worker variables with values in
`wrangler.jsonc`; secrets are managed separately. Keep production variables in
the production environment block and verify their live values after deploy.
See [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

## Vercel Firewall operator setup

In the MatMetrics Vercel project, open **Firewall → Custom Rules** and add one
rate-limit rule for each row below. Match the production host exactly as well
as the method and path, count by Vercel's client IP, and configure the
over-limit response to return HTTP 429. Keep the rules narrow to the listed
routes; do not include preview hosts. The current Vercel custom Firewall config
was not found during the audit, so these rules have not been represented as
already configured.

| Method | Production path | Limit |
| --- | --- | --- |
| `GET` | `/api/auth/passkey/generate-authenticate-options` | 30 requests per 60 seconds per client IP |
| `POST` | `/api/auth/passkey/verify-authentication` | 30 requests per 60 seconds per client IP |
| `GET` | `/api/auth/token` | 30 requests per 60 seconds per client IP |
| `GET` | `/api/auth/passkey/generate-register-options` | 10 requests per 60 seconds per client IP |
| `POST` | `/api/auth/passkey/verify-registration` | 10 requests per 60 seconds per client IP |
| `POST` | `/api/passkey/registration-context` | 10 requests per 60 seconds per client IP |

The Better Auth passkey endpoints use `GET` for options and `POST` for
verification in the installed `@better-auth/passkey` 1.7.7 client. JWT issuance
uses `GET /token`. The Worker rate limits the first five routes; the
registration-context route is served by Next.js and needs the Vercel rule.
Vercel's custom rate-limit rule needs an explicit follow-up mitigation; select
the 429 response action rather than relying on the default. See [Vercel WAF
custom rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)
and [Firewall rule CLI options](https://vercel.com/docs/cli/firewall).

After adding the rules, verify each route from an approved test client and
confirm the threshold response is HTTP 429. Confirm normal requests from a
second client still succeed. Monitor shared-NAT users: IP-based limits can
group users behind the same public address, so adjust the threshold if the
observed false-positive rate is too high. Do not test by repeatedly submitting
real users' credentials.

## Read-only production preflight

Run the automated read-only probes from the repository root:

```bash
npm run auth:production:preflight
```

The script performs only `GET /healthz` against the auth Worker and
`GET /api/auth/jwks` through the production Vercel origin. It checks response
status and response shape without printing public key material. Override the
origins when checking another environment with
`BETTER_AUTH_SMOKE_APP_ORIGIN` and `BETTER_AUTH_SMOKE_WORKER_ORIGIN`.

This preflight does not sign a user in, write registration state, test rate
limits, or inspect application data. A full journey still needs an explicitly
approved test account and an available passkey-capable browser. Use the
controlled pilot and rollback checklist in
[Better Auth Passkey Migration](better-auth-passkey-migration.md#3-run-the-production-smoke-test-with-one-controlled-firebase-account).

## Phase status and next work

PR A now adds the read-only D1 migration preflight/verification SQL, a
repeatable health/JWKS probe, and deterministic Worker rate-limit policy tests.
The Firewall rules and the account-based browser journey remain operator
actions. Do not enable the passkey flags or public signup until the Firewall
rules and controlled pilot checks are complete.

PR B adds Better Auth JWT/JWKS verification to the Go API while retaining
Firebase compatibility. Configure and smoke-test the Go API after deployment
before treating the production verifier path as validated. Account recovery
and Firebase retirement remain separate gated phases; no Firebase removal
belongs in PR A or PR B.
