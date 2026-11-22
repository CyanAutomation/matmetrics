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
[`offline-mutation-safety.md`](./offline-mutation-safety.md). The keyed-create
first-write smoke has been completed and cleaned up; other production mutation
and recovery scenarios remain separate verification work.

**Follow-up dependencies:** the Companion offline foundation should evaluate
IndexedDB for drafts and quota resilience. Phase 2B now defines the Keiko
idempotency contract; its production migration and Worker are deployed. Keyed traffic remains disabled after the Production first-create smoke; the same-key replay and changed-payload conflict still need Production verification before a separately reviewed account cutover.

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
are in the Keiko and MatMetrics branches. Keiko migration 0009 and the bounded
GitHub sync Worker are deployed. A Production first-keyed-create smoke
succeeded and its synthetic record was removed; same-key replay and changed-
payload conflict remain unverified. The Production create flag is false, and
this documentation change does not enable production traffic.

## Phase 2B — Idempotent Session Creation & Safe Offline Replay

**Implementation complete:** Keiko stores a per-user idempotency ledger and the
immutable original revision-1 result in the same D1 transaction as the session.
MatMetrics pins that OpenAPI contract, sends one cryptographic key per logical
create, and preserves it with queued retries and recovery exports. Unattempted
offline creates can absorb edits; after the first send is persisted, later edits
stay separate operations. Details and rollout checks are in
[`idempotent-create-replay.md`](./idempotent-create-replay.md).

**Rollout:** Keiko migrations 0008 (idempotency ledger) and 0009 (bounded GitHub
sync) are applied, and the compatible Worker is deployed. The first keyed
Production create was verified and its synthetic session removed. Keep
`KEIKO_IDEMPOTENT_CREATE_ENABLED=false` until same-key replay and changed-payload
conflict are verified and a separate account-cutover decision is approved.
Rollback MatMetrics while retaining both forward-only migrations and ledger
rows; never delete ledger rows while old clients may retry.

**Production check (2026-11-22):** protected Keiko Deploy Production run
[45049729823](https://github.com/CyanAutomation/keiko-dojo/actions/runs/45049729823)
applied migration 0009 and deployed Worker version
`f766d86b-6831-431e-88bf-49732902af1d` at 100% traffic for release SHA
`8688ccbc953dc74b825a3820cf9ebbb942825bed`. Production D1 contains 39
sessions; sync generation 9 completed with 39 manifest entries, no dirty
items, and no orphans. The authorized Production first-keyed-create smoke
created and then removed one synthetic session; its ledger row remains by
design. Same-key replay and changed-payload conflict remain unverified.
MatMetrics Production is back on a READY deployment with
`KEIKO_IDEMPOTENT_CREATE_ENABLED=false`; the existing sensitive cutover
allowlist was left unchanged. The primary Queue is empty; the DLQ backlog is
732 and has not been replayed or purged.
## Phase 2B.1 — Durable mutation recovery

Authenticated create operations are persisted before the server create-mode
probe or first create request. Keiko creates persist their UUID key and frozen
attempt marker before sending. The authenticated mode endpoint derives
`legacy`, `keiko-idempotent`, or `keiko-unavailable` from the verified account
and server rollout flag. Legacy ambiguous creates are held for review instead
of replayed as if the legacy backend were idempotent. Recognized bounded
Keiko error codes are preserved and rendered distinctly in Recovery.

The feature switch remains off by default. The Worker deployment blocker is
resolved, but Production replay/conflict verification and a separate account
cutover decision remain before any persistent cutover is enabled.

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

- This documentation update changes no production code, database, identity
  settings, DNS, or rollout flags. The Keiko release and first keyed-create
  smoke described above have already occurred.
- Keiko migrations 0001–0009 are applied and the compatible Worker is at 100%
  traffic. Future Keiko releases should use the protected deployment procedure
  in [`idempotent-create-replay.md`](./idempotent-create-replay.md).
- Keep `KEIKO_IDEMPOTENT_CREATE_ENABLED=false` until Production same-key replay
  and changed-payload conflict are verified and the owner separately approves
  account cutover. The existing sensitive allowlist was not changed during the
  smoke; its value is not recorded here.
- MatMetrics is already redeployed from `main`. Use the normal Vercel release
  process for future code changes. If frontend behavior regresses, roll back
  MatMetrics while retaining Keiko migrations 0008–0009 and all idempotency
  ledger rows.
- Do not activate additional Auth Worker origins or change RP ID, issuer,
  cookie scope, secrets, or production identity configuration as part of this
  release. Follow the staged plan in
  [`passkey-domain-migration.md`](./passkey-domain-migration.md) after domain
  and routing ownership are approved.

## Phase 2C.1 — Production release readiness (2026-11-22)

This is the evidence gate for production Companion rollout and Phase 3A. The
status below combines repository CI, read-only Cloudflare/Vercel inspection,
and the explicitly authorized release and first-create smoke.

| Dependency | Status | Evidence and remaining work |
| --- | --- | --- |
| MatMetrics CI | Complete and verified | Current Production source commit is `1d96ae8a8871374a9f5bd4b35e76c836d463d987` (PR #947); CI, security-analysis, and release-readiness workflows passed. Vercel Production deployment `dpl_CmjbW2qhzuU3oVopVf4CKVqorsdB` is READY on this commit. |
| Keiko CI | Complete and verified | Keiko release commit `8688ccbc953dc74b825a3820cf9ebbb942825bed` passed CI, workflow-quality, and CodeQL checks before merge. |
| Keiko production migration | Complete and verified | Protected Deploy Production run [45049729823](https://github.com/CyanAutomation/keiko-dojo/actions/runs/45049729823) applied migrations `0001`–`0009`; the idempotency ledger is present with its expected `(user_id, idempotency_key)` key and constraints. |
| Keiko production runtime | Complete and verified | The same protected run reconciled the Queue consumer and deployed Worker version `f766d86b-6831-431e-88bf-49732902af1d` at 100% traffic for release SHA `8688ccbc953dc74b825a3820cf9ebbb942825bed`. |
| GitHub Markdown sync | Complete and verified | Production has 39 sessions, 39 manifest entries, no dirty items or orphan paths, and completed sync generation 9. The primary Queue backlog is 0. The DLQ backlog was 732 at the latest read; it has not been replayed or purged. |
| Idempotency | First-create smoke complete; replay/conflict outstanding | The authorized Production first-keyed-create smoke succeeded through Keiko. Its synthetic session was deleted and its ledger row remains by design. Same-key replay and changed-payload `409 idempotency_key_reuse` have not been verified in Production. The temporary rollout flag is now `false`; the existing sensitive allowlist was not changed. |
| Auth Worker | Blocked pending source provenance | Production version `16358726-666b-456f-913c-dcbea199e884` is at 100%. Read-only settings confirm the production environment, MatMetrics origin, RP ID, issuer/audience, and expected D1 binding. The deployed version metadata has no source commit SHA. Follow-up read-only GETs on 2026-11-21 returned `{"ok":true}` from `/healthz` and a JWKS containing a public EdDSA key. |
| MatMetrics create recovery | Complete and verified by CI | Current MatMetrics CI passed, including write-ahead create persistence, durable queue restart, recovery classification, and deterministic storage-task teardown checks. |
| Companion API contract | Complete and verified | MatMetrics' pinned OpenAPI file blob is identical to Keiko `main` (`b86eadb2bc63c894e38c3a428b4849aa3c950a45`); the latest MatMetrics CI passed. |
| Domain ownership | Awaiting owner approval | No durable domain or DNS owner decision is recorded. |
| Routing architecture | Awaiting owner approval | The ADR recommends shared-origin path routing as an assumption for the first release. Topology and routing owner are not approved. |
| Passkey migration | Deferred to Phase 3A or later | Existing RP ID and issuer remain unchanged. Domain ownership, staged rehearsal, recovery, and explicit approval are required first. |
| Release rollback | Rehearsal outstanding | The documented rollback restores traffic to a recorded Worker version while retaining forward-only migrations. Rehearse the procedure against the current release before relying on it as a cutover control. |

The 2026-11-22 Vercel Production inventory shows
`KEIKO_IDEMPOTENT_CREATE_ENABLED=false`. The existing sensitive
`KEIKO_SESSION_CUTOVER_USER_IDS` variable was not changed during the authorized
smoke; its value is not recorded here. Keep the rollout flag fail-closed and do
not change the allowlist or enable persistent keyed traffic without a separate
reviewed cutover decision.

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

**Readiness verdict:** Phase 3A offline-only development can proceed. Keiko
Production runs migrations `0001`–`0009`, the Worker is at 100% traffic for
release SHA `8688ccbc953dc74b825a3820cf9ebbb942825bed`, and the D1 sync is
clean at generation 9. The authorized first-keyed-create smoke succeeded and
its synthetic row was removed. Production same-key replay and changed-payload
conflict, a reviewed account-cutover decision, and a rollback rehearsal remain
outstanding. The primary Queue is empty; the DLQ backlog (732 at the latest
read) has not been replayed or purged. Domain/routing ownership and Auth Worker
source provenance also remain unresolved. Phase 2C.1 is not complete for
Production Companion authentication, writes, or routing.

## Explicitly out of scope

Creating Companion, changing UI frameworks, changing auth providers or RP IDs,
moving Auth into Keiko, merging D1 databases, retiring Data Worker, deleting
legacy storage/Go code, replacing Cloudflare Queues, adding GraphQL/UTCP,
rewriting backup/restore, and deploying to production are later decisions.
