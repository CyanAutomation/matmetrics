# Test Coverage Audit: workers/matmetrics-data/src/index.ts

**Date**: 2026-09-16  
**Status**: Phase 1 Complete  
**Maintainability Score**: 70/100 (significant gaps in critical paths)

---

## Executive Summary

The worker file contains **17 core functions** with **13 existing tests** covering only **2 functions** (safeParseJSON, updateJobStatus). This leaves **15 functions untested**, including critical paths like authentication, job consumption with retry logic, and preference conflict detection.

**Risk Level**: HIGH  
**Recommended Priority**: Add tests for CRITICAL and HIGH functions before modifying retry logic or auth flows.

---

## Function Coverage Matrix

### ✅ TESTED (2 functions, 13 test cases)

| Function | Category | Tests | Details |
|----------|----------|-------|---------|
| `safeParseJSON<T>()` | Utility | 6 | Valid JSON, invalid JSON, empty string, type casting, number/boolean/array handling |
| `updateJobStatus()` | DB Operation | 7 | Status update (basic, with error, with result), non-existent job, error message clearing, combined options, retry scenarios |

### ❌ UNTESTED (15 functions)

#### CRITICAL PRIORITY (Core Logic, Security-Sensitive, High Complexity)

| Function | Lines | Complexity | Why Critical | Scenarios Needed |
|----------|-------|-----------|--------------|------------------|
| `authenticate()` | 56-63 | HIGH | **Security gate for all requests**; 4 validation checks (headers, format, timestamp window, HMAC timing-safe) | Missing headers, invalid auth format, timestamp too old/new, HMAC mismatch, valid signature |
| `consumeMessage()` | 203-234 | HIGH | **Complex retry logic**: increments attempts, sets status, handles 4xx (terminal), 5xx (retry), timeout, max 5 attempts | Success path, 4xx error (terminal), 5xx error (retry), timeout, max attempts exceeded, job already completed/failed, parse error |
| `handlePreferences()` | 237-256 | HIGH | **Conflict detection**: optimistic locking via revision field, upsert logic, 1MB payload limit | GET existing, GET non-existent, PUT update (matching revision), PUT conflict (stale revision), PUT invalid JSON, PUT oversized payload (>1MB), PUT invalid payload structure |

#### HIGH PRIORITY (Important Flows, Validation Logic)

| Function | Lines | Complexity | Why High | Scenarios Needed |
|----------|-------|-----------|----------|------------------|
| `expectedSignature()` | 48-51 | MEDIUM | **HMAC-SHA256 generation** for auth; cryptographic correctness critical | Valid secret/timestamp/method/path, signature determinism, different methods produce different sigs |
| `timingSafeEqual()` | 53-58 | MEDIUM | **Constant-time comparison** prevents timing attacks on HMAC validation | Matching strings, mismatched strings, different lengths |
| `parseJobPayload()` | 67-80 | MEDIUM | **Validation gate** for background job payloads; 4KB size limit, type enum enforcement, field trimming | Valid payload (all fields), missing type/config, invalid type, owner/repo too long (>200 chars), branch trimming, oversized payload (>4KB), non-JSON input |
| `createJob()` | 158-178 | MEDIUM | **Complex flow**: validates payload, inserts DB, queues message, handles DB errors | Valid payload (queues job), invalid payload (400), DB failure (500), job state after creation (status=queued, attempts=0) |
| `executeBackgroundJob()` | 190-201 | MEDIUM | **Network timeout handling**: 30s abort timeout, fetch with bearer token, handles malformed response | Success (2xx response), error response (4xx/5xx), timeout (>30s), malformed response, executor unreachable |

#### MEDIUM PRIORITY (Routes, Transformations, DB Reads)

| Function | Lines | Complexity | Why Medium | Scenarios Needed |
|----------|-------|-----------|-----------|------------------|
| `json()` | 39 | LOW | Response factory with cache headers | Tested implicitly via other tests |
| `hex()` | 41 | LOW | ArrayBuffer → hex string conversion | Tested implicitly via signature tests |
| `toJobResponse()` | 83-90 | LOW | Response object formatting (timestamp conversion, optional fields) | Job with result, job with error, job with both, job with neither |
| `getJob()` | 93 | LOW | Single job DB query by ID | Job exists, job not found |
| `handleBackgroundJobs()` | 181-188 | MEDIUM | Router: POST (create), GET (fetch by ID, auth check) | POST job creation, GET existing job (auth match), GET non-existent, GET job (auth mismatch), invalid route |

#### INTEGRATION PRIORITY (Main Entry Points)

| Function | Lines | Complexity | Why Integration | Scenarios Needed |
|----------|-------|-----------|-----------------|------------------|
| `worker.fetch()` | 258-281 | HIGH | **Main HTTP entry point**; routes to all handlers (background-jobs, plugin-overrides, preferences) | Auth failure → 401, valid auth + /v1/background-jobs POST/GET, /v1/plugin-overrides GET/PUT, /v1/preferences GET/PUT, invalid route → 404 |
| `worker.queue()` | 284-286 | MEDIUM | **Queue consumer entry point**; routes messages to consumeMessage via Promise.all | Single message, batch of 3+ messages, empty batch, message failure handling |

---

## Test Infrastructure Available

✅ **MockD1Database** — In-memory database with INSERT, UPDATE (status-aware), SELECT capabilities  
✅ **MockQueue** — Message tracker with ack/retry simulation (basic)  
✅ **Node.js test runner** — Native `node:test` module (no Jest)  
✅ **Type definitions mirrored** — StoredJob, JobPayload, JobType, JobStatus already defined in test file  

### Gaps in Mocks

- **No MockMessage with ack()/retry()** — Currently only MockQueue tracks messages; consumeMessage expects `Message<T>` with methods
- **No MockRequest/Response** — authenticate() and worker.fetch() expect web standard Request; need fetch mock or full Request builder
- **No fetch mock** — executeBackgroundJob() calls fetch(); need to mock HTTP client or use MSW/similar
- **Env mocking basic** — Current tests use MockD1Database, but don't mock MATMETRICS_* secrets or full Env object

---

## Recommended Test Implementation Order

### Phase 2a: Crypto & Auth (Foundational, 3–4 days)

1. ✅ **expectedSignature()** — HMAC-SHA256 correctness
   - Dependencies: crypto.subtle (native), TextEncoder (native)
   - No external mocks needed
2. ✅ **timingSafeEqual()** — Constant-time comparison
   - Dependencies: none
   - Low complexity
3. ✅ **authenticate()** — Full request auth flow
   - Dependencies: expectedSignature, timingSafeEqual, Env
   - Will need: Mock Request builder, Env with secrets

### Phase 2b: Validation (Input Boundaries, 2–3 days, parallel with 2a)

4. ✅ **parseJobPayload()** — Payload validation
   - Dependencies: none (pure)
   - Test data: valid, oversized, missing fields, invalid types
2. ✅ **toJobResponse()** — Response formatting
   - Dependencies: toJobResponse only uses data from StoredJob
   - Simple, can pair with createJob tests

### Phase 2c: Database Operations (2–3 days, parallel with 2a/b)

6. ✅ **getJob()** — DB read
   - Dependencies: Env.DB
   - Extend MockD1Database.executeFirst() to support SELECT queries
2. ✅ **createJob()** — DB write + queue
   - Dependencies: parseJobPayload, getJob, updateJobStatus (already tested), Env
   - Will need: Mock Queue verification

### Phase 2d: Network & Retry Logic (CRITICAL, 4–5 days, depends on 2a/b/c)

8. ✅ **executeBackgroundJob()** — Network fetch
   - Dependencies: safeParseJSON (already tested), Env
   - Will need: fetch mock (agent or MSW)
2. ✅ **consumeMessage()** — Job consumption + retry
   - Dependencies: getJob, updateJobStatus, executeBackgroundJob
   - Complex state machine: needs 5+ test scenarios for retry paths
3. ✅ **handlePreferences()** — Conflict detection
    - Dependencies: safeParseJSON (already tested), Env.DB
    - Extend MockD1Database for user_preferences table queries

### Phase 2e: Routing & Integration (2–3 days, depends on 2d)
 1. ✅ **handleBackgroundJobs()** — Router
    - Dependencies: createJob, getJob
    - Simpler than full fetch integration
 2. ✅ **worker.fetch()** — Main HTTP entry
    - Dependencies: authenticate, handleBackgroundJobs, handlePreferences, worker.fetch routing
    - Full end-to-end: auth → route → handler → response
 3. ✅ **worker.queue()** — Queue entry
    - Dependencies: consumeMessage
    - Simpler: just verify Promise.all handles batch

### Phase 3 (Optional, 1–2 days)

- Code coverage measurement
- Identify any gaps
- Target 85%+ coverage

---

## Mock Infrastructure Needed

### Request/Response Builders

```typescript
// Need to implement
class MockRequest {
  constructor(options: { url: string; method: string; headers: Record<string; string>; body?: string })
}

class MockResponse {
  constructor(body?: string, status?: number)
  text(): Promise<string>
  ok: boolean
  status: number
}
```

### Enhanced Env Mock

```typescript
// Extend existing with secrets
interface MockEnv extends Env {
  DB: MockD1Database
  BACKGROUND_JOBS: MockQueue<{id: string}>
  MATMETRICS_INTERNAL_API_SECRET: string
  MATMETRICS_BACKGROUND_EXECUTOR_URL: string
  MATMETRICS_BACKGROUND_EXECUTOR_SECRET: string
}
```

### Message Mock (for consumeMessage)

```typescript
class MockMessage<T> {
  constructor(public body: T) {}
  async ack(): Promise<void> { /* mark as acked */ }
  async retry(): Promise<void> { /* mark for retry */ }
}
```

### Fetch Mock

**Option 1**: Use `globalThis.fetch` override (simple for single function)  
**Option 2**: Use MSW (Mock Service Worker) for full router integration tests  
**Option 3**: Extract fetch into dependency-injected function (requires refactoring index.ts)

---

## Risk Assessment

| Risk | Current State | Impact if Untested | Post-Tests |
|------|---------------|-------------------|-----------|
| **Auth bypass** | authenticate() untested | 401 validation could be broken; security gate failing silently | Critical path verified |
| **Retry loop** | consumeMessage() untested | Max attempts limit could be broken; jobs retry forever; customer data stalled | Retry state machine validated |
| **Conflict overwrites** | handlePreferences() untested | Optimistic locking broken; user preferences corrupted on concurrent edits | Conflict detection verified |
| **Crypto signature** | expectedSignature() untested | HMAC could be wrong; auth would fail or be bypassable | Determinism + correctness verified |
| **Payload bombs** | parseJobPayload() untested | 4KB limit could be broken; executor receives 100KB+ payloads | Validation boundaries confirmed |

---

## Success Criteria

✅ **Phase 1 Complete**: This audit document  
✅ **Phase 2 Complete**:

- All 15 untested functions have at least 1 test case per scenario (30+ new tests)
- Critical functions (authenticate, consumeMessage, handlePreferences) have 3+ scenario tests each
- All tests pass locally: `npm test -- workers/matmetrics-data/src/index.test.ts`
- No regressions in existing 13 tests

✅ **Phase 3 Complete (Optional)**:

- Code coverage ≥85% on workers/matmetrics-data/src/index.ts
- Coverage report committed to repo

---

## Next Steps

1. **Implement mock infrastructure** (Request, Response, Message builders) — Shared across all Phase 2 tests
2. **Start Phase 2a** (crypto/auth) — Highest security priority
3. **Parallelize Phase 2b/c** (validation/DB) — Lower complexity, can start immediately
4. **Sequence Phase 2d** (network/retry) — Depends on mocks and DB tests
5. **Integrate Phase 2e** (routing/worker entry) — Validates entire flow

---

## Files Modified

- **workers/matmetrics-data/src/index.test.ts** — Add ~30–40 new test cases and mock infrastructure
- **workers/matmetrics-data/src/index.ts** — No changes needed (tests as-is)
- **COVERAGE_AUDIT.md** — This document (reference only)

---

## Appendix: Function Signatures for Reference

```typescript
// UNTESTED FUNCTIONS (quick reference)

function json(body: unknown, status = 200): Response
function hex(bytes: ArrayBuffer): string
async function expectedSignature(secret: string, timestamp: string, method: string, path: string, body: string): Promise<string>
function timingSafeEqual(left: string, right: string): boolean
async function authenticate(request: Request, env: Env, body: string): Promise<{userId: string} | Response>
function parseJobPayload(body: string): JobPayload | null
function toJobResponse(job: StoredJob): Record<string, unknown>
async function getJob(env: Env, id: string): Promise<StoredJob | null>
async function createJob(env: Env, userId: string, body: string): Promise<Response>
async function handleBackgroundJobs(request: Request, env: Env, userId: string, body: string, pathname: string): Promise<Response>
async function executeBackgroundJob(env: Env, job: StoredJob): Promise<Response>
async function consumeMessage(env: Env, message: Message<{id: string}>): Promise<void>
async function handlePreferences(request: Request, env: Env, userId: string, body: string): Promise<Response>
worker.fetch(request, env): Promise<Response>
worker.queue(batch, env): Promise<void>
```

---

**Document Version**: 1.0  
**Author**: Coverage Audit Phase 1  
**Approval Status**: Awaiting review and Phase 2 implementation decision
