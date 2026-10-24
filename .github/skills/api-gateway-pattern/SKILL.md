---
name: api-gateway-pattern
description: Add or change Next.js route handlers that authorize requests and proxy operations to the Go API.
license: MIT
---

# API Gateway Pattern

Use this skill for changes to the TypeScript API routes that forward work to Go. Follow the existing route and proxy helpers; do not recreate a generic gateway layer from examples.

## Current request path

The catch-all [API route handler](../../../src/app/api/[...path]/route.ts) dispatches requests to endpoint-specific `api-handler.ts` modules. For sessions, read the relevant [create handler](../../../src/app/api/sessions/create/api-handler.ts), [list handler](../../../src/app/api/sessions/list/api-handler.ts), or [ID handler](../../../src/app/api/sessions/[id]/api-handler.ts), along with the [proxy helper](../../../src/lib/go-function-proxy.ts) and [GitHub authorization helper](../../../src/lib/server-github-authz.ts).

Session handlers have endpoint-specific request shapes and order. For create and update requests, preserve the existing sequence:

1. Authenticate with requireAuthenticatedUser. It can return a NextResponse; return that response before using the user.
2. Parse an object body and validate it with the session validator.
3. For users selected by isKeikoCutoverUser, forward the request through the Keiko session gateway with the required scope. This happens before GitHub config authorization.
4. Otherwise, resolve the user’s stored GitHub configuration and reject a mismatched requested repository.
5. Proxy when shouldProxyGitHubRequests(config) selects the Go path. Build the body with the existing helper.
6. Use the session storage layer only when that handler selects it. Local storage is not available in Vercel deployments outside development; see [storage-facade](../storage-facade/SKILL.md). Never add a local retry after a failed remote write.

proxyGoFunction uses MATMETRICS_GO_PROXY_BASE_URL when set and otherwise targets the current origin. It forwards the authorization header. JSON replies are parsed and rebuilt; some non-JSON failures are wrapped in a controlled JSON error, while connection failures and timeouts become 503 and 504 responses. Read the helper and its tests before changing these semantics. It does not retry a failed request against local storage: a failed GitHub write followed by a local write can split or duplicate data.

## Change workflow

- Read the specific route, shared helper, and its route tests before editing. Do not assume every route has identical request or response shapes.
- For session routes, account for both the Keiko cutover path and the GitHub/Go path before changing request ordering or authorization.
- Keep authorization checks in front of any operation that uses a requested repository.
- Preserve the established error body and HTTP status unless the API contract is intentionally changing.
- Add or update tests for authentication rejection, invalid input, repository authorization, the selected local/proxy path, and upstream error responses as relevant.
- Before changing a Next.js route handler, read the installed Route Handler guide under node_modules/next/dist/docs as required by AGENTS.md.

## References

- [API route handler](../../../src/app/api/[...path]/route.ts)
- [Session create handler](../../../src/app/api/sessions/create/api-handler.ts)
- [Session list handler](../../../src/app/api/sessions/list/api-handler.ts)
- [Session ID handlers](../../../src/app/api/sessions/[id]/api-handler.ts)
- [Go proxy helper](../../../src/lib/go-function-proxy.ts)
- [Keiko session gateway](../../../src/lib/keiko-session-gateway.server.ts)
- [Server authentication](../../../src/lib/server-auth.ts)
- [GitHub config authorization](../../../src/lib/server-github-authz.ts)
- [Session route tests](../../../src/tests/api-sessions-create-route.test.ts)
- [Go session API](../../../api/go/sessions/)
