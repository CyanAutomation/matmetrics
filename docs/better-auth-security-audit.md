# Better Auth Security and Architecture Audit

Audit based on repository state after pulling `origin/main` at `f33ae64`.
This review describes code and checked-in configuration; it does not verify
deployed Cloudflare, Vercel, Resend, browser, or Go API runtime state.

## Architecture assessment

The dedicated `workers/matmetrics-auth` Worker remains justified. It owns
Better Auth behavior, D1 auth records, signing keys, passkey ceremonies, and
email callbacks. The Next.js app remains the browser-facing same-origin proxy
for `/api/auth/*`; the Go API remains an independent JWT consumer. This keeps
auth storage and secrets out of the Go and Next.js runtimes and avoids coupling
the data API to Better Auth session internals.

### Request and trust flow

1. The browser calls Better Auth client methods. Next.js rewrites
   `/api/auth/*` to the public Auth Worker. The Worker checks sign-in and
   registration limits and delegates the auth protocol to `auth.handler`.
2. Email/password sign-in requires a verified email. Passkey sign-in uses the
   WebAuthn plugin. Better Auth stores users, accounts, sessions, verifications,
   passkeys, and JWKS keys in the existing D1 database. Public password signup
   is disabled by the production Worker flag; passkey enrollment is controlled
   by its own Worker flag and Better Auth session.
3. Better Auth returns the session as a host-only, `HttpOnly`, `Secure` cookie
   on HTTPS, with `SameSite=Lax`. Its default session lifetime is seven days
   and its update age is one day (confirmed in the installed Better Auth
   1.7.7 implementation); this repository does not override either value.
   The cookie is scoped to the current public app host, not the Worker host.
4. For API calls, the browser gets a service JWT using the Better Auth token
   endpoint and sends it in an `Authorization: Bearer` header. Better Auth's
   JWT plugin defaults to 15 minutes; no override is set for ordinary service
   tokens. The token carries the configured issuer and `matmetrics-api`
   audience, with `sub` and `appUserId` equal to the Better Auth user ID.
5. Protected Next.js API handlers validate EdDSA, issuer, audience, time claims,
   and canonical user identity using `jose` and the Auth Worker's JWKS. Next.js
   never treats a session cookie alone as authorization for these JSON APIs.
6. Go independently verifies EdDSA, issuer, audience, required `exp`, optional
   `nbf`, and canonical identity using a periodically refreshed JWKS cache.
   Session cookies and Better Auth secrets are not passed to Go.
7. Keiko-Dojo routes first authenticate the MatMetrics bearer token in
   Next.js, then forward the browser session cookie and bearer token to
   `/__internal/keiko-token`. The Auth Worker validates both independently,
   requires their user IDs to match, checks the requested allowlisted scopes,
   and issues a token restricted to `keiko-dojo-api` for five minutes. Next.js
   verifies the returned JWT and scope envelope before calling the Keiko API.
   Origin and Fetch Metadata checks supplement the session and bearer checks.
8. Sign-out revokes the current Better Auth session. Password-reset links
   expire after one hour and `revokeSessionsOnPasswordReset` is enabled, so
   reset invalidates existing sessions. Email verification links also expire
   after one hour. Ordinary service JWTs are stateless: after a session is
   revoked, an already issued API JWT can remain usable until its 15-minute
   expiry. Keiko tokens can remain usable for at most five minutes.

Trust boundaries are the browser/app origin, public Auth Worker endpoint,
Cloudflare D1, Resend email delivery, Next.js server, Go API, and Keiko-Dojo
API. `BETTER_AUTH_SECRET` and `RESEND_API_KEY` are Worker secrets; D1 signing
private keys are stored in the auth JWKS table. The application does not trust
arbitrary forwarded client-IP headers. Data migrations remain owned by
`workers/matmetrics-data`; migration `0003` introduced Better Auth tables,
`0004` added registration and last-passkey guards, `0005` enforces canonical
identity creation, and `0006` retired legacy Firebase auth data. These are
additive/guard migrations with no user identity rewrite in this audit.

## Prioritized findings

| Severity | Components | Evidence and impact | Recommendation |
| --- | --- | --- | --- |
| Medium | Go JWKS cache (`internal/httpapi/authentication.go`) | `keyfunc` retains loaded keys across failed refreshes. Before this change, an already cached signing key could continue validating otherwise valid tokens for an unbounded outage, including after key removal at the issuer. | Implemented a 24-hour maximum age since successful JWKS refresh; beyond it the verifier returns unavailable (503). A successful refresh restores normal operation. |
| Medium | Auth Worker rate limiting (`workers/matmetrics-auth/src/rate-limit.ts`) | The public Worker applies an IP bucket, but Vercel-proxied users can share the Worker-visible egress IP. The IP-only bucket also provides no per-account control against distributed password guessing. | Implemented an additional hashed, normalized email bucket for email/password sign-in. The IP bucket remains, and malformed/oversized requests continue to be IP-limited. |
| Low | Companion PWA domain setup | Production config currently binds the public auth URL, trusted origin, issuer, and RP ID to `matmetrics-teal.vercel.app`; the session cookie is host-only. A PWA on another host cannot share that browser session cookie by default, though it can use the same user identity and APIs. | Before PWA work, select stable owned app/auth domains and settle cookie and passkey RP strategy; keep one Better Auth Worker and exact trusted origins. |

No Critical or High finding was supported by the inspected implementation.
Rate limits are coarse availability controls, not a substitute for account
security. Public signup remains off. Worker direct access is expected and
enforced at the Worker boundary rather than relying on Vercel-only checks.

## Session, JWT, and endpoint assessment

The session defaults (seven days, daily renewal) are consistent with a
remembered browser app, and changing them would be a user-visible policy change
without evidence of need. Secure cookie attributes are dynamically derived
from the HTTPS public base URL. `SameSite=Lax`, trusted-origin checks, and
Better Auth's origin middleware protect cookie-authenticated mutations. The
Keiko exchange additionally requires exact Origin and `Sec-Fetch-Site`, but
its actual authorization comes from both the cookie session and verified
bearer JWT. The Next.js server does not forward cookies on ordinary API calls.

TypeScript JWT verification enforces EdDSA, issuer, and audience through
`jose`, which validates expiration and not-before claims. Go restricts allowed
methods, validates issuer/audience and required expiry, and validates
not-before through the registered claims validator. Both consumers require
`sub === appUserId`. Better Auth owns signing-key selection/rotation in D1;
Next.js uses a cached remote JWK set and Go refreshes every 15 minutes and
rate-limits unknown-key refreshes. Cold starts fail closed if keys cannot be
loaded. No indefinite stale-key acceptance remains in Go after this change.
Next.js and Keiko exchange verification rely on `jose` remote-JWKS caching;
JWKS outages fail verification rather than accepting an unknown key.

The Worker applies rate limits directly, including requests to `workers.dev`.
Password sign-in is limited by the Cloudflare source IP and a hash of the
normalized account address. Registration and recovery currently use the
Cloudflare IP bucket; password signup is disabled. This reduces distributed
credential stuffing against a single email but does not eliminate denial of
service against shared egress IPs. Adding untrusted forwarded-IP handling
would weaken the trust boundary and is not recommended.

Email delivery uses `waitUntil`, a five-second send timeout, up to three
attempts, Resend idempotency keys, and safe error-code logging. Missing email
configuration produces a generic 503 before email-dependent requests. Final
delivery failures are observable in Worker logs without logging email links or
tokens. A send that fails after retries does not synchronously change the
Better Auth response; operational alerting on the existing safe failure event
is a follow-up if delivery volume warrants it.

## Keiko-Dojo scope and exchange

The Worker accepts only POST JSON, limits request bodies to 4 KiB, requires a
session and a verified MatMetrics bearer token, matches both identities to
`expectedUserId`, rejects duplicate/unknown scopes, fixes the audience, and
sets a five-minute expiry. The Next.js gateway uses a closed scope list,
closed API path patterns, validates the response token against JWKS, and checks
its subject, audience, lifetime, and exact scope set. Its current scope list is
the authority boundary for app operations; it is not role-based authorization.
Because this system has no role or privilege model in the audited paths, there
is no evidence that users can request scopes beyond their MatMetrics API
permissions. The dedicated endpoint remains reachable directly, but origin
headers are supplemental and the two credentials plus same-user match remain
the authorization controls.

## Companion PWA readiness

The PWA should use the same Better Auth Worker, D1 user identity, and protected
Next.js/Go APIs. It should not create a second Better Auth instance. The safest
near-term approach is to serve both frontends under a stable, owned site origin
with a same-origin `/api/auth/*` proxy and host-only session cookies per app;
this shares identity but lets each frontend establish its own session. If
seamless session sharing across subdomains is a real product requirement,
choose an owned parent domain first, configure a narrowly scoped parent-domain
cookie and exact trusted origins, and review CSRF and cookie behavior before
implementation. Avoid relying on cross-site third-party cookies, which mobile
browsers and installed PWAs may block.

WebAuthn credentials are scoped to the configured relying-party ID. Current
production RP ID `matmetrics-teal.vercel.app` does not cover a future owned
domain. Before companion development, decide a stable RP hostname under the
owned domain, update the Worker public URL/trusted origins and passkey RP
configuration, set the Next.js auth rewrite and server JWKS/issuer configuration
for that host, and test registration and authentication on target mobile
browsers. Those are future deployment settings; no production configuration
was changed here. PWA installation does not itself provide shared sessions;
cookie persistence remains browser-managed.

## Implemented changes

1. Go JWKS verification now accepts cached keys during a bounded outage but
   returns 503 after 24 hours without a successful refresh. This avoids
   indefinite trust in removed signing keys while preserving short outages.
   A regression test covers a valid token after the stale window.
2. Email/password sign-in now counts both source-IP and normalized account
   buckets through the existing Cloudflare limiter binding. Account keys are
   SHA-256 hashes; body parsing is bounded to 4 KiB and malformed input falls
   back to the IP bucket. A Worker unit test covers the extra account key.
3. Updated setup and readiness guidance to describe the Auth Worker's existing
   rate limits. No deployment, secret, D1, or production setting was touched.

## Deferred recommendations

- Choose and document the owned domain and WebAuthn RP ID before building a
  second frontend. This changes production configuration and requires browser
  compatibility testing.
- Consider operational alerting for the existing email-delivery failure log
  if current Cloudflare log monitoring does not provide adequate visibility.
- Ordinary API JWTs have a 15-minute post-revocation residual window. Reducing
  it or adding online revocation checks changes API availability/performance;
  no change is recommended without a threat requirement.

## Validation

Validation commands and results are recorded in the task completion summary.
The Go toolchain is unavailable in this workspace, so the Go regression test
could not be executed here.
