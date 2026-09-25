---
name: api-gateway-pattern
description: Add or change Next.js route handlers that authorize requests and proxy operations to the Go API.
license: MIT
---

# API Gateway Pattern

Use this skill for changes to the TypeScript API routes that forward work to Go. Follow the existing route and proxy helpers; do not recreate a generic gateway layer from examples.

## Current request path

For session mutations, start with the current implementation in [create route](../../../src/app/api/sessions/create/route.ts), [proxy helper](../../../src/lib/go-function-proxy.ts), and [GitHub authorization helper](../../../src/lib/server-github-authz.ts).

Preserve the route’s existing order and response behavior:

1. Authenticate with requireAuthenticatedUser. It can return a NextResponse; return that response before using the user.
2. Parse an object body and validate it with the session validator.
3. Resolve the user’s stored GitHub configuration and reject a mismatched requested repository.
4. Proxy when shouldProxyGitHubRequests(config) says the configured GitHub request belongs on the Go path. Build the body with the existing helper.
5. Use local storage only when the route selects that path because GitHub storage is not configured for the request.

proxyGoFunction uses MATMETRICS_GO_PROXY_BASE_URL when set and otherwise targets the current origin. It forwards the authorization header and preserves upstream status and response bodies. It does not health-check the Go service or retry a failed request against local storage. Do not add such a fallback: a failed GitHub write followed by a local write can split or duplicate data.

## Change workflow

- Read the specific route, shared helper, and its route tests before editing. Do not assume every route has identical request or response shapes.
- Keep authorization checks in front of any operation that uses a requested repository.
- Preserve the established error body and HTTP status unless the API contract is intentionally changing.
- Add or update tests for authentication rejection, invalid input, repository authorization, the selected local/proxy path, and upstream error responses as relevant.
- Before changing a Next.js route handler, read the installed Route Handler guide under node_modules/next/dist/docs as required by AGENTS.md.

## References

- [Session create route](../../../src/app/api/sessions/create/route.ts)
- [Session item routes](../../../src/app/api/sessions/[id]/route.ts)
- [Go proxy helper](../../../src/lib/go-function-proxy.ts)
- [Server authentication](../../../src/lib/server-auth.ts)
- [GitHub config authorization](../../../src/lib/server-github-authz.ts)
- [Session route tests](../../../src/tests/api-sessions-create-route.test.ts)
- [Go session API](../../../api/go/sessions/)
