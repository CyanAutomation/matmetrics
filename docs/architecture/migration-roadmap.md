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

## Phase 2C.1 — Production release readiness (2026-11-22)

This is the current evidence gate for Phase 3A. Repository documentation is
not deployment proof; status below is based on current repository checks and
read-only Cloudflare/Vercel inspection.

| Dependency | Status | Evidence and remaining work |
| --- | --- | --- |
| MatMetrics CI | Complete and verified | Current `main` is `e2ff33018930bc5b6f88874941955ace982c0102`; the CI, security-analysis, and release-readiness workflows passed. Vercel Production deployment `dpl_BLc3ssQrGKMAt4GrgLKQQDBBKi3P` is READY on this commit. |
| Keiko CI | Complete and verified | Current `main` is `84dc3e26a990217059e3571dc2ca29ee7694206b`; CI, workflow-quality, and CodeQL checks passed. |
| Keiko production migration | Complete and verified | Read-only production D1 inspection confirms applied migrations `0001`–`0008`; the `session_create_idempotency` table has the expected `(user_id, idempotency_key)` primary key and constraints. No production migration was run. |
| Keiko production runtime | Blocked at read-only release preflight | Version `a7c66220-8a1d-4326-b7e0-0366b87e68c3` remains at 100% traffic and predates current `main`. Read-only credential preflight run [44966233035](https://github.com/CyanAutomation/keiko-dojo/actions/runs/44966233035) confirms the GitHub environment account matches production and can read Keiko D1 and Worker metadata. The subsequent protected [Deploy Production run 45003918971](https://github.com/CyanAutomation/keiko-dojo/actions/runs/45003918971) passed local checks but failed at the read-only Cloudflare release preflight with code 10000 because production Queue resources were inaccessible. The inspected token policy has account-level D1 Read/Write and Individual Workers Editor scoped to `keiko-dojo`, but no Queues Read. The migration and Worker deploy steps did not run; production was not changed. Add account-scoped `Queues Read`, rerun the protected workflow, then verify the migration ledger, deployed version, traffic, and rollback path. |
| Idempotency | Implemented but not deployed | Keiko and MatMetrics main checks pass. Production keyed-create smoke evidence is pending a compatible Keiko deployment and an approved dedicated test account. No session mutation was sent. |
| Auth Worker | Blocked pending source provenance | Production version `16358726-666b-456f-913c-dcbea199e884` is at 100%. Read-only settings confirm production environment, MatMetrics origin, RP ID, issuer/audience, and the expected D1 binding. The deployed version metadata has no source commit SHA. Follow-up read-only GETs on 2026-11-21 returned `{"ok":true}` from `/healthz` and a JWKS containing a public EdDSA key. |
| MatMetrics create recovery | Complete and verified by CI | Current MatMetrics CI passed, including write-ahead create persistence, durable queue restart, recovery classification, and deterministic storage-task teardown checks. |
| Companion API contract | Complete and verified | MatMetrics' pinned OpenAPI file blob is identical to Keiko `main` (`b86eadb2bc63c894e38c3a428b4849aa3c950a45`); the latest MatMetrics CI passed. |
| Domain ownership | Awaiting owner approval | No durable domain or DNS owner decision is recorded. |
| Routing architecture | Awaiting owner approval | The ADR recommends shared-origin path routing as an assumption for the first release. Topology and routing owner are not approved. |
| Passkey migration | Deferred to Phase 3A or later | Existing RP ID and issuer remain unchanged. Domain ownership, staged rehearsal, recovery, and explicit approval are required first. |
| Release rollback | Blocked | Keiko's documented rollback is traffic restoration to a recorded Worker version while retaining forward-only migrations. The production rollout and rollback procedure have not been rehearsed against the current release. |

The read-only Vercel Production environment inventory on 2026-11-21 contains a
sensitive `KEIKO_SESSION_CUTOVER_USER_IDS` variable with the comment “Only the
existing account in the Keiko staging pilot.” Its value was not disclosed by
the authorized query, so allowlist membership and account routing cannot be
confirmed here. `KEIKO_IDEMPOTENT_CREATE_ENABLED` is absent; keyed create is
therefore not enabled. If a production identity is allowlisted, its create mode
fails closed as `keiko-unavailable` until the flag is explicitly enabled. Do
not change either setting as part of Keiko deployment.

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

**Readiness verdict:** Phase 3A offline-only development can proceed. The
Keiko production account and D1/Worker read access are verified. Production
release is currently blocked at its read-only preflight by missing Queue read
access; after the narrow permission is added, a successful deployment and
runtime verification, Vercel allowlist review, separately reviewed keyed-create
rollout, and domain/routing decisions are still required. Phase 2C.1 is
implemented but not operationally complete.

## Explicitly out of scope

Creating Companion, changing UI frameworks, changing auth providers or RP IDs,
moving Auth into Keiko, merging D1 databases, retiring Data Worker, deleting
legacy storage/Go code, replacing Cloudflare Queues, adding GraphQL/UTCP,
rewriting backup/restore, and deploying to production are later decisions.
