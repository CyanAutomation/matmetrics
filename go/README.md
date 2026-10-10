# MatMetrics Go Tooling

This module adds Go-based operational tooling without changing the live Next.js runtime.

## Commands

Build:

```bash
go build ./go/cmd/matmetrics-cli
```

List sessions as JSON:

```bash
go run ./go/cmd/matmetrics-cli sessions list --data-dir data --format json
```

Validate GitHub access:

```bash
GITHUB_TOKEN=... go run ./go/cmd/matmetrics-cli github validate --owner <owner> --repo <repo> --branch <branch>
```

Bulk sync local markdown sessions to GitHub:

```bash
GITHUB_TOKEN=... go run ./go/cmd/matmetrics-cli github sync-all --data-dir data --owner <owner> --repo <repo> --branch <branch>
```

## Go API authentication

The protected Go API accepts Firebase ID tokens (`RS256`) and Better Auth
service JWTs (`EdDSA`) during the migration. Keep
`FIREBASE_SERVICE_ACCOUNT_KEY` configured while Firebase sign-in remains in
use. Configure the Better Auth verifier in every Vercel environment that runs
the Go API:

```text
MATMETRICS_AUTH_JWKS_URL=https://<app-origin>/api/auth/jwks
MATMETRICS_AUTH_ISSUER=https://<app-origin>
MATMETRICS_AUTH_AUDIENCE=matmetrics-api
```

The JWKS URL is trusted server configuration and must use HTTPS (HTTP is
allowed for loopback development). JWKS requests have a five-second timeout and
a 256 KiB response limit. Keys refresh every 15 minutes; an unknown key ID
triggers a rate-limited refresh to support key rotation. Better Auth tokens
must have valid issuer, audience, expiry, and signature, and their `sub` must
equal the canonical `appUserId`. Neither provider uses email as the account ID.

After successful verification, handlers can read the provider-neutral
`httpapi.AuthenticatedPrincipal` from the request context with
`httpapi.AuthenticatedPrincipalFromContext`. Both `UserID` and `AppUserID` are
the canonical MatMetrics user ID.

Invalid credentials receive HTTP 401, missing verifier configuration receives
HTTP 500, and JWKS or Firebase signing-key fetch failures receive HTTP 503.
The test-token bypass is enabled only when both `MATMETRICS_AUTH_TEST_MODE=true`
and `NODE_ENV=test` are set. Firebase verification remains supported; this PR
does not remove Firebase dependencies.
