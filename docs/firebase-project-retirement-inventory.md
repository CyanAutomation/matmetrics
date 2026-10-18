# Firebase Project Retirement Inventory

## Status

This is a partial console inventory of the MatMetrics production Firebase
project, reviewed on 2026-10-18. Project ID: `studio-5218650201-29a19`. No
Firebase or Google Cloud resource was modified during the review. Retirement is
blocked until the Firestore data discrepancy is reconciled and all current
consumers are accounted for. The maintainer has directed that the existing
Admin SDK and API keys be retained for possible future reuse.

The inventory covers the MatMetrics project only. The separate
`CyanAutomationCloud` project visible in the account is outside this retirement
scope.

## Findings

| Resource or dependency | Owner | Console evidence and status |
| --- | --- | --- |
| Firebase web app | Unverified | Project settings lists one registered web app named MatMetrics. It is not linked to Firebase Hosting. Trace its configuration to current and archived deployments before removal. |
| Cloud Firestore | MatMetrics project; consumers unverified | The default database is in `eur3`. The data view currently shows a user-scoped preferences document and `/app/pluginConfig`. The latter contains three enabled overrides and was absent from the 2026-10-17 export described in the [D1 migration record](cloudflare-d1-migration.md). This discrepancy must be reconciled before retirement. |
| Firestore access rules | MatMetrics project; rule author unverified | Rules allow access only beneath `/users/{userId}/documents/**` when the authenticated UID matches `userId`. The top-level `/app/pluginConfig` document is outside that client rule path, so identify any privileged or server-side reader before retiring it. |
| Firestore activity | Caller unverified | The console showed 3 reads and no writes or deletes for the last 30 days. Firebase notes that these metrics include console usage and do not identify callers; this does not establish that external consumers are absent. |
| Firebase Authentication | MatMetrics project; consumer status unverified | The Authentication page shows its “Get started” setup state; it does not provide an enabled-provider or user inventory. Treat this as an incomplete check, not proof that no Firebase Auth consumers or accounts exist. |
| Realtime Database, Storage, Hosting, Functions | No configured owner found | Realtime Database offers “Create Database”; Storage and Functions require a plan upgrade; Hosting shows “Get started”. No configured resources were visible on those product pages. |
| Firebase integrations | MatMetrics project; none identified | The Integrations page offers Enable Google Analytics, Link BigQuery and Cloud Logging, and Install Slack, Jira, and PagerDuty. No linked integration was visible. |
| Firebase Admin SDK service account | Workload owner unverified | The account is enabled and has one active generated key created on 2026-03-18. Its usage page showed no data for the selected 30-day interval. The maintainer directed that the existing key remain available for possible future reuse; do not revoke it as part of this retirement. Identify current callers when resolving the Firestore consumer inventory. |
| Google Cloud API keys | Application owners unverified | Credentials lists a `GenAI Key` restricted to the Gemini API but without an application restriction, plus the Firebase-created browser key. The 30-day API dashboard showed no Gemini API requests. The maintainer directed that the existing keys remain available for possible future reuse; do not revoke them as part of this retirement. Identify current callers when resolving the consumer inventory. |

The Firebase project settings show the current maintainer account as Owner. The
application owner for the web app, Firestore documents, service-account key,
and API keys remains unverified. The key-retention decision applies to the
existing Google Cloud credentials; they are not Firestore documents, and no key
material was copied into Firestore or D1.

## D1 Recovery Point Check

The Cloudflare dashboard confirmed the `matmetrics-data` database has 12 tables
and 184.32 kB of storage. Read-only queries on 2026-10-18 found one
`user_preferences` row at revision 96 and zero `plugin_enabled_overrides` rows;
the latest recorded migration is `0006_retire_firebase_auth.sql`. The dashboard
showed 154 queries, 155 rows read, and 9 rows written in the last 24 hours, but
does not identify callers.

The Time Travel page showed a seven-day restore window from 2026-10-11 17:14 to
2026-10-18 17:14 BST and retrieved the current bookmark
`000000a1-00000000-00005108-3cd8faf0c84cfe43eebe08c7b1947095`. This is the
verified recovery point for the current D1 state. A timestamp lookup near the
2026-10-17 migration-record update returned a different bookmark from the
previously recorded ID. Refresh and verify the current bookmark immediately
before any later retirement action that depends on recovery. No restore or
database write was performed during this check.

## Required Follow-up

1. Reconcile the live `/app/pluginConfig` document with the 2026-10-17 export
   and D1 state. Do not import the older Firestore snapshot over D1. If this
   document represents settings still needed by an older application, reconcile
   the newer D1 state or explicitly accept the data gap before retirement.
2. Identify owners and callers for the registered web app and any current
   Firestore consumers, including workloads using the retained keys. Include
   other repositories, deployments, scheduled jobs, and non-code integrations.
3. Recheck Firestore activity after suspected callers are retired. Record the
   metrics' scope and time window; low or absent metrics alone do not prove
   that no consumer exists.
4. Immediately before retirement, retrieve and verify a current D1 bookmark.
   The Time Travel window is seven days, so refresh the recorded bookmark if
   retirement occurs outside its availability window.
5. Only after all consumers are resolved, verify Firebase Auth is unused or
   unconfigured, then retire Firestore and any other confirmed-unused Firebase
   products. Preserve the existing Admin SDK and API keys as directed. Record
   provider-console verification for each action. Do not delete the whole
   Google Cloud project as part of this work.

Keep the Firestore export and a current verified D1 recovery point available
until retirement is verified. No credential revocation, Auth disablement,
Firestore retirement, data import, or D1 restore has occurred as part of this
inventory.
