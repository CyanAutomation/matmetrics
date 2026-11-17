# Idempotent create and offline replay

MatMetrics assigns an authenticated session create a UUID generated with the
Web Crypto API. It sends the value in `Idempotency-Key` and stores the same key
on the matching browser queue operation. Guest sessions stay local. Existing
queue entries without a key remain valid and are not assigned a synthetic key
during upgrade.

When the browser is offline, edits may be folded into a keyed CREATE while it
has never been sent. Before the first replay request, MatMetrics persists the
operation as attempted. Any later edit stays behind it as an UPDATE, and an
ambiguous network failure retries the original body with the original key.
Online failures use the same attempted queue path. This prevents a retry from
changing the payload associated with a key.

Keiko scopes keys to the authenticated user. A repeated key and matching
normalized payload returns the original revision-1 response even if the live
session has since changed or been deleted. A repeated key with different
content returns `409 idempotency_key_reuse`; an explicit session ID that
already exists under a different key returns `409 session_conflict`. Keyed
results do not expire, so delayed offline retries cannot create duplicates
after an arbitrary retention window. See the Keiko contract and
[`offline-mutation-safety.md`](./offline-mutation-safety.md) for backend and
browser recovery behavior.

The recovery export preserves a CREATE's key and attempted state so an
operator can identify and replay the exact mutation if browser storage is
recovered manually. Treat that export as session data: it contains the session
payload and should be stored only in an approved private location. The
dashboard does not display idempotency keys.

## Rollout and rollback

1. Apply Keiko migration `0008_session_create_idempotency.sql` and deploy the
   Keiko Worker with the compatible contract.
2. Verify migration 0008 is applied, then exercise keyed create, same-payload
   replay, different-payload key reuse, concurrent duplicate requests, and
   replay after update/delete in a non-production environment.
3. Deploy MatMetrics with the pinned OpenAPI contract and enable its Keiko
   cutover only after the Worker is live.
4. On MatMetrics rollback, keep the Keiko migration and ledger rows. Do not
   enable a MatMetrics client that sends keys before Keiko supports them.

No production migration, deployment, account cutover, or data operation is part
of the implementation change.
