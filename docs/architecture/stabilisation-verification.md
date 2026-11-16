# Phase 1 stabilisation verification

Assessment date: 2026-11-16. No application or Worker was deployed and no
remote migration, D1 write, GitHub sync, or reconciliation was performed.

## Implemented in MatMetrics

- Added `SessionSnapshot`, a frontend-only session type carrying a validated
  optional Keiko revision. Normalization retains revisions from Keiko list and
  detail/mutation responses and browser cache.
- Expanded Keiko ETag forwarding to preserve the current strong user-scoped
  revision tag and compatible numeric revision tag.
- Keiko list facade now validates `{session, revision}` and returns the
  revision with each session snapshot. Detail and mutation responses expose
  `keikoRevision`; the value is removed before a request body is sent to Keiko.
- PUT/DELETE now forward the revision read by the client. Their MatMetrics
  route no longer performs a fresh GET immediately before the write. Missing
  preconditions reach Keiko and remain 428; stale writes remain 412.
- Forms retain edit revisions, leave unsaved input open on failures, and show
  specific recovery instructions for 412, 428, 404 and auth errors.
- Offline update/delete operations retain expected revisions. Queue coalescing
  preserves the first read's expected revision. Conflict and auth-blocked
  operations remain persisted, are excluded from automatic retry, and show a
  distinct sync status. Network and transient HTTP failures retain retry
  behavior. Queue replay now returns revision-updated operations immutably and
  preserves the original queue snapshot for cross-tab merge identity.
- The queue replay auth-header callback now uses the same `HeadersInit` input
  and output contract as `getAuthHeaders`.
- Inter is bundled as a local variable font under its SIL Open Font License so
  production builds do not fetch Google Fonts at build time.
- No Keiko code change was necessary. Keiko's implementation already validates
  `If-Match`, checks D1 writes by verified `user_id` and revision, and returns
  the documented conflict statuses.

## Tests and checks

The following focused suites were executed during implementation:

| Check | Result |
| --- | --- |
| Keiko route/gateway and session form controller tests | Passed, including list/detail revision propagation, strong ETag preservation, no pre-write GET, stale update/delete 412 passthrough, missing precondition 428 passthrough, and form input retention. |
| Offline queue and sync-queue tests | Passed, including expected-revision coalescing and durable conflict/auth markers. |
| Storage tests | Passed after correcting the simulated browser test setup to dispatch the offline event; covers direct and queued `If-Match` propagation and omission of frontend revision metadata from the Keiko body. |
| Dashboard utility tests | Passed; conflict and authentication-paused states are distinguishable. |
| Focused ESLint invocation on changed TypeScript files | Passed. |

Final MatMetrics checks on 2026-11-16. The unchanged Keiko tree was checked
on 2026-11-15.

| Check | Result |
| --- | --- |
| MatMetrics `npm run test:all` | Passed: 1,176 tests, plus storage (56) and workflow (26) suites; 0 failures, including the queue snapshot regression test. |
| MatMetrics `npm run typecheck` | Passed with Node 26.13.1, including the Data Worker TypeScript check. |
| MatMetrics `npm run lint` | Passed, including plugin UI contract validation and ESLint. |
| MatMetrics production build | Passed with Node 26.13.1 after switching the existing Inter font to a local variable-font asset. |
| Keiko `npm test` | Passed: 97 tests across 8 files. |
| Keiko `npm run typecheck` | Passed. |

The default workspace runtime is Node 24.19.0 while MatMetrics declares Node
`>=26 <27`; the final production build was run with Node 26.13.1. Inter is now
loaded locally, removing the build-time Google Fonts network requirement.

## Live Cloudflare checks

Using the connected Cloudflare API with read-only requests:

- The production `keiko-dojo` D1 binding is database
  `750315f8-ef51-4d6e-86ea-41b076ec9de8`, matching the Keiko production
  `wrangler.jsonc` binding.
- `d1_migrations` contains migrations `0001` through `0007`;
  `0007_github_session_sync.sql` applied at `2026-10-25 23:30:09 UTC`.
- Production D1 has the migration table and GitHub session sync state/items
  tables expected after 0007.
- Worker `keiko-dojo`'s latest listed deployment was 100% traffic, version
  `a7c66220-8a1d-4326-b7e0-0366b87e68c3`, deployment ID
  `5303f76c-8a56-4151-bdd9-b6b0d69c8c03`, created
  `2026-10-25 23:31:59 UTC`.
- No claim is made here that the MatMetrics Vercel deployment, Auth Worker,
  Data Worker, or their live D1 migration state were independently verified.
  Queue health, dead-letter volume, GitHub installation state and live sync
  status were not queried.

No production resources were changed.

## Remaining limits and safe release sequence

- The client queue uses browser `localStorage`, not the future Companion's
  IndexedDB outbox. Conflict operations are kept locally and surfaced as
  needing review; a full merge/discard workflow is deliberately out of scope.
- Existing clients without revision metadata will receive 428 on Keiko-backed
  edits/deletes until they refresh their session list/detail; the MatMetrics
  form provides a reload path.
- Keiko full GitHub reconciliation remains limited to 500 sessions. Above that
  limit, the job reports `session_limit_exceeded` and does not retry on the
  scheduled dispatcher.
- Keiko Markdown is a user-owned synchronized copy, not an independent
  restorable backup. Migration 0007 removed old snapshot/restore tables.
- Review this branch and PR, run repository CI, then deploy MatMetrics only via
  its usual controlled release. No Keiko deployment is required. Monitor 412,
  428 and auth error rates plus local conflict status after release. Roll back
  only the MatMetrics deployment if needed; do not roll back Keiko migration
  0007 as part of this change.

## Architecture follow-up

See [current state](current-state.md) for source evidence,
[target state](target-state.md) for boundaries/API/auth/Companion guidance, and
[migration roadmap](migration-roadmap.md) for dependencies and rollback
planning. Phase 1 does not create the Companion, retire Data Worker, change
passkey RP IDs, add Keiko idempotency support, or build recovery tooling.
