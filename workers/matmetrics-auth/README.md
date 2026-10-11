# MatMetrics Auth Worker

This Cloudflare Worker hosts Better Auth for email/password and passkey sign-in.
It binds directly to the existing D1 auth tables. The data Worker remains the
owner of D1 migration history. Firebase Auth is no longer used; Firebase Admin
and Firestore remain in Next.js as the preferences and plugin-state fallback.

The Next.js app exposes the Worker through a same-origin `/api/auth/*` rewrite.
The browser keeps a host-only Better Auth session cookie on the MatMetrics
origin. Configure the exact frontend origin and WebAuthn RP hostname; do not
use wildcard origins. Local development uses `http://localhost:9002` and RP ID
`localhost`.

## Local setup

Apply the existing additive auth schema using the data Worker migration owner:

```bash
cd workers/matmetrics-data
npm run migrate:local
```

Install the repository dependencies, then run the auth Worker tests and type
check:

```bash
npm ci
npm --prefix workers/matmetrics-auth ci
npm --prefix workers/matmetrics-auth test
npm --prefix workers/matmetrics-auth run typecheck
```

The Vitest suite uses Cloudflare's Worker runtime and D1, loads the real data
Worker migrations, and invokes the Worker entrypoint. It does not send real
email or add a production authentication bypass.

## Configuration

Set these non-secret values in `workers/matmetrics-auth/wrangler.jsonc` or the
matching Cloudflare environment:

- `MATMETRICS_AUTH_PUBLIC_URL`: public MatMetrics origin used for Better Auth
  links and cookies.
- `MATMETRICS_AUTH_FRONTEND_ORIGIN`: exact trusted browser origin.
- `MATMETRICS_AUTH_RP_ID`: frontend hostname or controlled parent domain.
- `MATMETRICS_AUTH_ISSUER` and `MATMETRICS_AUTH_AUDIENCE`: service JWT claims.
- `MATMETRICS_AUTH_EMAIL_FROM`: verified Resend sender, such as
  `MatMetrics <auth@scheimann.xyz>`.
- `MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED`: keep `false` until public
  account creation is intentionally launched.
- `MATMETRICS_AUTH_SIGNIN_ENABLED`: allows passkey sign-in and service JWT
  issuance from a Better Auth session.
- `MATMETRICS_PASSKEY_ENROLMENT_ENABLED`: allows authenticated users to add
  passkeys in account settings.

Set these Worker secrets with Wrangler in every deployed environment:

- `BETTER_AUTH_SECRET`: random server-only Better Auth secret of at least 32
  characters.
- `RESEND_API_KEY`: Resend API key with permission to send from the verified
  sender configured above.

For example:

```bash
cd workers/matmetrics-auth
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put RESEND_API_KEY --env production
```

Keep both secrets only in Cloudflare. Next.js needs
`CLOUDFLARE_AUTH_WORKER_URL`, `MATMETRICS_AUTH_JWKS_URL`,
`MATMETRICS_AUTH_ISSUER`, and `MATMETRICS_AUTH_AUDIENCE`. In the browser, set
`NEXT_PUBLIC_BETTER_AUTH_ENABLED=true` when the Worker and same-origin rewrite
are ready. Signup visibility is controlled by
`NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED`; the Worker flag is authoritative.
Keep the browser flag and Worker signup flag `false` until launch.

The auth Worker uses Resend's Cloudflare-compatible SDK from Better Auth's
verification and password-reset callbacks. Delivery runs under Cloudflare
`waitUntil`; links expire after one hour. Signup and recovery endpoints are
rate limited by Cloudflare bindings. Because requests proxied through Vercel
may share egress IPs, add per-client Vercel Firewall limits for the browser
auth endpoints before opening public signup. Forwarded client-IP headers are
not trusted by the Worker, and rate-limit binding failures return HTTP 503.

## Deployment and account migration

The existing D1 schema already contains Better Auth user, account, session,
verification, and passkey tables; no new D1 migration is needed for password
sign-in. Apply D1 changes through `workers/matmetrics-data` before deploying
the auth Worker:

```bash
cd workers/matmetrics-data
npm run migrate:remote
cd ../matmetrics-auth
npm ci
npx wrangler deploy --env production
```

After deploying the Worker and Next.js rewrite, use the password-reset email
for an existing passkey account to set its first password. Better Auth creates
the credential on that same user ID, preserving passkeys and ownership of
preferences and session data. Confirm password sign-in, reset expiry and
replay rejection, session revocation, passkey sign-in/enrollment, and protected
Next.js and Go API access before disabling Firebase Auth at the project level.
Firebase Admin/Firestore fallback remains in use after that point.

See [`../../docs/better-auth-passkey-migration.md`](../../docs/better-auth-passkey-migration.md)
for the deployment and post-deploy checklist.
