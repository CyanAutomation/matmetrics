# Next Steps

## Better Auth deployment

The maintainer confirmed the production verification, Vercel Firewall limits,
and signup rollout decision are complete as of 2026-10-17. Keep the Worker and
Vercel signup flags aligned if the decision changes.

The auth Worker uses the exact frontend origin and RP ID for WebAuthn. Do not
allow wildcard preview origins. See the [auth rollout checklist](docs/better-auth-passkey-migration.md).

## Firebase project retirement

The maintainer confirmed the rollback window ended on 2026-10-17. A GitHub
code search available to this session found no explicit Firebase or Firestore
references outside MatMetrics in the indexed CyanAutomation repositories. This
does not establish that the Firebase project has no consumers outside those
repositories. Complete a project-console inventory before retiring services.
A partial Firebase and Google Cloud console
inventory was completed on 2026-10-18 and is recorded in
[`docs/firebase-project-retirement-inventory.md`](docs/firebase-project-retirement-inventory.md).
It found a live Firestore `/app/pluginConfig` document that was absent from the
2026-10-17 export. The maintainer directed that the existing Firebase Admin SDK
and Google Cloud API keys remain available for possible future reuse; do not
revoke or copy their secret material into database documents. Retirement is
blocked until the Firestore data discrepancy is reconciled and all current
consumers are accounted for.

The production data comparison is recorded in
[`docs/cloudflare-d1-migration.md`](docs/cloudflare-d1-migration.md). D1 already
contains the newer matching preference state, so do not import the older
Firestore snapshot over it. A read-only Cloudflare check confirmed one D1
preference row at revision 96, no plugin override rows, and retrieved a current
recovery bookmark recorded in the [inventory](docs/firebase-project-retirement-inventory.md).
Refresh and verify that bookmark immediately before any later retirement action
that depends on recovery. Keep the export and current D1 recovery point available
until the consumer inventory and retirement are verified. If an older
Firestore-backed application is restored, reconcile the newer D1 state back to
Firestore or explicitly accept the data gap. After confirming no other project
consumers depend on Firebase, disable Firebase Auth only if it is unused or
unconfigured, then retire Firestore and any other confirmed-unused Firebase
products. Keep the existing Admin SDK and API keys available as directed. Do
not delete the entire Google Cloud project. Record provider-console
verification for each action.
