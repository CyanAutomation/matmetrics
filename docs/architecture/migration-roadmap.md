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
IndexedDB for drafts and quota resilience. Keiko must define an idempotency
contract before create replay can resolve ambiguous lost responses or 409
duplicates automatically. No MatMetrics production deployment is part of this
phase.

## Phase 2A — Canonical Keiko contract and Web integration

**Implementation in this branch:** Keiko owns the validated OpenAPI contract and
versioning rules. MatMetrics pins the contract to an immutable Keiko commit,
generates its TypeScript API types in CI, and uses a typed Fetch client at the
existing server-side Keiko boundary. Session list/detail/create/update/delete
remain behind same-origin MatMetrics routes and the current Better Auth token
exchange. The Phase 1.1 recovery follow-ups keep snapshot-less deletes visible,
resume auth-paused work after durable queue updates, and allow independent safe
operations to retry.

**Remaining Phase 2B dependencies:** settle the durable public frontend/auth
domain and deployment ownership; rehearse account/passkey migration while
preserving the current RP ID; decide same-origin routing and trusted origins for
independently deployed clients; define Keiko create idempotency before automatic
replay; and complete consumer compatibility review before contract updates.
No Companion, service, production deployment, or migration is part of Phase 2A.

## Phase 2 — Contract and auth-domain readiness

1. Agree a durable public frontend/auth domain before Companion is built.
2. Test a staged passkey/account migration from the current exact RP ID; preserve
   the old login host and do not switch RP IDs without a tested recovery path.
3. Pin a tagged Keiko OpenAPI artifact and establish contract compatibility
   checks. Generate TypeScript client types from the spec in both consuming
   repositories; add a package only when duplication justifies distribution.
4. Decide whether same-origin path routing can support independent Web and
   Companion releases. If not, design per-origin same-origin proxies and
   trusted origins without sharing host-only cookies.
5. Plan an explicit Keiko idempotency contract before automatic replay of
   mobile create mutations.

**Dependencies:** domain/DNS and deployment ownership; auth and passkey test
accounts; Keiko OpenAPI release process. **Rollback:** keep the current origin,
RP ID, auth Worker and API facade active; do not move session data as part of
the auth-domain change.

## Phase 3 — Companion offline client

1. Build the separate mobile-first PWA after auth-domain and OpenAPI decisions.
2. Implement IndexedDB drafts/outbox, stable mutation IDs, idempotent create,
   auth-resume, retry/backoff and user-visible conflict states.
3. Run two-client acceptance scenarios for edit/edit, edit/delete,
   offline/reconnect, expired auth, duplicate replay and account switching.
4. Export and recover local drafts through app restart, browser process kill,
   storage quota pressure and deployment upgrades.

**Dependencies:** Phase 2 auth/API decisions and Keiko idempotency support.
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

## Deployment and rollback for Phase 1

- No production migration or Worker deployment is part of this branch.
- Keiko production `0007` is already applied; its latest production Worker
  deployment was verified at 100% traffic on 2026-10-25. No coordinated Keiko
  change is needed.
- Review and merge the MatMetrics PR first. Deploy MatMetrics through the
  existing Vercel release process only after standard CI and auth/guest/legacy
  checks pass.
- Roll back the MatMetrics deployment through the normal Vercel mechanism if
  form, session history, or queue behavior regresses. This changes no D1 data.
  Be aware that rolling back the app also removes the newly enforced client
  revision propagation until the corrected release is restored.
- Do not alter `KEIKO_SESSION_CUTOVER_USER_IDS`, apply remote migrations, invoke
  sync-all/reconciliation, change GitHub installations, or delete Worker/D1
  resources as part of this release.

## Explicitly out of scope

Creating Companion, changing UI frameworks, changing auth providers or RP IDs,
moving Auth into Keiko, merging D1 databases, retiring Data Worker, deleting
legacy storage/Go code, replacing Cloudflare Queues, adding GraphQL/UTCP,
rewriting backup/restore, and deploying to production are later decisions.
