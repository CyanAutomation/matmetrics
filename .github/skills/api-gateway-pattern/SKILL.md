---
name: api-gateway-pattern
description: Build TypeScript API route handlers that proxy complex operations to Go backends. Covers request transformation, dual-mode auth, fallback logic, and end-to-end testing.
license: MIT
---

# TypeScript + Go API Gateway Pattern

MatMetrics uses TypeScript (Next.js route handlers) as a gateway for complex business logic implemented in Go. Session CRUD operations, GitHub sync, and validation often route from TypeScript to Go backends. This skill covers the pattern for building this gateway layer: request transformation, auth dual-mode, fallback to local storage, and testing the round-trip.

## When to Use

- Building a new API route handler in `src/app/api/`
- Adding a new complex operation that should be implemented in Go but exposed via TypeScript
- Debugging request/response transformation between TypeScript and Go
- Testing the proxy chain (TypeScript → Go and fallback)
- Implementing auth in both TypeScript and Go handlers
- Adding caching or rate-limiting to the gateway

## When NOT to Use

- Simple storage operations that don't need complex logic (use storage-facade skill)
- Go CLI subcommands (use Go CLI Development skill)
- Frontend route handlers (use Next.js docs)
- Testing individual TypeScript or Go implementations separately (use language-specific test skills)

## Architecture Overview

### Request Flow

```
Client Request
  ↓
TypeScript Route Handler (src/app/api/sessions/[id]/route.ts)
  ├─ Extract & validate auth
  ├─ Resolve GitHub config (stored in Firebase)
  ├─ Check if should proxy to Go
  │ ├─ YES: Format request for Go backend, proxy to MATMETRICS_GO_PROXY_BASE_URL
  │ └─ NO: Handle locally with file storage
  ├─ Transform response (if needed)
  └─ Return to client
```

### TypeScript Route Handler Pattern

[src/app/api/sessions/create/route.ts](../../../src/app/api/sessions/create/route.ts) demonstrates the full pattern:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { resolveAuthorizedGitHubConfig } from '@/lib/session-storage';
import { createSession as createSessionLocal } from '@/lib/file-storage';

export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate user (dual-mode: Firebase or test-token)
    const user = await requireAuthenticatedUser(request);
    
    // Step 2: Parse request body
    const sessionData = await request.json();
    
    // Step 3: Validate session shape
    if (!sessionData.id || !sessionData.date) {
      return NextResponse.json(
        { error: 'Missing required fields: id, date' },
        { status: 400 }
      );
    }
    
    // Step 4: Resolve GitHub config (user-stored or request override)
    const githubConfig = await resolveAuthorizedGitHubConfig(
      user.uid,
      sessionData.gitHubConfig // Optional override from client
    );
    
    // Step 5: Decide routing: GitHub or local
    if (githubConfig && shouldProxyGitHubRequests()) {
      // Route to Go backend
      return await proxyToGoBackend('/sessions', 'POST', sessionData);
    }
    
    // Step 6: Fallback: handle locally
    const result = await createSessionLocal(sessionData);
    return NextResponse.json(result);
    
  } catch (error) {
    return errorResponse(error);
  }
}
```

**Key patterns:**
1. Authenticate first (dual-mode auth)
2. Parse and validate request
3. Resolve configuration (merge stored + request-provided)
4. Make routing decision (proxy to Go or handle locally)
5. Transform response if needed
6. Handle errors consistently

### Auth Dual-Mode Implementation

Both TypeScript and Go must accept test-token in test mode and Firebase tokens in production.

**TypeScript:**

```typescript
// src/lib/server-auth.ts
export async function requireAuthenticatedUser(
  request: Request
): Promise<{ uid: string; email?: string }> {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  
  if (!token) {
    throw new AuthError('Missing authorization header', 401);
  }

  // Test mode: accept 'test-token'
  if (process.env.MATMETRICS_AUTH_TEST_MODE === 'true') {
    if (token === 'test-token') {
      return { uid: 'test-user', email: 'test@example.com' };
    }
    throw new AuthError('Invalid test token', 401);
  }

  // Production: verify Firebase ID token
  const decodedToken = await admin.auth().verifyIdToken(token);
  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
  };
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  return parts[1];
}
```

**Go:**

```go
// internal/httpapi/httpapi.go
func RequireAuthenticatedUser(r *http.Request) (uid, email string, err error) {
  authHeader := r.Header.Get("Authorization")
  token := extractBearerToken(authHeader)
  
  if token == "" {
    return "", "", fmt.Errorf("missing authorization header")
  }

  // Test mode: accept 'test-token'
  if os.Getenv("MATMETRICS_AUTH_TEST_MODE") == "true" {
    if token == "test-token" {
      return "test-user", "test@example.com", nil
    }
    return "", "", fmt.Errorf("invalid test token")
  }

  // Production: verify Firebase ID token
  decodedToken, err := firebaseApp.Auth(context.Background()).VerifyIDToken(
    context.Background(), token)
  if err != nil {
    return "", "", fmt.Errorf("invalid token: %w", err)
  }

  claims := decodedToken.Claims
  email, _ := claims["email"].(string)
  return decodedToken.UID, email, nil
}

func extractBearerToken(authHeader string) string {
  parts := strings.Fields(authHeader) // Split by whitespace
  if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
    return ""
  }
  return parts[1]
}
```

**Key pattern:** Identical logic in both languages. Test-token is case-sensitive, scheme is case-insensitive.

### Config Authorization Pattern

Before routing to GitHub, verify the requested config matches the stored config (prevents privilege escalation).

```typescript
// src/lib/session-storage.ts
export async function resolveAuthorizedGitHubConfig(
  userId: string,
  requestedConfig?: GitHubConfig
): Promise<GitHubConfig | undefined> {
  // Load stored config from Firebase
  const storedConfig = await firebaseStorage.loadGitHubConfig(userId);
  
  if (!storedConfig) {
    return undefined; // No GitHub integration configured
  }

  // If client requests a config, verify it matches stored config
  if (requestedConfig) {
    if (requestedConfig.owner !== storedConfig.owner ||
        requestedConfig.repo !== storedConfig.repo ||
        requestedConfig.branch !== storedConfig.branch) {
      throw new AuthError(
        'Requested GitHub config does not match stored config',
        403
      );
    }
  }

  return storedConfig;
}
```

**Security implication:** Without this check, an attacker could call the API with `{ owner: 'victim', repo: 'repo' }` and create sessions in the victim's repo.

### Proxy Request Formatting

[src/lib/session-storage.ts](../../../src/lib/session-storage.ts) includes a helper to format TypeScript requests for the Go backend.

```typescript
async function proxyToGoBackend(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: any
): Promise<NextResponse> {
  const baseUrl = process.env.MATMETRICS_GO_PROXY_BASE_URL;
  
  if (!baseUrl) {
    throw new Error('MATMETRICS_GO_PROXY_BASE_URL not configured');
  }

  const url = new URL(path, baseUrl);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      // Forward auth header to Go backend
      'Authorization': request.headers.get('authorization') || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json();

  // Transform Go response if needed (usually pass-through)
  return NextResponse.json(responseBody, { status: response.status });
}
```

**Key patterns:**
- Forward auth header to Go (so Go can re-validate)
- Preserve response status codes
- Handle errors from Go and re-throw with context

### Go Handler Response Formatting

[internal/httpapi/httpapi.go](../../../internal/httpapi/httpapi.go) provides consistent response formatting.

```go
// Consistent JSON response
func WriteJSON(w http.ResponseWriter, statusCode int, data interface{}) {
  w.Header().Set("Content-Type", "application/json")
  w.WriteHeader(statusCode)
  json.NewEncoder(w).Encode(data)
}

// Consistent error response
func WriteError(w http.ResponseWriter, statusCode int, message string) {
  w.Header().Set("Content-Type", "application/json")
  w.WriteHeader(statusCode)
  json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// Example handler
func CreateSession(w http.ResponseWriter, r *http.Request) {
  // Authenticate (same dual-mode as TypeScript)
  uid, _, err := RequireAuthenticatedUser(r)
  if err != nil {
    WriteError(w, http.StatusUnauthorized, err.Error())
    return
  }

  // Parse request
  var session model.Session
  if err := DecodeJSON(r, &session); err != nil {
    WriteError(w, http.StatusBadRequest, err.Error())
    return
  }

  // Validate
  if err := sessionapi.ValidateSession(&session); err != nil {
    WriteError(w, http.StatusBadRequest, err.Error())
    return
  }

  // Create
  result, err := sessionStorage.Create(&session)
  if err != nil {
    WriteError(w, http.StatusInternalServerError, err.Error())
    return
  }

  WriteJSON(w, http.StatusOK, result)
}
```

**Key pattern:** Consistent error response format (JSON with `error` field) and status codes. No exceptions; all errors are JSON responses.

### Fallback Logic

If Go backend is unavailable, fall back to local file storage.

```typescript
export async function shouldProxyGitHubRequests(): Promise<boolean> {
  // Check if Go backend is available
  if (!process.env.MATMETRICS_GO_PROXY_BASE_URL) {
    return false; // No Go backend configured
  }

  // Optional: health check (with caching)
  try {
    const res = await fetch(
      new URL('/health', process.env.MATMETRICS_GO_PROXY_BASE_URL).toString(),
      { method: 'HEAD', timeout: 2000 }
    );
    return res.ok;
  } catch {
    // Go backend unreachable, fall back to local
    console.warn('Go backend unreachable, falling back to local storage');
    return false;
  }
}
```

**Key pattern:**
- Graceful degradation: client still works even if Go backend is down
- Health check with short timeout (don't hang requests waiting for backend)
- Log fallback for debugging

## Testing Patterns

### Mocking the Go Response

Test the TypeScript route without actually calling Go.

```typescript
// src/tests/api-sessions-create-route.test.ts
import { POST } from '@/app/api/sessions/create/route';

describe('POST /api/sessions/create (with Go proxy)', () => {
  beforeEach(() => {
    process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
    
    // Mock fetch to return Go response
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'session-1',
          date: '2026-03-18',
          effort: 3,
        }),
      })
    );
  });

  it('should proxy to Go and return response', async () => {
    const req = new NextRequest('http://localhost/api/sessions/create', {
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: JSON.stringify({
        id: 'session-1',
        date: '2026-03-18',
        effort: 3,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.id).toBe('session-1');
    
    // Verify fetch was called with correct URL
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sessions'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should fall back to local storage if Go unavailable', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    
    const req = new NextRequest('http://localhost/api/sessions/create', {
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: JSON.stringify({
        id: 'session-1',
        date: '2026-03-18',
        effort: 3,
      }),
    });

    const res = await POST(req);
    
    // Should still succeed (using local storage)
    expect(res.status).toBe(200);
  });
});
```

### Testing Go Handler in Isolation

Test the Go handler without TypeScript.

```go
// internal/httpapi/httpapi_test.go
func TestCreateSessionHandler(t *testing.T) {
  t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

  body := []byte(`{
    "id": "session-1",
    "date": "2026-03-18",
    "effort": 3,
    "category": "Technical",
    "duration": 90,
    "techniques": ["Uchi mata"],
    "description": "Test session",
    "notes": ""
  }`)

  req := httptest.NewRequest(
    "POST",
    "/api/sessions",
    bytes.NewReader(body),
  )
  req.Header.Set("Authorization", "Bearer test-token")
  req.Header.Set("Content-Type", "application/json")

  w := httptest.NewRecorder()
  CreateSession(w, req)

  if w.Code != http.StatusOK {
    t.Errorf("Expected status 200, got %d", w.Code)
  }

  var result map[string]interface{}
  json.NewDecoder(w.Body).Decode(&result)
  
  if result["id"] != "session-1" {
    t.Errorf("Expected id='session-1', got %v", result["id"])
  }
}
```

### End-to-End Testing

Test the full round-trip: TypeScript route → Go handler → response → client. Requires both servers running or mocking.

```typescript
// src/tests/api-sessions-e2e.test.ts
describe('Sessions API (End-to-End)', () => {
  // This test requires MATMETRICS_GO_PROXY_BASE_URL to point to a running Go server
  
  it('should create session via TypeScript -> Go -> response', async () => {
    const res = await fetch('http://localhost:9002/api/sessions/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        id: 'e2e-session-1',
        date: '2026-03-18',
        effort: 3,
        category: 'Technical',
        duration: 90,
        techniques: ['Uchi mata'],
        description: 'E2E test',
        notes: '',
      }),
    });

    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.id).toBe('e2e-session-1');

    // Verify session is readable
    const getRes = await fetch(
      'http://localhost:9002/api/sessions/e2e-session-1',
      { headers: { 'Authorization': 'Bearer test-token' } }
    );
    expect(getRes.status).toBe(200);
  });
});
```

## Common Gotchas

### Bearer Token Parsing Case Sensitivity

**Problem:** Scheme ("Bearer") is case-insensitive per HTTP spec, but split-by-space is fragile.

```typescript
// WRONG: Case-sensitive scheme check
const token = authHeader.split(' ')[1]; // Fails if "bearer" (lowercase)

// WRONG: Assumes space separator always present
const token = authHeader.substring(7); // Fails if authHeader is "Bearer" alone

// RIGHT: Case-insensitive, robust split
const parts = authHeader.split(' ');
if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
  return null;
}
return parts[1];
```

**Impact:** Invalid Bearer tokens accepted; auth bypass if scheme is lowercase.

### Proxy Base URL Must Be Absolute

**Problem:** Invalid URL passed to fetch; error thrown after routing decision made.

```typescript
// WRONG: Relative URL
const url = new URL(path, 'localhost:8080'); // Throws: invalid base URL
return await fetch(url);

// RIGHT: Absolute URL with scheme
const baseUrl = process.env.MATMETRICS_GO_PROXY_BASE_URL; // http://localhost:8080
if (!baseUrl.startsWith('http')) {
  throw new Error('MATMETRICS_GO_PROXY_BASE_URL must be absolute (http:// or https://)');
}
const url = new URL(path, baseUrl);
return await fetch(url);
```

**Impact:** Route handler crashes; request fails even if Go backend is running.

### Auth Header Not Forwarded to Go

**Problem:** TypeScript authenticates client, but forgets to forward token to Go. Go re-checks auth; client appears unauthorized.

```typescript
// WRONG: No auth forwarding
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

// Go handler checks Authorization header, finds none, rejects request

// RIGHT: Forward authorization header
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': request.headers.get('authorization') || '',
  },
  body: JSON.stringify(data),
});
```

**Impact:** Authenticated TypeScript requests proxy to Go and fail 401 Unauthorized.

### Config Authorization Check Bypassed

**Problem:** No validation that requested config matches stored config.

```typescript
// WRONG: Accept any config
export async function createSession(session, clientConfig) {
  // Attacker calls: createSession(session, { owner: 'victim', repo: 'repo' })
  // Session created in victim's repo
  return await githubStorage.create(session, clientConfig);
}

// RIGHT: Validate against stored config
export async function createSession(session, clientConfig) {
  const storedConfig = await getStoredGitHubConfig();
  
  if (clientConfig &&
      (clientConfig.owner !== storedConfig.owner ||
       clientConfig.repo !== storedConfig.repo)) {
    throw new AuthError('Config mismatch', 403);
  }
  
  return await githubStorage.create(session, storedConfig);
}
```

**Impact:** Privilege escalation: attacker writes to arbitrary repos.

### Concurrent Proxy Requests Not Deduplicated

**Problem:** Multiple identical requests to Go backend result in duplicate operations (not idempotent).

```typescript
// User clicks "create session" twice rapidly
// Two TypeScript requests → two Go requests → two sessions created

// Solution: Implement request deduplication at gateway
// (requires request ID tracking and caching)
// This is complex; simpler solution: rely on Go backend idempotency
```

## References

- [src/app/api/sessions/create/route.ts](../../../src/app/api/sessions/create/route.ts) — TypeScript handler with proxy
- [src/lib/session-storage.ts](../../../src/lib/session-storage.ts) — Orchestrator with proxy helper
- [src/lib/server-auth.ts](../../../src/lib/server-auth.ts) — TypeScript auth dual-mode
- [internal/httpapi/httpapi.go](../../../internal/httpapi/httpapi.go) — Go handlers and auth
- [CLAUDE.md](../../../CLAUDE.md) — Architecture overview

## Next Steps

- Add a new API endpoint that proxies to Go (e.g., `/api/sessions/sync`)
- Implement both TypeScript route and Go handler using this pattern
- Write tests for the proxy chain and fallback
- Verify auth works in both test-mode and production (Firebase)
