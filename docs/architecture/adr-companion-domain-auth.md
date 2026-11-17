# Companion Domain and Authentication Architecture Decision

Status: recommendation pending approval of a durable public domain and its
owner. This record captures the current production topology, the two routing
options, and changes prepared in Phase 2C. It does not approve a domain,
production configuration change, passkey migration, or deployment.

## Context and verified current state

MatMetrics Web is served at `https://matmetrics-teal.vercel.app`. Its Next.js
API is same-origin with the browser. `next.config.ts` rewrites `/api/auth/*` to
the Cloudflare Better Auth Worker. The active Auth Worker uses that same public
URL as Better Auth `baseURL`, JWT issuer, and its sole trusted browser origin.
The JWT audience is `matmetrics-api`; the JWKS is available through the same
rewrite. The passkey RP ID is `matmetrics-teal.vercel.app`, with the same exact
WebAuthn origin.

Better Auth's session cookie has a host-only scope because no `Domain` is set.
In production the name is `__Secure-better-auth.session_token`; its defaults
include `Path=/`, `HttpOnly`, `Secure`, and `SameSite=Lax`. Session lifetime is
seven days with a one-day refresh age by default. The JWT plugin token expires
after 15 minutes by default. Browser API requests obtain that JWT from Better
Auth. A server-side, user-scoped exchange uses the matching session cookie and
verified bearer to issue a Keiko token with exact scopes and a maximum
five-minute lifetime. Browser session cookies are not sent to Keiko.

The Auth Worker accepts password and passkey sign-in. Origin checks use the
explicit Better Auth trusted-origin list. Keiko token issuance additionally
requires an allowlisted exact `Origin`, `Sec-Fetch-Site: same-origin`, a valid
Better Auth session cookie, and a bearer for the same user. No broad CORS or
parent-domain cookie is configured. Existing passkeys are tied to the current
RP ID and cannot be retargeted by changing a URL.

The Web BFF validates the MatMetrics JWT, account routing, and API ownership.
The MatMetrics and Keiko Workers remain separate. Companion should use its own
same-origin API facade and the existing Auth Worker/Keiko boundaries; it must
not send browser cookies or long-lived user credentials directly to Keiko.

## Options considered

| Area | Shared origin with path routing | Separate first-party origins |
| --- | --- | --- |
| Example | `https://<approved-domain>/` for Web and `/companion/` for Companion | `https://app.<approved-domain>` and `https://companion.<approved-domain>`, with a stable auth service URL |
| Deployment | Web and Companion can build and release independently behind a Cloudflare or Vercel routing layer. The routing layer is shared operational infrastructure. | Each frontend can use a separate Vercel project and DNS record. Each needs its own same-origin API facade and trusted-origin entry. |
| Session cookie | One host-only cookie naturally reaches both applications and their same-origin facades. No cookie domain expansion is needed. | Host-only cookies do not cross subdomains. Each app needs a supported login/session establishment flow at its own origin. Do not set a parent-domain cookie to bridge them. |
| WebAuthn | Both pages share one origin and one RP ID after moving to the approved host. | A parent RP ID may cover sibling subdomains after explicit configuration, but it does not make cookies shared. The current Vercel RP ID does not cover a new branded domain. |
| API calls | `/api/*` remains same-origin for Web; Companion can own `/companion/api/*` behind the same host and forward through its own BFF. | Each browser calls its own origin's BFF. Auth and service calls remain server-side. Avoid cross-origin credentials and permissive CORS. |
| Cache and routing | The router must preserve API ownership and `no-store`/private caching. Static assets can be cached by deployment hash; authenticated API responses must not enter a shared cache. | Simpler frontend asset routing, but each origin needs independent cache rules and authenticated API policy. |
| PWA | `/companion/manifest.webmanifest`, `start_url: /companion/`, manifest scope `/companion/`, and a service worker at `/companion/sw.js` keep control within the Companion path. Use a distinct cache prefix and exclude auth/API responses. | Companion can use `/` scope on its own host. It still needs its own cache names and must not cache authenticated API responses. |
| Rollback | Routing can point `/companion/*` back to a previous Companion deployment while leaving Web and API routes intact. A bad shared routing change can affect both apps. | Each frontend rolls back independently. Auth issuer and session continuity still couple their authentication rollout. |
| Operational cost | Requires one routing owner, explicit path/base-path support, route monitoring, and coordination for the shared gateway. | Requires more origin entries, login callback design, per-origin CSRF tests, and a clear Auth Worker deployment and issuer plan. |

## Recommendation

Prefer a shared public origin with path-based routing for the first Companion
release, subject to approval of a durable domain and routing owner. It keeps
browser requests same-origin, preserves host-only cookie behavior, and avoids
cross-origin credential forwarding. Web and Companion can still have separate
repositories, Vercel projects, build pipelines, and rollback targets behind the
router.

This recommendation does not preserve current passkeys by itself. The current
RP ID `matmetrics-teal.vercel.app` is unrelated to an approved branded domain.
A move to that domain requires the staged migration in
[`passkey-domain-migration.md`](./passkey-domain-migration.md). The current
origin must remain available until account recovery and new passkey enrollment
are verified.

Separate origins remain viable if product or deployment ownership requires
them. They require a deliberate per-origin login/session flow. Host-only
cookies must remain host-only; a common RP ID can support passkeys only after
the Auth Worker is configured for the exact browser origins. Do not introduce
cross-origin `fetch` with credentials or unrestricted CORS as a shortcut.

## Changes prepared in Phase 2C

- The Auth Worker reads a validated list of explicitly configured frontend
  origins. The existing production origin remains the sole default.
- HTTPS is required except for HTTP localhost in explicit development mode.
  Wildcards, credentials, URL paths, queries, fragments, lookalike suffixes,
  and origins outside the configured RP ID are rejected.
- Better Auth trusted origins, passkey expected origins, and Keiko token
  exchange checks use that allowlist. The exchange retains its
  `Sec-Fetch-Site: same-origin`, matching-cookie-and-bearer, exact-user, scoped
  token requirements.
- Browser-facing frontend origin and server-side Better Auth public URL are
  separately configured and validated. Production values and the active
  issuer/RP ID are unchanged in this branch.
- No additional production origin or rollout flag is enabled by this code.

## Deployment topology and release sequence

After domain ownership is approved, create independent Web and Companion
projects. A Cloudflare routing Worker or equivalent stable routing layer sends
the root Web paths to the Web deployment, `/companion/*` to the Companion
deployment, `/api/*` to the Web facade, `/companion/api/*` to the Companion
facade, and `/api/auth/*` to the stable Auth Worker. Auth rewrites must preserve
the browser-facing origin for CSRF and passkey checks. Authenticated responses
must be `no-store` or private and must never share a cache across users.

Release sequence:

1. Approve the domain, DNS owner, routing owner, Auth Worker host, and rollback
   operator.
2. Verify Keiko production migration 0008 and deploy the compatible Keiko
   Worker through the approved Keiko release procedure. Keep MatMetrics
   `KEIKO_IDEMPOTENT_CREATE_ENABLED=false` until the Worker is verified.
3. Configure the Auth Worker with only approved origins and an RP ID valid for
   those origins. Preserve the current issuer, audience, and session database.
4. Rehearse login, passkey, password fallback, CSRF, token exchange, expiry,
   sign-out, queue resume, and rollback in staging.
5. Deploy the router, Web, and Companion in that order. Verify API route
   ownership, cache headers, PWA scope, and independent rollback.
6. Enable only the planned account cutover after server and client versions
   pass the production rollout checks.

## Rollback

- Route `/companion/*` to the last known-good Companion deployment or return a
  maintenance response without changing Web API routes.
- Roll back the Web or Companion frontend independently. Keep Keiko's
  idempotency migration and ledger rows; never delete them while a client may
  replay a saved key.
- Keep the old auth origin and old RP ID available while users still need
  existing passkeys. Do not roll back by changing the issuer, signing keys,
  cookie scope, or database binding.
- If a new origin fails, remove that exact origin from the Auth Worker's
  allowlist and route users to the retained login host after confirming active
  sessions and queued data remain recoverable.

## Owner decisions and prerequisites

- Approve the durable public domain and confirm domain/DNS ownership.
- Name the Cloudflare/Vercel routing owner and on-call rollback operator.
- Decide whether auth remains at its current public issuer or moves to a stable
  auth hostname while preserving token-verifier compatibility.
- Approve the passkey migration window and user communication/recovery plan.
- Verify an approved staging account can use password recovery and enroll a
  new-domain passkey before changing production origins.
- Deploy and verify the compatible Keiko Worker before enabling keyed traffic.

Until those decisions are recorded, the existing Vercel origin, issuer, RP ID,
and host-only cookie remain the supported production identity configuration.
