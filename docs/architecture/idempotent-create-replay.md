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

## Production verification (2026-11-22)

- Keiko Deploy Production run
  [45049729823](https://github.com/CyanAutomation/keiko-dojo/actions/runs/45049729823)
  applied migration 0009 and deployed version
  `f766d86b-6831-431e-88bf-49732902af1d` at 100% traffic for release SHA
  `8688ccbc953dc74b825a3820cf9ebbb942825bed`.
- Production D1 `keiko-dojo` has migrations `0001`–`0009` applied and 39
  sessions. The GitHub Markdown sync is clean at generation 9:
  `completed_generation = 9`, `full_sync_required = 0`, no dirty items,
  39 manifest entries, and no orphan paths.
- MatMetrics Production deployment
  `dpl_CmjbW2qhzuU3oVopVf4CKVqorsdB` is READY on `main` commit
  `1d96ae8a8871374a9f5bd4b35e76c836d463d987`. The temporary
  `KEIKO_IDEMPOTENT_CREATE_ENABLED` setting is now `false`. The existing
  sensitive `KEIKO_SESSION_CUTOVER_USER_IDS` variable was not changed; its
  value remains undisclosed in this record.
- The approved Production first-create smoke succeeded through Keiko and wrote
  an idempotency ledger row. Its synthetic session was then deleted; the row
  remains by design and the resulting sync completed. Same-key replay and a
  changed-payload `409 idempotency_key_reuse` remain unverified in Production.
- At 17:57 UTC the primary Queue had zero backlog and the DLQ had 732 messages.
  No DLQ messages were pulled, purged, or redriven. Recovery needs a reviewed
  deduplication plan.

The compatible Worker and first keyed create are verified. Keep the rollout
flag false until replay and changed-payload conflict are verified and any
persistent account cutover is separately approved.

## Approved rollout procedure

Migrations 0008 and 0009 are already applied in Production. Do not reapply
or roll back either migration. Keep the MatMetrics rollout switch false until
the Production replay/conflict checks and a separate account-cutover decision
are complete.

1. Before any future Keiko release, verify the GitHub environment's
   `CLOUDFLARE_ACCOUNT_ID` and account-scoped token restrictions. The protected
   workflow preflights the expected resources and permissions before writes.
2. Review the current Keiko `main` commit and confirm CI is green. Dispatch the
   protected **Deploy Production** workflow from `main` when a release is
   needed. It applies only pending forward-only migrations and annotates the
   Worker with the release SHA.
3. Verify the migration ledger and independently confirm the intended Worker
   version is at 100% traffic. Current Production is on release
   `8688ccbc953dc74b825a3820cf9ebbb942825bed`, Worker version
   `f766d86b-6831-431e-88bf-49732902af1d`, with migrations `0001`–`0009`.
4. Keep the contract and integration tests for same-key/same-payload replay
   without duplication; changed payload returning `409 idempotency_key_reuse`;
   concurrent identical creates producing one session; replay after update and
   delete returning the original result; failed requests leaving no ledger row;
   keyless compatibility; user isolation; and no duplicate GitHub sync work.
5. The approved Production first-create smoke succeeded using one synthetic
   record, which was deleted after verification. Same-key replay and changed-
   payload conflict still need Production verification using only a synthetic
   record and the authorized account. Do not use real training sessions or
   create a Production passkey.
6. Keep `KEIKO_IDEMPOTENT_CREATE_ENABLED=false` until the remaining Production
   replay/conflict checks and rollback readiness are reviewed. The existing
   sensitive cutover allowlist was not changed during the first-create smoke.
   A persistent account cutover requires its own owner decision through
   Vercel; it is not part of Keiko deployment.

## Rollback

Roll back the MatMetrics frontend through the normal Vercel deployment
mechanism if its client behavior regresses. Keep migrations 0008–0009 and ledger rows;
never roll back the schema or delete records while clients may retry. Disable
new account cutover only after coordinating queue and user recovery. Keep the
compatible Keiko Worker deployed unless a reviewed backend rollback proves
safe for every active client version.
