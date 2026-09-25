---
name: storage-facade
description: Change session persistence, GitHub/local routing, caching, or the offline sync queue.
license: MIT
---

# Session Storage

Use this skill when changing session reads, writes, persistence routing, caching, or queued sync.

## Storage boundaries

- [session-storage.ts](../../../src/lib/session-storage.ts) selects GitHub or local file storage for server-side session operations.
- [github-storage.ts](../../../src/lib/github-storage.ts) implements GitHub reads and writes.
- [file-storage.ts](../../../src/lib/file-storage.ts) manages local markdown files and file locking.
- Firebase stores user preferences and configuration; session files are stored in GitHub or local markdown.
- [storage.ts](../../../src/lib/storage.ts), [storage-queue.ts](../../../src/lib/storage-queue.ts), and the sync lease implementation coordinate queued client mutations.

Read the caller and the owning storage layer before editing. Do not assume every route passes through the same facade.

## Routing and consistency

The server uses GitHub storage when a valid GitHub config and GITHUB_TOKEN are available; otherwise it selects local storage. A GitHub error is returned to the caller. There is no automatic fallback from a failed GitHub read or write to local storage. Preserve that distinction so one logical session does not silently split across backends.

The Next.js API routes may also proxy configured GitHub work to Go. Follow the route’s selected behavior and the gateway guidance in [api-gateway-pattern](../api-gateway-pattern/SKILL.md).

## Cache and queue invariants

- The default-branch cache has a five-minute TTL. The session manifest is a scoped lookup map with explicit invalidation; do not assume it has a time-based TTL. See [github-storage.ts](../../../src/lib/github-storage.ts) before changing cache behavior.
- Cache scope and invalidation must continue to respect the repository, branch, and token context used by the implementation.
- Queue operations check lease ownership and storage generation before and after requests. Successful mutations reconcile revision SHAs into later queued work. Keep these checks when changing retry or cancellation behavior.
- Do not replace the lease protocol with a localStorage read/write example: it would not preserve the current ownership and generation guarantees.

## Change workflow

1. Trace the operation from route or UI through the orchestrator to the backend.
2. Add a focused failing test for the desired routing, cache, lock, or queue invariant.
3. Update the owning layer and its caller only as needed.
4. Test local and GitHub paths separately, including failed requests and queued retries where relevant.
5. Run npm run test:all for the TypeScript suite; use npm run go:test for changes to the Go storage implementation.

## References

- [Session storage](../../../src/lib/session-storage.ts)
- [GitHub storage](../../../src/lib/github-storage.ts)
- [Local file storage](../../../src/lib/file-storage.ts)
- [Storage orchestration](../../../src/lib/storage.ts)
- [Queue operation processing](../../../src/lib/storage-queue.ts)
- [Sync lease](../../../src/lib/sync-lease.ts)
- [Storage tests](../../../src/lib/storage.test.ts)
- [Session storage tests](../../../src/lib/session-storage.test.ts)
