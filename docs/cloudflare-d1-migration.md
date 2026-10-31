# Cloudflare D1 Migration

## Scope

User preferences and plugin overrides use D1 through the signed data Worker.
There is no Firestore runtime fallback. Better Auth is the sole authentication
provider. Session records remain GitHub-backed Markdown files (with their
existing local fallback) and are deliberately out of scope.

That scope describes the initial preferences migration. The existing
allowlisted pilot account has since moved its primary session store to Keiko
D1; its selected GitHub repository now serves as a Markdown backup and rollback
source. Accounts outside the Keiko cutover allowlist continue using the legacy
GitHub-backed session path.

## Architecture

```text
Browser -> Vercel Next.js API -> signed Cloudflare data Worker -> D1
Browser -> same-origin /api/auth/* -> Cloudflare Better Auth Worker -> D1
```

The browser only calls same-origin Next.js routes. Vercel verifies the Better
Auth service JWT, then signs each data Worker request with the protocol
version, timestamp, HTTP method, target path and query, user ID, and SHA-256 of
the request body. The data Worker
rejects signatures older than 60 seconds. The Better Auth Worker uses its own
native D1 binding and auth tables in the same database; it does not use the
signed data API. Do not expose either Worker secret to the browser or use D1's
administrative REST API from Vercel.

## Deployment

1. Create separate `matmetrics-data-dev`, `matmetrics-data-preview`, and
   `matmetrics-data` D1 databases.
2. Replace `database_id` in each environment's Worker configuration. Do not
   commit an account-specific ID if this Worker is shared across deployments.
3. In `workers/matmetrics-data`, install dependencies and apply migrations:

   ```bash
   npm install
   npm run migrate:remote
   npm run deploy
   ```

4. Set the same randomly generated `MATMETRICS_INTERNAL_API_SECRET` as a
   Cloudflare Worker secret and a Vercel server-only environment variable.
5. Set `CLOUDFLARE_DATA_WORKER_URL` in Vercel to the deployed Worker URL.
6. Before routing users to an environment, confirm its D1 data is populated and
   reconciled. The application requires these Worker settings for preference
   and plugin state operations.

The signed request contract is implemented in both
`src/lib/data-worker-client.server.ts` and
`workers/matmetrics-data/src/index.ts`. It binds the signature to the version,
timestamp, HTTP method, path and query, user ID, and request-body hash. Deploy
the Worker before deploying an app change to that contract, and verify signed
preference reads and writes against the target environment after both deploys.
Updating only the shared secret does not update the Worker request verifier.

The incremental Better Auth passkey Worker shares the environment's D1 database
but owns a separate native D1 binding for auth reads and writes. Its additive
tables are in `0003_better_auth_identity.sql`; the data Worker remains the
owner of D1 migration history. For local setup, apply migrations with
`npm run migrate:local` under `workers/matmetrics-data`. For deployment, apply
the migration through the existing environment-specific migration process
before deploying `workers/matmetrics-auth`. Configure the auth Worker's exact
frontend origin, RP ID, issuer, audience, and server-only secrets as described
in [`workers/matmetrics-auth/README.md`](../workers/matmetrics-auth/README.md).
Do not enable passkeys on arbitrary Vercel preview hostnames.

## Background Jobs and Queues

The same Worker also owns read-only background jobs for Log Doctor scans and
on-demand GitHub health checks. Apply migration `0002_background_jobs.sql`,
then create a `matmetrics-background-jobs` Queue and a
`matmetrics-background-jobs-dlq` dead-letter Queue in every environment before
deploying the Worker configuration.

Set `MATMETRICS_BACKGROUND_EXECUTOR_URL` to the matching Vercel deployment
origin and set the same `MATMETRICS_BACKGROUND_EXECUTOR_SECRET` in Vercel and
as a Worker secret. This credential permits the Worker to invoke only the
private background executor; Better Auth verification and user authorization
remain at the public Vercel API boundary. Do not expose either value to the
browser.

Jobs are persisted in D1 before publication, and Queue messages contain only a
job ID. Consumers retry transient failures up to five times and record the
final result or failure against the user-scoped job record. Log Doctor fixes,
session mutations, and GitHub sync remain synchronous and are intentionally
not queue consumers.

## Production Data Reconciliation

On 2026-10-17, the maintainer compared a Firestore export with production D1.
The export matched the Firebase project and contained one preference document,
no plugin configuration document, and a UID matching the D1 user. D1 contained
one preference row and zero plugin override rows.

The D1 row was at revision 92 and updated on 2026-10-15. The Firestore document
was timestamped 2026-09-15; six normalized fields differed. The newer D1 state
was retained. No import, overwrite, database write, or deployment occurred.
The D1 Time Travel bookmark recorded for recovery is
`00000097-00000000-00005106-1b975d443d69173e9b3213ee32ffc58d`.

On 2026-10-18, a read-only Cloudflare API timestamp lookup near this record's
2026-10-17 update returned a different bookmark from the one recorded above.
The Cloudflare dashboard then retrieved the current bookmark
`000000a1-00000000-00005108-3cd8faf0c84cfe43eebe08c7b1947095` for the current D1
state. The dashboard showed a seven-day Time Travel window, from 2026-10-11
17:14 to 2026-10-18 17:14 BST. Refresh and verify a current bookmark before a
later retirement action that depends on recovery. No restore or database write
was performed.

Read-only queries on 2026-10-18 confirmed one `user_preferences` row at revision
96 and zero `plugin_enabled_overrides` rows. The latest migration is
`0006_retire_firebase_auth.sql`. This check did not read or change preference
contents.

No production import is needed from this older snapshot. Keep the Firestore
export and verify a D1 recovery point is available before relying on it for
rollback. The export predates the current D1 row and is not a lossless rollback
copy: before restoring an older application that reads or writes Firestore,
reconcile the newer D1 state back to that store or explicitly accept the
resulting data gap.

On 2026-10-17, the maintainer confirmed the rollback window had ended. Keep the
export available and verify or replace the recorded recovery point before the
Firebase consumer inventory and project retirement are considered complete. A
GitHub code search available to this session found no explicit Firebase or
Firestore references outside MatMetrics in the indexed CyanAutomation
repositories, but this does not cover project-console integrations or other
non-code consumers.

For a new non-production environment that still needs an initial data load,
export each user's `users/{uid}/preferences/app` and
`users/{uid}/app/pluginConfig` documents. Normalize preferences with the
application's normalization logic, then import one `user_preferences` row per
user and one `plugin_enabled_overrides` row per `(user_id, plugin_id)` override.
Compare source and destination counts and normalized values before routing
users to that environment. Do not overwrite a newer destination row with an
older export. A legacy global plugin configuration must not become a global
setting; apply defaults per user only after an explicit product decision.

The partial provider-console inventory from 2026-10-18 is recorded in
[`firebase-project-retirement-inventory.md`](firebase-project-retirement-inventory.md).
It found a live `/app/pluginConfig` document that was absent from the
2026-10-17 export. The maintainer directed that the existing Firebase Admin SDK
and Google Cloud API keys remain available for possible future reuse; they are
not Firestore documents and their secret material was not copied into D1. The
Firestore usage metrics showed no writes or deletes in the last 30 days, but
include console usage and do not identify callers. These findings do not
establish that no consumers remain. Reconcile the document discrepancy and
identify current Firestore callers before product retirement. Keep the export
and a current verified D1 recovery point available until retirement is
verified. No provider-side retirement or data import has occurred.

## Rollback

Restore a previous application deployment only after checking its data path.
Do not remove the D1 Worker configuration as a rollback mechanism. The current
application has no Firestore fallback, and the retained Firestore export is
older than the current D1 preference state. Before schema or bulk data changes,
create a D1 recovery point; D1 Time Travel provides the recovery mechanism for
current databases.
