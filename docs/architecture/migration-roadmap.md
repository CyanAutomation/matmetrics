# Architecture migration roadmap

## Phase 1 — Stabilisation (current branch)

**Work completed in this change:** document the current owners and verified
deployment evidence; carry Keiko revisions through list/detail, edit/delete,
and offline replay; forward conditional writes without a pre-write GET; retain
stale/auth-blocked queue entries; expose conflict/auth-paused sync status.

**Backend dependency:** none. Keiko already implements user-scoped revision
checks, quoted revision compatibility, 412 stale responses, and 428 missing
preconditions. No Keiko source change, coordinated PR, migration, or deployment
is required.

**Compatibility:** legacy GitHub/Go and guest paths keep their existing SHA or
local behavior. An older MatMetrics client can still call Keiko, but only the
updated client sends its captured revision and gets lost-update protection.
On rollback to old MatMetrics code, the blind-write defect returns for that
client.

## Phase 1.1 — Offline mutation safety and recovery

**Implementation complete:** rejected direct and queued mutations remain in
the account-scoped browser queue with a typed issue, original payload, and
original Keiko revision. The dashboard provides status, recovery export, safe
pending retry, and confirmed discard. Storage failures do not claim that work
was queued. The repeatable production smoke-test plan is documented in
[`offline-mutation-safety.md`](./offline-mutation-safety.md); production
verification remains outstanding and must use a dedicated authorised test
account.

**Follow-up dependencies:** the Companion offline foundation should evaluate
IndexedDB for drafts and quota resilience. Phase 2B now defines the Keiko
idempotency contract; its production Worker rollout remains a prerequisite
before keyed traffic is enabled.

## Phase 2A — Canonical Keiko contract and Web integration

**Implementation in this branch:** Keiko owns the validated OpenAPI contract and
versioning rules. MatMetrics pins the contract to an immutable Keiko commit,
generates its TypeScript API types in CI, and uses a typed Fetch client at the
existing server-side Keiko boundary. Session list/detail/create/update/delete
remain behind same-origin MatMetrics routes and the current Better Auth token
exchange. The Phase 1.1 recovery follow-ups keep snapshot-less deletes visible,
resume auth-paused work after durable queue updates, and allow independent safe
operations to retry.

**Implementation complete.** Phase 2B adds the Keiko create idempotency
contract and the MatMetrics keyed create/replay flow. Its coordinated changes
are in the Keiko and MatMetrics branches. Deploy the Keiko migration and Worker
before enabling the MatMetrics client. No production deployment or migration
was performed as part of this work.

## Phase 2B — Idempotent Session Creation & Safe Offline Replay

**Implementation complete:** Keiko stores a per-user idempotency ledger and the
immutable original revision-1 result in the same D1 transaction as the session.
MatMetrics pins that OpenAPI contract, sends one cryptographic key per logical
create, and preserves it with queued retries and recovery exports. Unattempted
offline creates can absorb edits; after the first send is persisted, later edits
stay separate operations. Details and rollout checks are in
[`idempotent-create-replay.md`](./idempotent-create-replay.md).

**Rollout:** apply Keiko migration 0008 and deploy the Worker before enabling
MatMetrics code that sends idempotency keys. Keep MatMetrics cutover disabled
until Keiko is live. Rollback MatMetrics while retaining the additive ledger;
never roll back the database schema or delete ledger rows while old clients may
retry.

**Production check (2026-11-17):** migration 0008 and the unique
`(user_id, idempotency_key)` table exist in production D1. MatMetrics production
is at commit `c5a0377cebdcb157adfe5935044de61d6ae2ed50`, but active Keiko
deployment `a7c66220-8a1d-4326-b7e0-0366b87e68c3` predates the contract and
does not implement it. Production cutover allowlist is empty, so current users
are not routed to that unsupported Worker. See
[`idempotent-create-replay.md`](./idempotent-create-replay.md) for the approved
Keiko deployment and verification procedure.

## Phase 2B.1 — Durable mutation recovery

Authenticated create operations are persisted before the server create-mode
probe or first create request. Keiko creates persist their UUID key and frozen
attempt marker before sending. The authenticated mode endpoint derives
`legacy`, `keiko-idempotent`, or `keiko-unavailable` from the verified account
and server rollout flag. Legacy ambiguous creates are held for review instead
of replayed as if the legacy backend were idempotent. Recognized bounded
Keiko error codes are preserved and rendered distinctly in Recovery.

The feature switch remains off by default. The Keiko deployment blocker above
must be resolved before any cutover account is enabled.

## Phase 2C — Contract and auth-domain readiness

**Implementation prepared:** exact configured frontend-origin parsing now
supports explicitly approved additional origins under one RP ID. The current
origin, issuer, RP ID, cookie scope, Auth Worker, and production trusted-origin
list remain unchanged by default. The domain options and pending ownership
decisions are recorded in
[`adr-companion-domain-auth.md`](./adr-companion-domain-auth.md); the passkey
recovery and migration sequence is in
[`passkey-domain-migration.md`](./passkey-domain-migration.md).

**Still requires approval:** permanent domain, DNS/routing owner, future RP ID,
auth service origin/issuer strategy, and staged passkey migration. No Companion,
new auth Worker deployment, production origin, identity change, or passkey
operation is part of this phase.

**Pre-Companion checklist:** approve the domain and deployment owner; complete
the staged passkey rehearsal with test accounts; verify independent Web and
Companion route/caching/PWA scopes; deploy the compatible Keiko Worker; then
review the Companion foundation plan.

## Phase 3 — Companion offline client

1. Build the separate mobile-first PWA after auth-domain and OpenAPI decisions.
2. Implement IndexedDB drafts/outbox, stable mutation IDs, idempotent create,
   auth-resume, retry/backoff and user-visible conflict states.
3. Run two-client acceptance scenarios for edit/edit, edit/delete,
   offline/reconnect, expired auth, duplicate replay and account switching.
4. Export and recover local drafts through app restart, browser process kill,
   storage quota pressure and deployment upgrades.

**Dependencies:** Phase 2C auth/API decisions and the Phase 2B Keiko
idempotency support.
**Rollback:** disable the Companion entry route or release while leaving Keiko
records and the Web client untouched; never delete queued local drafts during
rollback.

## Phase 4 — Deliberate account cutover and Data Worker review

1. Migrate one account cohort at a time from legacy GitHub session storage to
   Keiko, with a verified count, IDs, content comparison, and a documented
   rollback window.
2. Keep GitHub repository authorization and user-owned Markdown continuity
   explicit; do not infer account routing from client-supplied repository data.
3. Inventory preference, plugin override, and Data Worker job consumers.
4. Select a separate destination for each state type. Preserve Auth D1 tables,
   migration history, and queue job status before retiring the Data Worker.
5. Retire only after traffic, scheduled consumers, job histories, and rollback
   dependencies are verified absent.

**Dependencies:** migration tooling, per-account runbook, reconciliation
checks, and an approved recovery plan. **Rollback:** retain readable legacy
Markdown and the previous route until writes to Keiko are verified; never
dual-write without idempotency and reconciliation.

## Phase 5 — Recovery and operational hardening

1. Specify separate recovery flows for D1 point-in-time restore, a user's
   deleted-session recovery, and rebuilding selected sessions from Markdown.
2. Add dry-run import, duplicate detection, ownership validation, schema
   validation, audit trail, and a tested rollback before any restore tool is
   exposed.
3. Revisit the full reconciliation ceiling. Keiko currently limits full
   reconciliation to 500 sessions; over-limit work records
   `session_limit_exceeded`, acknowledges the queue message, and scheduled
   dispatch excludes that state from retry. The initiating job fails and
   requires operational/product remediation or an explicit retry after the
   limit is addressed.
4. Add operational dashboards for queue age, dead-letter volume, sync lag,
   session-limit failures, and failed GitHub operations.

**Dependencies:** product recovery policy, GitHub data semantics, D1 recovery
testing, and Cloudflare operational access. **Rollback:** keep recovery tooling
read-only until dry-runs and restore rehearsals pass; do not treat a GitHub
Markdown commit as a D1 snapshot.

## Deployment and rollback for Phases 2B.1 and 2C

- This MatMetrics change does not deploy production code, apply remote
  migrations, change authentication identity settings, alter DNS, or enable
  account cutover.
- Keiko production migration 0008 is already applied. Deploy the reviewed
  Keiko Worker version that implements the pinned idempotency contract before
  enabling `KEIKO_IDEMPOTENT_CREATE_ENABLED` or adding a cutover account. The
  production procedure is in [`idempotent-create-replay.md`](./idempotent-create-replay.md).
- Keep the production allowlist empty and the create feature switch false
  until the Keiko deployment is verified. Existing production accounts
  continue to use legacy routes under the current allowlist state.
- After review and merge, deploy MatMetrics through the normal Vercel release
  process. Roll back the frontend normally if queue or Recovery behavior
  regresses; retain Keiko migration 0008 and all idempotency ledger rows.
- Do not activate additional Auth Worker origins or change RP ID, issuer,
  cookie scope, secrets, or production identity configuration as part of this
  release. Follow the staged plan in
  [`passkey-domain-migration.md`](./passkey-domain-migration.md) after domain
  and routing ownership are approved.

## Phase 2C.1 — Production release readiness (2026-11-21)

This is the current evidence gate for Phase 3A. Repository documentation is
not deployment proof; status below is based on current repository checks and
read-only Cloudflare/Vercel inspection.

| Dependency | Status | Evidence and remaining work |
| --- | --- | --- |
| MatMetrics CI | Complete and verified | Current `main` commit `43c746e0de0e6400a99008c050a126e66d9f99be` includes PR #945. `npm run test:all`, typecheck, lint, build, and Keiko API pin check pass locally. The test suite includes 74 storage tests and the task-draining teardown regression. Production Vercel is READY on this same commit. |
| Keiko CI | Complete and verified locally | Required security audit, tests, typecheck, generated Worker types, OpenAPI contract, and local migrations pass on reviewed `main` `aa5ee1bc61254b93abe8d431844d1da031035dd`. The existing 2026-11-18 deployment run passed those checks before failing at the remote D1 request. |
| Keiko production migration | Complete and verified | Read-only production D1 inspection confirms ledger entries `0001`–`0008` and migration 0008's table schema/unique composite key match the checked-in migration. No production migration was run. |
| Keiko production runtime | Blocked | Version `a7c66220-8a1d-4326-b7e0-0366b87e68c3` is still at 100% traffic and predates current main. Run 44420316195 failed with Cloudflare 7403 during D1 access; owner must verify the GitHub environment token's account/resource scope and D1/Worker permissions before approved deployment. |
| Idempotency | Implemented but not deployed | Local Keiko tests and MatMetrics recovery tests pass. Production smoke evidence is pending a compatible Keiko deployment and an approved dedicated test account. No session mutation was sent. |
| Auth Worker | Blocked pending source provenance | Production version `16358726-666b-456f-913c-dcbea199e884` is at 100%. Its metadata confirms production env, MatMetrics frontend/public URL, RP ID, issuer/audience, and expected D1 binding. PR #945's read-only preflight passed health and same-origin JWKS GETs; a current JWKS GET returned a public EdDSA key. Cloudflare version metadata contains no source commit SHA, so the deployed bundle is not tied to an exact reviewed repository revision. |
| MatMetrics create recovery | Complete and verified | `npm run test:all` passes, including write-ahead create persistence, durable queue restart and recovery classification coverage; PR #945's deterministic storage-task teardown remains green. |
| Companion API contract | Complete and verified | MatMetrics' pinned OpenAPI file is byte-identical to Keiko `main` OpenAPI; `npm run keiko-api:check` passes. |
| Domain ownership | Awaiting owner approval | No durable domain or DNS owner decision is recorded. |
| Routing architecture | Awaiting owner approval | The ADR recommends shared-origin path routing as an assumption for the first release. Topology and routing owner are not approved. |
| Passkey migration | Deferred to Phase 3A or later | Existing RP ID and issuer remain unchanged. Domain ownership, staged rehearsal, recovery, and explicit approval are required first. |
| Release rollback | Blocked | Keiko's documented rollback is traffic restoration to a recorded Worker version while retaining forward-only migrations. The production rollout and rollback procedure have not been rehearsed against the current release. |

The verified Vercel production values keep rollout closed: the
`KEIKO_SESSION_CUTOVER_USER_IDS` variable is empty, and
`KEIKO_IDEMPOTENT_CREATE_ENABLED` is absent (the application treats anything
other than exact `true` as disabled). These settings were read through the
authorized Vercel deployment interface on 2026-11-21. Do not change them as
part of Keiko deployment.

### Phase 3A scope

Safe to begin before production deployment or domain approval:

- Create a separate Companion project and TypeScript/PWA shell.
- Build IndexedDB draft and outbox behavior in an isolated implementation.
- Use a mock Keiko client and contract compatibility tests.
- Develop local-only training capture, offline restart/recovery tests,
  manifest checks, and service-worker scope checks.

Requires operational approval or completed release evidence:

- Production account authentication and real Keiko writes.
- Account cutover or new trusted frontend origins.
- Production Companion routing or a new public domain.
- New-domain passkey enrollment or an Auth issuer/RP ID migration.

**Readiness verdict:** Phase 3A offline-only development can proceed. Production
Companion authentication, writes, and routing remain blocked until the Keiko
token permissions are corrected, the reviewed runtime is deployed and
verified, and the relevant domain/routing decisions are approved. Phase 2C.1
is implemented but not operationally complete.

## Explicitly out of scope

Creating Companion, changing UI frameworks, changing auth providers or RP IDs,
moving Auth into Keiko, merging D1 databases, retiring Data Worker, deleting
legacy storage/Go code, replacing Cloudflare Queues, adding GraphQL/UTCP,
rewriting backup/restore, and deploying to production are later decisions.
