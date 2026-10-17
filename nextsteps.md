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
repositories. Complete a project-console inventory before revoking credentials
or disabling/deleting services. The Firebase/Google Cloud console inventory is
not available from this workspace.

The production data comparison is recorded in
[`docs/cloudflare-d1-migration.md`](docs/cloudflare-d1-migration.md). D1 already
contains the newer matching preference state, so do not import the older
Firestore snapshot over it. Keep the export and recorded D1 recovery point
available until the consumer inventory and retirement are verified. If an older
Firestore-backed application is restored, reconcile the newer D1 state back to
Firestore or explicitly accept the data gap. After confirming no other project
consumers depend on Firebase, revoke the Firestore service account and its
credentials, disable Firebase Auth, and retire Firestore and any other unused
Firebase products. Record provider-console verification for each action.
