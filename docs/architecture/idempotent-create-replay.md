# Idempotent Create and Offline Replay

MatMetrics persists authenticated creates in its account-scoped browser queue
before starting the create request. Keiko-backed creates use one Web Crypto
UUIDv4 key per logical operation. The key, immutable attempted payload, queue
identity, and timestamp survive a page or browser restart so an uncertain
Keiko response can be replayed safely.

## Server-derived storage mode

An authenticated `GET /api/sessions/create-mode` returns one of:

| Mode | Server decision | Create behavior |
| --- | --- | --- |
| `legacy` | Verified account is not in `KEIKO_SESSION_CUTOVER_USER_IDS` | An unattempted old queue entry has its key removed and is sent through the existing GitHub/Go route. If a legacy create was already attempted and its outcome is uncertain, it is held in Recovery and is not automatically replayed. |
| `keiko-idempotent` | Verified account is allowlisted and `KEIKO_IDEMPOTENT_CREATE_ENABLED=true` | A key is required. An unattempted old keyless entry receives one key which is persisted before the request. The create route and Keiko Worker both enforce the idempotency boundary. |
| `keiko-unavailable` | Verified account is allowlisted but the server rollout switch is off | Create stays in Recovery with its original payload and key. No Keiko create request is sent. |

The mode comes from a server-verified user and server environment. A request
header or body cannot opt an account into Keiko. A mode lookup failure pauses
creates safely; it does not send a key to an unknown backend. Session updates
and deletes remain behind the existing revision checks.

Guest creates remain browser-local. The existing legacy GitHub/Go path remains
available. Keys are removed from a legacy operation only while it is still
unattempted. If a key-bearing operation may already have been sent to a
non-idempotent storage route, MatMetrics preserves it for review rather than
assuming the key deduplicates that backend.

## Write-ahead lifecycle

1. Construct the CREATE payload and generate one secure UUIDv4 key.
2. Persist the operation payload, key, stable queue identity, and timestamp.
   If local storage cannot persist it, `saveSession` rolls back the optimistic
   cache and does not send the request; the form remains open with an error.
3. Resolve the authenticated server create mode. For Keiko, atomically freeze
   the latest queue payload and persist `attempted=true` before network I/O.
   For legacy, remove an unattempted idempotency key, then persist the attempted
   marker before the request.
4. Send the authenticated create. Keiko requests carry the original key.
5. On success, reconcile the authoritative response and remove only that
   operation identity from durable storage. Queue removal failure leaves the
   attempted Keiko create available for safe replay with the same key.
6. Retryable Keiko failures replay the original body and key. A retryable
   legacy failure becomes a review item because legacy storage does not
   deduplicate that request.

The queue lease, cross-tab re-read/merge, stable `(session id, queuedAt)`
identity, and per-session operation ordering remain in place. Any edit after an
attempt remains a separate operation. A restart after request send but before
response or queue removal replays the exact persisted Keiko operation.

## Error codes and Recovery

The browser reads at most 8 KiB from an error response and stores only an
allowlisted code, never the raw server message or response body. Recovery keeps
the HTTP status, retryability, retry-after, mutation identity, and recognized
code.

| Code | Recovery message and action |
| --- | --- |
| `idempotency_key_reuse` | The original key was associated with different session details. Keep the original operation; do not retry with a replacement key. |
| `session_conflict` | Another session already uses that ID. The prior create is not confirmed; inspect session history before resolving it. |
| `revision_conflict`, `revision_mismatch`, `precondition_required` | The saved session revision needs review. Preserve the captured revision and existing recovery options. |
| `idempotency_not_supported` | The create may have reached a route without duplicate protection. Do not resend automatically; inspect session history and export the original operation before resolving it. |
| `idempotency_unavailable` | The create remains saved locally. Retry explicitly after server configuration or availability is restored. |
| Authentication errors | Keep the operation account-scoped and paused until sign-in resumes. |
| Network, HTTP 408, 429, and 5xx on keyed Keiko create | Retry automatically with the same key; honor `Retry-After` when provided. |

Recovery export retains a code when recognized and retains the operation key
only in the export payload. The dashboard does not display raw idempotency
keys. Existing copy/download and explicit discard confirmation remain.

## Production compatibility verification (2026-11-17)

Read-only verification established:

- MatMetrics production Vercel deployment `dpl_A6YFhtYrQPzeDhzHcihnDRZhzzms`
  is READY at commit `c5a0377cebdcb157adfe5935044de61d6ae2ed50`.
- Production Keiko Worker `keiko-dojo` is still at deployment
  `5303f76c-8a56-4151-bdd9-b6b0d69c8c03`, version
  `a7c66220-8a1d-4326-b7e0-0366b87e68c3`, created 2026-10-25. Its deployed
  bundle does not contain the idempotency request/ledger handling.
- Keiko production D1 migration `0008_session_create_idempotency.sql` is
  applied. The `session_create_idempotency` table has a unique primary key on
  `(user_id, idempotency_key)`. This does not prove Worker compatibility.
- Keiko `main` source implements the Phase 2B idempotency feature. MatMetrics'
  generated API contract pins Keiko revision
  `fa4f723028fc78cad8cafdf497ffd43a7eb9f3f5`.
- Production Vercel `KEIKO_SESSION_CUTOVER_USER_IDS` was empty at inspection,
  so authenticated production users were not routed to the incompatible
  Worker.

This is a deployment blocker for enabling Keiko cutover traffic. No production
session mutation was sent during the verification.

## Approved rollout procedure

Do not apply migration 0008 again: it is already present. Do not enable the
MatMetrics rollout switch before the compatible Worker is deployed.

1. In the Keiko repository, identify and review the merged source revision that
   contains the idempotency implementation and confirm it is the intended
   production release. Run `npm test`, `npm run typecheck`,
   `npm run contract:check`, and `npm run check:migrations` there.
2. Confirm the production D1 migration history still shows migration 0008 and
   the expected unique key. Do not run `npm run migrate:production` as part of
   this release because the migration is already applied.
3. After an approved production release, run the Keiko repository's
   `npm run deploy:production` command from its reviewed release checkout.
   This deployment is intentionally not performed by this MatMetrics change.
4. Read the Cloudflare deployment/version status and confirm 100% traffic is
   on the intended revision. Inspect the deployed Worker source or equivalent
   deployment artifact to confirm the `Idempotency-Key` path is live; do not
   infer compatibility from D1 schema state.
5. In a controlled non-production environment, verify same-key/same-payload
   replay, key reuse with different content, concurrent duplicates, and
   replay after update/delete. Do not test against production user sessions.
6. Deploy the MatMetrics application with
   `KEIKO_IDEMPOTENT_CREATE_ENABLED=false`. After route, auth, queue, and
   non-production replay checks pass, enable only the reviewed account
   allowlist and feature flag through the normal approved Vercel release
   process.

## Rollback

Roll back the MatMetrics frontend through the normal Vercel deployment
mechanism if its client behavior regresses. Keep migration 0008 and ledger rows;
never roll back the schema or delete records while clients may retry. Disable
new account cutover only after coordinating queue and user recovery. Keep the
compatible Keiko Worker deployed unless a reviewed backend rollback proves
safe for every active client version.
