# Current architecture

Assessment date: 2026-11-22. This describes the repository code and the
production checks recorded below; source configuration is not treated as proof
that a component is deployed.

## Summary

MatMetrics is a Next.js application with a same-origin API facade. Its session
backend depends on the account's cutover status: allowlisted identities use
Keiko D1 as the session authority, while other signed-in identities retain the
legacy GitHub Markdown path. Guest mode remains browser-local. The Auth Worker
owns Better Auth identities and passkeys. A separate Data Worker owns user
preferences, plugin overrides, and legacy background jobs; it shares the Auth
Worker's D1 database. Keiko has its own Worker, D1, GitHub App connection, and
Queue pipeline.

For Keiko accounts, session list responses contain a revision per record. The
MatMetrics facade now retains that value as frontend-only `keikoRevision`
metadata and writes use it as `If-Match`. The Keiko API remains authoritative
for tenant checks, validation, and conditional persistence.

## Components and deployment evidence

| Component | Current responsibility and boundary | Evidence and production status |
| --- | --- | --- |
| MatMetrics Web | Next.js UI, same-origin API handlers, auth token verification, session form/history, preferences and plugin clients. Hosted configuration is Vercel-oriented. | Production deployment `dpl_CmjbW2qhzuU3oVopVf4CKVqorsdB`, READY, branch `main`, commit `1d96ae8a8871374a9f5bd4b35e76c836d463d987` (PR #947). The rollout flag is `false`. |
| MatMetrics Auth Worker | Better Auth email/password and passkey endpoints, JWT/JWKS, short-lived Keiko token exchange, auth email dispatch. | Active Worker `matmetrics-auth-production`, deployment `c5982317-c5c0-48f5-8c55-43c30764cd43`, version `16358726-666b-456f-913c-dcbea199e884` at 100% traffic since 2026-11-18. Read-only settings confirm production environment, current MatMetrics origin, RP ID, issuer/audience, and the expected `matmetrics-data` D1 binding. Version metadata has no source commit SHA, so code provenance is not established. Follow-up read-only GETs on 2026-11-21 returned `{"ok":true}` from `/healthz` and a JWKS containing a public EdDSA key. |
| MatMetrics Data Worker | Signed per-user preference and plugin-override API; persisted `log-doctor-scan` and `github-health` jobs. | `workers/matmetrics-data/src/index.ts`, `wrangler.jsonc`, `migrations/`. Source config names `matmetrics-data`; live status was not queried. |
| Keiko Dojo Worker | Versioned REST API, session domain service, analytics, GitHub App integration and jobs, read-only MCP endpoint. | Protected Deploy Production run [45049729823](https://github.com/CyanAutomation/keiko-dojo/actions/runs/45049729823) succeeded on 2026-11-22. Production version `f766d86b-6831-431e-88bf-49732902af1d` is at 100% traffic for release SHA `8688ccbc953dc74b825a3820cf9ebbb942825bed`; migration 0009 and Queue consumer reconciliation passed. |
| Keiko D1 | Authoritative session records for Keiko-routed accounts; revisioned rows and GitHub sync state. | Production D1 `keiko-dojo`, ID `750315f8-ef51-4d6e-86ea-41b076ec9de8`, has migrations `0001`–`0009` applied and 39 sessions. Sync generation 9 is complete with 39 manifest entries, no dirty items, and no orphan paths. |
| MatMetrics D1 | Better Auth tables, user preferences, plugin overrides, and legacy background-job records. Auth and Data Worker configs point to the same D1 ID. | `workers/matmetrics-auth/wrangler.jsonc`, `workers/matmetrics-data/wrangler.jsonc`, `workers/matmetrics-data/migrations/`. Live Auth/Data Worker bindings and migration state were not queried. |
| GitHub Markdown | User-selected, portable copy. For Keiko accounts it is asynchronously derived from D1; for legacy accounts it remains the session persistence path. | Keiko `src/http/github-sync.ts`; MatMetrics `src/lib/session-storage.ts`, `src/lib/github-storage.ts`. It is not a transactional database or a D1 restore source. |
| Go API and CLI | Go source contains protected session and GitHub HTTP handlers plus CLI and shared Markdown/session libraries. Next routes can proxy selected-repository operations through `/api/go/*`. | `api/go/`, `internal/`, `go/`; `src/lib/go-function-proxy.ts`. The exact deployed Go handler target was not independently checked. |

Cloudflare returned Keiko D1 tables for sessions, GitHub connections,
operation jobs, sync state/items, and the sync manifest. The dashboard's D1
database-list `num_tables` field did not agree with the read-only SQLite query,
so table counts are taken from the query, not that summary field. Production
migration 0009, deployment, smoke-record cleanup, and the resulting sync are
documented in the Phase 2B production verification below.

## Phase 2B production compatibility

MatMetrics Production is on deployment `dpl_CmjbW2qhzuU3oVopVf4CKVqorsdB`,
READY on `main` commit `1d96ae8a8871374a9f5bd4b35e76c836d463d987` (PR #947).
Its current Production setting `KEIKO_IDEMPOTENT_CREATE_ENABLED` is
`false`. The sensitive `KEIKO_SESSION_CUTOVER_USER_IDS` variable was left
unchanged; its value is not disclosed here.

Protected Keiko Deploy Production run
[45049729823](https://github.com/CyanAutomation/keiko-dojo/actions/runs/45049729823)
applied migration 0009 and deployed Worker version
`f766d86b-6831-431e-88bf-49732902af1d` at 100% traffic for release SHA
`8688ccbc953dc74b825a3820cf9ebbb942825bed`. Production D1 has migrations
`0001`–`0009`, 39 sessions, and a clean GitHub mirror: sync generation 9 is
complete, the full-sync flag is clear, all 39 manifest entries are present,
and there are no dirty items or orphan paths. The primary Queue had no backlog
at 17:57 UTC; the DLQ had 732 messages and was not pulled, purged, or redriven.

The authorized Production smoke created one synthetic keyed session through
the MatMetrics account and Keiko. D1 recorded the idempotency ledger row; the
synthetic session was removed and the resulting GitHub sync completed. The
ledger row remains by design. Same-key replay and changed-payload
`409 idempotency_key_reuse` have not been verified against Production. The
temporary rollout flag is now `false`, so the route stays fail-closed unless
a later reviewed rollout explicitly enables it.
