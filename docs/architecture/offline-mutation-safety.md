# Offline Mutation Safety and Recovery

Phase 1.1 keeps rejected session mutations available in the account-scoped
browser queue until they sync or the user explicitly discards them. The queue
remains in `localStorage`; this work does not add an offline database or an
automatic conflict merge.

## Failure handling

| Failure | Queue state | Automatic retry |
| --- | --- | --- |
| Network interruption, HTTP 408, 429, or 5xx | Pending | Yes; 429 honors `Retry-After` when supplied |
| HTTP 401 or 403 | Authentication paused | Resumes after the authenticated session is available; another rejection pauses it again |
| HTTP 404, 409, 412, or 428 | Conflict | No; preserve the originally captured Keiko revision |
| Other permanent HTTP response, including 400 and 422 | Rejected | No |

Permanent failures retain the original operation payload, queue timestamp,
expected revision, and later operations. They do not clear dirty mutation state.
Later work for the same session stays behind the failed operation, while
independent sessions can continue. Authentication recovery only resumes
authentication-paused operations; it does not clear conflict or rejection
markers. A 409 create remains recoverable. `idempotency_key_reuse` and
`session_conflict` are shown separately: the former means the original key was
associated with different content; the latter means another session already
owns the requested ID, and neither message claims the prior create succeeded.

Authenticated creates are persisted to the queue before the server mode probe
or first create request. Keiko creates persist their key and attempted marker
before sending. A write failure rolls the optimistic cache back, prevents the
create request, and leaves the form open with a storage error. A mode or
authentication failure keeps the operation in Recovery; a legacy create that
may already have been sent is never replayed automatically without
idempotency. Online updates and deletes retain their existing classification:
a failed update stays visible in the queue and a failed delete is restored
locally with its deletion intent retained.

## User recovery

The dashboard recovery panel lists pending and paused operations, identifies
the session and failure category, and supports JSON download or copy. The
export includes the captured payload and safe revision metadata, but omits
cookies, bearer tokens, and internal authentication values. It is a recovery
artifact only; importing it is out of scope.

Users can explicitly retry eligible pending work. Failed work is not offered a
blind retry or revision overwrite. A failed operation can be discarded from
the panel after confirmation; discard removes only that queue identity and
restores the pre-edit session when the operation recorded one. The user can
keep a copy through export before discarding.

## Storage, account scope, and compatibility

Queue and session-cache keys are scoped to the active account. Startup rebuilds
the optimistic cache from that account's queue, so a reload does not hide a
queued create or restore an unresolved delete incorrectly. Queue updates keep
the immutable replay baseline used by cross-tab merge logic. Corrupt queue
contents are quarantined before the queue key is cleared; failed queue writes
surface a storage-unavailable state instead of claiming that work was saved.

`localStorage` can be cleared by the user or browser, is subject to quota and
browser storage policy, and is not a server backup. If both the primary queue
and browser storage are unavailable, the app cannot guarantee persistence;
the form remains open where possible and reports the error. The dashboard can
export entries only while they remain readable from the browser queue.

Older queued deletes may not include the session snapshot added in Phase 1.1.
The app allows discard only after an authoritative session-list refresh
succeeds. While offline or when that refresh fails, the operation stays in
Recovery because the app cannot reconstruct the missing session details from
the delete entry alone. The Recovery panel labels this as an unresolved
deletion and explains that there is no saved session copy; the ordinary history
does not invent a session when its details are unavailable. A successful
authoritative refresh repopulates the history when the session still exists.
The original operation identity and revision remain attached until the user
discards it after confirmation or otherwise resolves it.

Authentication resume is coordinated by the storage orchestration layer. It
first persists the removal of authentication-paused markers, then clears only
matching in-memory authentication issue markers. If persistence fails, the
dirty state remains paused. Conflicts, permanent rejections, operation
identity, expected revisions, and account scoping are preserved.

Manual retry uses the same eligibility helper as the queue runner. A failed
operation blocks later work for its own session, while unrelated sessions
remain eligible. Conflict and rejection states cannot be bypassed by the Retry
button.

Keiko writes continue using the originally observed revision in `If-Match`.
This phase does not fetch a new revision to force a rejected write. Guest
storage and legacy GitHub-backed storage keep their existing routes; the queue
remains `localStorage` until the Companion offline foundation evaluates
IndexedDB.

## Production smoke-test plan

These steps are for an authorised dedicated test account and disposable test
data. They were not run as part of this change; no production session was
created, updated, or deleted.

1. Sign in to the deployed MatMetrics app with the dedicated test account.
2. Create a disposable session and open that session in two separate browser
   contexts.
3. Update the session in the first context. In the second, submit an edit
   based on the older revision; expect a conflict and verify the attempted
   values remain visible in recovery and export.
4. Make a disposable edit while offline, reconnect, and verify the queue shows
   either success or a visible paused conflict without losing the payload.
5. Expire authentication with a disposable pending edit. Verify it remains
   authentication-paused until sign-in, then verify that a fresh authorization
   attempt either syncs or pauses again without losing the payload.
6. Download or copy a recovery export and confirm it contains the operation
   payload and safe issue/revision fields, with no credentials.
7. Discard only the disposable failed operation after confirmation and verify
   that other queue entries remain.
8. Remove the disposable session using the approved test-account cleanup
   procedure and verify the final state in both contexts.

## Deferred work and remaining risks

The queue still depends on browser `localStorage`; IndexedDB drafts/outbox,
quota-pressure recovery, and device-level process-kill rehearsals belong to
the Companion offline foundation. Keiko create idempotency is implemented in
source and pinned by MatMetrics, but production traffic must stay off until
the compatible Keiko Worker deployment is verified. The browser write-ahead
queue preserves the key and payload across reloads. This phase does not
provide queue import, automatic conflict merge, or server-side restoration.
