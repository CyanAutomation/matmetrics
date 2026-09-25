---
name: error-handling-patterns
description: Add or change error handling in MatMetrics routes, storage, sync, or Go APIs.
license: MIT
---

# Error Handling in MatMetrics

Use this skill when adding an error case, changing how an error crosses an API boundary, or improving recovery and user-facing messages.

## Follow the owning subsystem

MatMetrics does not have one shared TypeScript/Go error hierarchy. Start with the error type and tests in the subsystem being changed:

- GitHub storage defines private API errors and an exported revision-conflict error in [github-storage.ts](../../../src/lib/github-storage.ts).
- Queue retries classify sync errors in [storage-queue.ts](../../../src/lib/storage-queue.ts).
- AI responses use their own codes and classification in [ai-api-error.ts](../../../src/lib/ai-api-error.ts).
- Route authentication returns an error NextResponse from [server-auth.ts](../../../src/lib/server-auth.ts).
- Go HTTP responses are written by [internal/httpapi/httpapi.go](../../../internal/httpapi/httpapi.go).

Most route and Go API errors use an HTTP status and a JSON object with an error field. Preserve the existing response shape for that endpoint. Do not add categories, context envelopes, or a common base class unless the user asks to change the contract and both producers and consumers are updated.

## Workflow

1. Trace the error from where it is created to the route, client, or queue that consumes it.
2. Choose the existing typed error, status, or response pattern for that subsystem. Keep retryable failures distinguishable from validation, authorization, and conflict failures.
3. Make the message actionable but omit credentials, tokens, private configuration, and full request bodies.
4. Preserve causes for logs when useful; return only the intended public message to clients.
5. Add a focused test for the new classification or response, plus a caller test when propagation changes.

Do not sign users out for an unrecognized error. Unknown failures should follow the existing route or subsystem fallback and logging behavior.

## References

- [Session create route](../../../src/app/api/sessions/create/route.ts)
- [Go session create handler](../../../api/go/sessions/create/index.go)
- [Go HTTP response helpers](../../../internal/httpapi/httpapi.go)
- [GitHub storage errors](../../../src/lib/github-storage.ts)
- [Sync queue error handling](../../../src/lib/storage-queue.ts)
- [AI API error handling](../../../src/lib/ai-api-error.ts)
