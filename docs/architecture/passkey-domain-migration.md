# Passkey Domain Migration Plan

This plan preserves existing credentials while MatMetrics prepares a future
durable public domain. It does not select a domain, change production
configuration, create or delete credentials, or migrate accounts.

## Existing RP ID and origins

The active Auth Worker configures:

- RP ID: `matmetrics-teal.vercel.app`.
- Expected browser origin: `https://matmetrics-teal.vercel.app`.
- Better Auth public URL/JWT issuer: `https://matmetrics-teal.vercel.app`.
- Browser auth API: same-origin `/api/auth/*`, rewritten by Next to the
  Cloudflare Auth Worker.
- Session cookie: Better Auth's host-only session cookie. HTTPS production
  uses `__Secure-better-auth.session_token`; defaults include `Path=/`,
  `HttpOnly`, `Secure`, and `SameSite=Lax`. No parent-domain `Domain` is set.

Existing passkey records belong to the current Better Auth user IDs in MatMetrics
D1. A passkey registered for RP ID `matmetrics-teal.vercel.app` cannot be
retargeted to a different RP ID by updating the page URL. The user must enroll
a new credential under the new RP ID while signed in or use an account recovery
method.

## Future RP ID and coexistence

The future RP ID is undecided until a durable domain is approved. For a shared
origin such as `https://<approved-domain>/` with Companion at
`/companion/`, the RP ID would usually be the approved domain's host, with that
exact HTTPS origin as the WebAuthn origin. For sibling subdomains, one parent
RP ID can cover multiple explicitly configured origins if those origins are
under the RP ID. The current Vercel RP ID is not a parent of a future branded
domain.

Better Auth has one configured RP ID per Auth Worker instance. Keeping the old
and new RP IDs usable at the same time therefore needs an explicit dual-host
rehearsal. The likely safe arrangement is to retain the existing Auth Worker
and login origin for existing credentials while a separately configured
first-party auth deployment uses the approved RP ID against the same identity
database, signing trust, and issuer policy. That arrangement needs a security
review and staging proof before production approval; it is not configured by
this change. Do not assume that one Worker with a changed RP ID can validate
both credential sets.

The source now supports a list of exact browser origins that share a single RP
ID. It does not introduce multiple RP IDs, broad wildcard trust, shared parent
cookies, a new identity provider, or automatic credential conversion.

## Staged migration

1. **Approve ownership and migration boundaries.** Record the domain owner,
   DNS owner, Auth Worker owner, selected RP ID, expected WebAuthn origins,
   JWT issuer, and rollback operator.
2. **Keep the current origin live.** Do not remove its route, origin allowlist
   entry, Auth Worker, RP ID configuration, or account recovery email flow.
3. **Prepare a staging identity environment.** Use test accounts and the
   production-equivalent Better Auth version and passkey settings. Do not copy
   production passkey credential rows.
4. **Exercise account recovery.** Verify that a test account can use the
   verified-email password reset route, retain the same user ID, sign in on the
   new origin, and enroll a new passkey. Confirm the current-origin passkey
   still works at the old origin.
5. **Verify dual-origin architecture.** Test the old Auth Worker/origin and the
   proposed new RP ID/origin arrangement against a staging identity database.
   Verify JWKS, issuer, audience, session cookie scope, CSRF, passkey options and
   assertions, sign-out, and Keiko token exchange for each facade.
6. **Canary only after approval.** Enable the new origin for a dedicated
   staging or explicitly approved pilot cohort. Keep the current origin as the
   recovery route. Do not enroll or remove production credentials during a
   rehearsal.
7. **Offer new passkey enrollment.** After users can authenticate through an
   approved password/email recovery path on the new origin, ask them to add a
   passkey for the new RP ID. Verify the credential against the same account
   ID and retain the previous credential during the migration period.
8. **Monitor recovery and sign-in.** Track aggregate success/failure by origin
   without recording credentials, bearer tokens, session cookies, or passkey
   payloads. Provide a clear password/email fallback when a passkey from the
   other RP ID is unavailable.
9. **Retire the old origin only after evidence.** Confirm users have an
   alternative sign-in method, recovery works, support can restore access, and
   old-origin traffic has been absent for an approved interval. Preserve the
   old origin longer if any account remains dependent on it.

## Account recovery and session continuity

The existing application has verified-email password setup/reset and
password sign-in alongside passkey sign-in. Account settings can list, rename,
and remove passkeys; the Worker prevents deleting the final passkey without a
replacement. A user who cannot use the old passkey must first recover through
the verified email/password path before enrolling on the new RP ID.

Host-only cookies do not move between origins. Existing Better Auth sessions
on `matmetrics-teal.vercel.app` will not be sent to a new host. Users may need
to sign in again on the new origin. Keep the old login available to recover
accounts and queued training data during the migration. The stable user ID and
shared identity database must remain unchanged.

The MatMetrics API JWT issuer is currently the Vercel origin, its audience is
`matmetrics-api`, and the Keiko token audience is `keiko-dojo-api`. Keep the
current issuer and signing trust stable through the passkey rehearsal. Any
issuer change requires coordinated verifier/JWKS and rollback planning; it is
not part of a frontend domain migration by default.

## Rollback

- Route sign-in traffic back to the current origin and Auth Worker settings.
- Keep the new origin available only if its Auth Worker configuration remains
  valid; otherwise remove the new exact origin from trusted origins and use the
  old login path.
- Do not delete either RP ID's credentials, alter account IDs, rotate signing
  keys, change the Better Auth database, or expand cookie scope as a rollback
  shortcut.
- Keep new-origin queued session data and retry it only through its original
  authenticated account after sign-in is restored.

## Approval gate

No production passkey RP ID, issuer, origin, cookie, domain, DNS, or identity
configuration should change until domain ownership is approved and the staging
rehearsal verifies password recovery, old-passkey continuity, new-passkey
enrollment, stable account identity, API token verification, Keiko exchange,
sign-out, and route rollback.
