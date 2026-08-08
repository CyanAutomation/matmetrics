---
name: storage-facade
description: Orchestrate multi-layer storage backends (GitHub, local file, Firebase) with fallback logic. Covers caching strategy, sync queue, concurrency patterns, and testable file I/O.
license: MIT
---

# Multi-Layer Storage Facade

MatMetrics uses a three-layer storage architecture to support multiple backends: GitHub-backed (primary when configured), local markdown files (fallback), and Firebase Firestore (metadata only). This skill covers the orchestration logic, caching strategy, offline sync queue, and testing patterns for this complex multi-backend system.

## When to Use

- Adding a new storage layer or backend
- Debugging storage routing (why is a request going to GitHub vs. local file?)
- Implementing offline sync queue features (lease renewal, conflict resolution)
- Caching invalidation strategy (when to clear manifest cache, branch cache, etc.)
- Testing storage operations with temp directories or mock backends
- Implementing fallback logic or failover between backends
- Optimizing storage I/O (N+1 prevention, manifest caching)

## When NOT to Use

- API route handlers (use API Gateway Pattern skill)
- CLI subcommand implementation (use Go CLI Development skill)
- Validating session data (use Cross-Language Parity Testing skill)
- Error handling patterns (use Error Handling Patterns skill)

## Architecture Overview

### Three-Layer Stack

```
┌─────────────────────────────────────────────────────┐
│   Session Storage Orchestrator                      │
│   (src/lib/session-storage.ts)                      │
│   → Routes to GitHub or file storage                │
│   → Handles offline queue                           │
├─────────────────────────────────────────────────────┤
│  GitHub Storage Layer   │   File Storage Layer      │
│  (src/lib/github-      │ (src/lib/file-storage.ts) │
│   storage.ts)          │   → Local markdown files   │
│                        │   → PID-based locking     │
│                        │   → Duplicate detection   │
├─────────────────────────────────────────────────────┤
│  GitHub REST API       │   Node.js fs module       │
│  (authenticated)       │   (.index/ for locks)     │
└─────────────────────────────────────────────────────┘
```

### Orchestrator (Session Storage)

[src/lib/session-storage.ts](../../../src/lib/session-storage.ts) is the single entry point for all session mutations. It decides which backend to use based on configuration.

```typescript
// Example: Create session
export async function createSession(
  session: Session,
  options?: { forceLocal?: boolean }
): Promise<Session> {
  // 1. Check if GitHub is configured and should be used
  const githubConfig = await getStoredGitHubConfig();
  if (githubConfig && !options?.forceLocal) {
    // Route to GitHub storage
    return await githubStorage.create(session);
  }
  
  // 2. Fall back to local file storage
  return await fileStorage.create(session);
}

// Example: List sessions
export async function listSessions(): Promise<Session[]> {
  const githubConfig = await getStoredGitHubConfig();
  
  if (githubConfig) {
    // Check manifest cache first (30s TTL)
    if (!isManifestCacheStale()) {
      return manifestCache.sessions;
    }
    
    // Fetch manifest from GitHub
    const sessions = await githubStorage.list();
    manifestCache.set(sessions);
    return sessions;
  }
  
  // Fall back to local
  return await fileStorage.list();
}
```

**Key patterns:**
- Single entry point: all reads/writes go through orchestrator
- Configuration check: `getStoredGitHubConfig()` determines routing
- Manifest caching: 30s TTL on `list()` operations
- Fallback chain: GitHub → local file
- Force-local option: allow clients to bypass GitHub for testing

### GitHub Storage Layer

[src/lib/github-storage.ts](../../../src/lib/github-storage.ts) handles all GitHub REST API operations with caching and rate-limit handling.

**Manifest Pattern (N+1 Prevention):**

```typescript
// Instead of querying GitHub for each session file location:
// WRONG: O(n) API calls for n sessions
for (const sessionId of sessionIds) {
  const path = await getSessionFilePath(sessionId); // 1 API call each
}

// RIGHT: Load manifest once, cache for 30s
const manifest = await loadManifest(); // 1 API call
// manifest = { 'session-1': { path: 'data/2026/03/...', sha: 'abc...' } }

for (const sessionId of sessionIds) {
  const info = manifest[sessionId]; // O(1) lookup
}
```

**Caching Strategy:**

| Cache | TTL | Key | When to Clear |
|-------|-----|-----|---------------|
| Manifest | 30s | `owner/repo/token/branch` | On write, on `forceRefresh: true` |
| Default Branch | 5min | `owner/repo/token` | On branch change, on config update |
| In-Flight Requests | Lifetime | `(method, url, token)` | Auto (channel closes) |

**Example: Manifest Cache Scope**

```typescript
interface ManifestCacheKey {
  owner: string;
  repo: string;
  tokenFingerprint: string; // sha256(token) to support multi-token
  branch: string;
}

function getCacheKey(config: GitHubConfig, token: string): ManifestCacheKey {
  return {
    owner: config.owner,
    repo: config.repo,
    tokenFingerprint: sha256(token),
    branch: config.branch,
  };
}

// Invalidation: if any part of key changes, cache is stale
export function invalidateManifestCache(config: GitHubConfig) {
  const cacheKey = getCacheKey(config, getToken());
  manifestCache.delete(cacheKey);
}
```

**Key patterns:**
- Manifest keyed by owner+repo+token+branch (not global)
- Default branch cached separately (5min)
- In-flight deduplication: concurrent identical requests share single fetch
- Validation: Owner/repo/branch sanitization (regex, no path traversal)

### File Storage Layer

[src/lib/file-storage.ts](../../../src/lib/file-storage.ts) manages local markdown files with concurrency control.

**File Layout:**

```
data/
  2026/
    03/                              # Month
      20260318-matmetrics-id1.md     # Session markdown
      20260318-matmetrics-id2.md
  .index/                            # Lock directory
    id1/
      <pid>                          # Lock file (PID as filename)
    id2/
      <pid>
```

**Locking Pattern:**

```typescript
async function acquireLock(
  sessionId: string,
  timeoutMs: number = 5000
): Promise<string> {
  const lockDir = path.join('data', '.index', sessionId);
  const lockFile = path.join(lockDir, String(process.pid));
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      // Atomic: create lock file (fails if already exists)
      await fs.promises.mkdir(lockDir, { recursive: true });
      await fs.promises.writeFile(lockFile, '', { flag: 'wx' });
      
      // Clean up stale locks (PIDs that don't exist)
      await cleanStaleLocks(lockDir);
      
      return lockFile;
    } catch (err) {
      if (err instanceof Error && err.message.includes('EEXIST')) {
        // Lock held by another process, retry
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }
      throw err;
    }
  }
  
  throw new Error(`Failed to acquire lock for ${sessionId} after ${timeoutMs}ms`);
}

async function releaseLock(lockFile: string): Promise<void> {
  try {
    await fs.promises.unlink(lockFile);
  } catch (err) {
    // Lock already released, ignore
  }
}
```

**Duplicate Detection:**

```typescript
// After write, scan for sessions with duplicate IDs
async function detectDuplicates(dataDir: string): Promise<string[]> {
  const sessions = new Map<string, string[]>(); // sessionId -> [paths]
  
  for await (const [filePath, session] of walkSessions(dataDir)) {
    if (!sessions.has(session.id)) {
      sessions.set(session.id, []);
    }
    sessions.get(session.id)!.push(filePath);
  }
  
  return Array.from(sessions.entries())
    .filter(([_, paths]) => paths.length > 1)
    .map(([id, _]) => id);
}

// If duplicates found, raise error with all conflicting paths
if (duplicates.length > 0) {
  throw new Error(
    `Duplicate session IDs found: ${duplicates.join(', ')}. ` +
    `Manual cleanup required in data/ directory.`
  );
}
```

**Key patterns:**
- Per-session lock files in `.index/` (not a global lock)
- Exponential backoff retry (50ms, 100ms, 150ms, ...)
- Stale lock cleanup (remove PIDs not running)
- Conflict detection: store mutation version to detect concurrent edits
- Legacy compatibility: session ID lookup checks both encoded and sanitized formats

### Offline Sync Queue

[src/lib/sync-queue.ts](../../../src/lib/sync-queue.ts) is a client-side localStorage queue for offline mutations. It retries failed operations on reconnect.

**Lease Pattern:**

```typescript
// Client acquires a lease to work on a mutation
interface Lease {
  mutationId: string;
  acquiredAt: number;
  ttl: number; // milliseconds
  heartbeatInterval: number;
}

async function acquireLease(mutationId: string, ttlMs: number = 45_000) {
  const lease: Lease = {
    mutationId,
    acquiredAt: Date.now(),
    ttl: ttlMs,
    heartbeatInterval: 5_000,
  };
  
  // Store lease in localStorage
  localStorage.setItem(`lease:${mutationId}`, JSON.stringify(lease));
  
  // Heartbeat: extend lease before expiration
  const heartbeat = setInterval(() => {
    const current = JSON.parse(localStorage.getItem(`lease:${mutationId}`) || '{}');
    current.acquiredAt = Date.now();
    localStorage.setItem(`lease:${mutationId}`, JSON.stringify(current));
  }, lease.heartbeatInterval);
  
  return { ...lease, cancel: () => clearInterval(heartbeat) };
}

// Another tab tries to acquire same mutation
function canAcquireLease(mutationId: string): boolean {
  const lease = JSON.parse(localStorage.getItem(`lease:${mutationId}`) || 'null');
  if (!lease) return true; // No existing lease
  
  // Lease expired (takeover allowed)
  const ageMs = Date.now() - lease.acquiredAt;
  return ageMs > lease.ttl;
}
```

**Deduplication:**

```typescript
// Queue stored by session ID; only latest operation per session
interface SyncQueueEntry {
  sessionId: string;
  operation: 'create' | 'update' | 'delete';
  sessionData: Session;
  timestamp: number;
  attempts: number;
}

function enqueue(entry: SyncQueueEntry) {
  // Delete old entry for same session (keep only latest)
  const existing = queue.find(e => e.sessionId === entry.sessionId);
  if (existing) {
    queue = queue.filter(e => e.sessionId !== entry.sessionId);
  }
  
  queue.push(entry);
  persist();
}

// On reconnect, retry all mutations
async function flushQueue() {
  for (const entry of queue) {
    try {
      const lease = await acquireLease(entry.sessionId);
      
      // Retry operation
      await session-storage[entry.operation](entry.sessionData);
      
      // Success: remove from queue
      queue = queue.filter(e => e !== entry);
      persist();
      
      lease.cancel();
    } catch (err) {
      entry.attempts++;
      if (entry.attempts > MAX_RETRIES) {
        // Quarantine: move to backup
        localStorage.setItem(`queue__corrupt_backup`, JSON.stringify(entry));
      }
      persist();
    }
  }
}
```

**Key patterns:**
- Lease TTL: 45s default (configurable via env var `NEXT_PUBLIC_SYNC_LEASE_TTL_MS`)
- Heartbeat: extend lease every 5s (configurable via env var `NEXT_PUBLIC_SYNC_HEARTBEAT_MS`)
- Deduplication: one entry per session ID (latest operation wins)
- Takeover: if lease expired, another tab can acquire it
- Quarantine: corrupt or permanently failed mutations moved to backup
- Multi-tab safe: via localStorage mutation observer events

## Caching Invalidation Strategy

**When to Clear Manifest Cache:**

```typescript
// After any write operation, invalidate manifest
export async function createSession(session: Session) {
  const result = await storageLayer.create(session);
  invalidateManifestCache(); // Clear 30s cache
  return result;
}

// On forceRefresh flag
export async function listSessions(options?: { forceRefresh?: boolean }) {
  if (options?.forceRefresh) {
    invalidateManifestCache();
  }
  return storageLayer.list();
}

// On GitHub config change
export async function setGitHubConfig(config: GitHubConfig) {
  await firebaseStorage.saveConfig(config);
  invalidateManifestCache(); // New owner/repo/branch, cache stale
  invalidateDefaultBranchCache();
}
```

**When to Clear Default Branch Cache:**

- On config change (owner/repo)
- Never on mutation (default branch doesn't change)
- Manual: `clearDefaultBranchCache()` in CLI

## Testing Patterns

### Temp Directory Isolation

```typescript
// Test helper: creates temp dataDir and resets for test
async function withTempDataDir(
  run: (dataDir: string) => Promise<void>
) {
  const dataDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'matmetrics-test-')
  );
  
  // Inject temp dataDir into storage layer
  __setDataDirForTests(dataDir);
  
  try {
    await run(dataDir);
  } finally {
    await fs.promises.rm(dataDir, { recursive: true });
  }
}

// Usage in test
test('should detect duplicate sessions', async () => {
  await withTempDataDir(async (dataDir) => {
    // Create two sessions with same ID
    await fileStorage.create({ id: 'dup', date: '2026-03-18' });
    
    try {
      await fileStorage.create({ id: 'dup', date: '2026-03-18' });
      fail('Should have thrown duplicate error');
    } catch (err) {
      expect(err).toMatch(/Duplicate session IDs/);
    }
  });
});
```

### GitHub API Mocking

```typescript
// Mock GitHub response
function mockGitHubAPI(manifest: Record<string, any>) {
  return {
    list: async () => manifest,
    get: async (sessionId: string) => manifest[sessionId],
    // ... other methods
  } as any;
}

// Test
test('should use manifest cache', async () => {
  const mockGH = mockGitHubAPI({
    'session-1': { path: 'data/2026/03/...', sha: 'abc' },
  });
  
  __setGitHubStorageForTests(mockGH);
  
  // First call: populates cache
  await storageOrchestrator.listSessions();
  
  // Second call: uses cache (no API call)
  await storageOrchestrator.listSessions();
  
  expect(mockGH.list).toHaveBeenCalledTimes(1); // Only called once
});
```

### Sync Queue Testing

```typescript
test('should deduplicate mutations', async () => {
  const queue = new SyncQueue();
  
  // Enqueue create, then update for same session
  queue.enqueue({
    sessionId: 'sess-1',
    operation: 'create',
    sessionData: { id: 'sess-1', title: 'Old' },
  });
  
  queue.enqueue({
    sessionId: 'sess-1',
    operation: 'update',
    sessionData: { id: 'sess-1', title: 'New' },
  });
  
  // Queue should have only one entry (the update)
  expect(queue.entries).toHaveLength(1);
  expect(queue.entries[0].operation).toBe('update');
});

test('should handle lease expiration', async () => {
  const lease = await acquireLease('sess-1', 100); // 100ms TTL
  
  await new Promise(resolve => setTimeout(resolve, 150)); // Wait for expiry
  
  // Another caller can now take over
  const canTakeover = canAcquireLease('sess-1');
  expect(canTakeover).toBe(true);
});
```

## Common Gotchas

### Manifest Cache Scope Confusion

**Problem:** Manifest cache keyed globally instead of per (owner+repo+token+branch).

```typescript
// WRONG: Single cache for all configs
const manifestCache = new Map<string, Session[]>();

// If user switches from repo A to repo B without clearing cache:
// → User sees sessions from repo A even though reading repo B

// RIGHT: Include all cache key components
const manifestCache = new Map<ManifestCacheKey, Session[]>();
```

**Impact:** Users see stale sessions when switching repos or rotating GitHub tokens.

### Session ID Expansion Beyond 100-char Limit

**Problem:** URL encoding can expand session IDs significantly.

```typescript
// Example: sessionId = 'a/b/c/d' (7 chars)
// URL-encoded: 'a%2Fb%2Fc%2Fd' (16 chars)

// If original limit was 50 chars, encoded might be 150+
// → Exceeds filesystem constraints or GitHub API limits

// FIX: Enforce 100-char limit BEFORE encoding
const MAX_SESSION_ID_LEN = 100;
if (sessionId.length > MAX_SESSION_ID_LEN) {
  throw new Error(`Session ID too long: ${sessionId.length} > ${MAX_SESSION_ID_LEN}`);
}

const encoded = encodeURIComponent(sessionId); // Now safe to encode
```

**Impact:** Requests silently fail or corrupt session files without clear error message.

### Lease Renewal Without Heartbeat

**Problem:** Lease acquired but never renewed; expires and another tab takes over.

```typescript
// WRONG: Acquire lease but no heartbeat
const lease = await acquireLease(sessionId);
await slowNetworkOperation(); // Takes 2 minutes

// Meanwhile: lease expires after 45s
// Another tab takes over and corrupts the session

// RIGHT: Use heartbeat
const lease = await acquireLease(sessionId, { heartbeatInterval: 5000 });
try {
  await slowNetworkOperation(); // Heartbeat keeps lease alive
} finally {
  lease.cancel(); // Clean up heartbeat
}
```

**Impact:** Concurrent mutations from multiple tabs can corrupt session data.

### Config Authorization Check Missing

**Problem:** `resolveAuthorizedGitHubConfig()` doesn't verify requested config matches stored config.

```typescript
// WRONG: Accept any GitHub config
export async function createSession(session, githubConfig) {
  return githubStorage.create(session, githubConfig); // No validation
}

// Attacker calls: createSession(session, { owner: 'victim', repo: 'repo' })
// → Session created in victim's repo instead of authenticated user's repo

// RIGHT: Validate config matches stored config
export async function createSession(session, requestedConfig) {
  const storedConfig = await getStoredGitHubConfig();
  
  if (requestedConfig && 
      (requestedConfig.owner !== storedConfig.owner ||
       requestedConfig.repo !== storedConfig.repo)) {
    throw new Error('Requested GitHub config does not match stored config');
  }
  
  return githubStorage.create(session, storedConfig);
}
```

**Impact:** Unauthorized writes to arbitrary GitHub repos.

## References

- [src/lib/session-storage.ts](../../../src/lib/session-storage.ts) — Orchestrator entry point
- [src/lib/github-storage.ts](../../../src/lib/github-storage.ts) — GitHub layer, manifest caching
- [src/lib/file-storage.ts](../../../src/lib/file-storage.ts) — Local file layer, locking
- [src/lib/sync-queue.ts](../../../src/lib/sync-queue.ts) — Offline sync queue
- [src/tests/api-sessions-*.test.ts](../../../src/tests) — Integration tests
- [docs/go-contract.md](../../../docs/go-contract.md) — Session shape contract

## Next Steps

- Plan a new storage feature (e.g., read-through Firebase cache)
- Implement without referring to existing code; use this skill to guide architecture
- Write tests using temp directory fixtures and mock GitHub responses
- Verify cache invalidation strategy handles your new feature
