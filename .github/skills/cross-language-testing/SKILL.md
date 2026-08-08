---
name: cross-language-testing
description: Validate shared behavior across TypeScript and Go using fixture-driven parity testing. Covers dual-mode auth, temp directory isolation, and shared validation contracts.
license: MIT
---

# Cross-Language Parity Testing

MatMetrics is a dual-language system: TypeScript (Next.js frontend + API routes) and Go (CLI + backend). Critical behaviors like session validation, error handling, and auth must be identical across both languages. This skill covers fixture-driven testing patterns that validate parity between TypeScript and Go implementations.

## When to Use

- Implementing a feature in both TypeScript and Go (session validation, error types, storage logic)
- Adding a new validation rule or constraint (must validate identically in both languages)
- Refactoring shared logic (validation, parsing, serialization)
- Testing dual-mode authentication (Firebase + test-token in same code path)
- Debugging discrepancies between TypeScript and Go behavior
- Writing integration tests between TypeScript API routes and Go backends

## When NOT to Use

- Testing TypeScript-only features (React components, frontend UI logic)
- Testing Go-only features (CLI subcommands that don't have TypeScript equivalent)
- Unit testing internal logic (use language-specific test frameworks)
- Performance benchmarking (use language-specific profilers)

## Architecture Overview

### Frozen Contract Pattern

The session shape and markdown format are **frozen**. Changes require updates in both TypeScript and Go simultaneously.

**Frozen Fields:**

```typescript
// src/lib/types.ts (TypeScript)
export interface Session {
  id: string;                          // Alphanumeric + dash/underscore
  date: string;                        // YYYY-MM-DD format
  techniques: string[];                // Array of technique names
  effort: number;                      // 1-5 (integer)
  category: 'Technical' | 'Randori' | 'Shiai'; // Enum
  description: string;                 // Free text
  notes: string;                       // Free text
  duration: number;                    // Minutes (integer)
}
```

```go
// internal/model/session.go (Go)
type Session struct {
    ID          string    `json:"id"`
    Date        string    `json:"date"` // YYYY-MM-DD
    Techniques  []string  `json:"techniques"`
    Effort      int       `json:"effort"`      // 1-5
    Category    string    `json:"category"`    // Technical|Randori|Shiai
    Description string    `json:"description"`
    Notes       string    `json:"notes"`
    Duration    int       `json:"duration"`    // Minutes
}
```

**Markdown Format (Frozen):**

```markdown
---
id: 'session-uuid'
date: '2026-03-18'
effort: 3
category: 'Technical'
duration: 90
techniques:
  - Uchi mata
  - Tai otoshi
---

# March 18, 2026 – Judo Session

## Techniques Practiced

- Uchi mata
- Tai otoshi

## Session Description

Description text here.

## Notes

Notes text here.
```

See [docs/go-contract.md](../../../docs/go-contract.md) for exact template.

### Fixture-Driven Validation

The canonical validation rules live in a shared JSON fixture file: [testdata/validation/session-validation-fixtures.json](../../../testdata/validation/session-validation-fixtures.json).

```json
{
  "fixtures": [
    {
      "name": "valid_session",
      "session": {
        "id": "session-abc123",
        "date": "2026-03-18",
        "effort": 3,
        "category": "Technical",
        "duration": 90,
        "techniques": ["Uchi mata"],
        "description": "Good session",
        "notes": ""
      },
      "shouldPass": true
    },
    {
      "name": "invalid_effort_too_high",
      "session": {
        "id": "session-abc123",
        "date": "2026-03-18",
        "effort": 6,
        "category": "Technical",
        "duration": 90,
        "techniques": ["Uchi mata"],
        "description": "Good session",
        "notes": ""
      },
      "shouldPass": false,
      "expectedErrorMatch": "Effort must be 1-5"
    },
    {
      "name": "invalid_date_format",
      "session": {
        "id": "session-abc123",
        "date": "03/18/2026",
        "effort": 3,
        "category": "Technical",
        "duration": 90,
        "techniques": ["Uchi mata"],
        "description": "Good session",
        "notes": ""
      },
      "shouldPass": false,
      "expectedErrorMatch": "date must be YYYY-MM-DD"
    },
    {
      "name": "invalid_session_id_with_slashes",
      "session": {
        "id": "session/abc/123",
        "date": "2026-03-18",
        "effort": 3,
        "category": "Technical",
        "duration": 90,
        "techniques": ["Uchi mata"],
        "description": "Good session",
        "notes": ""
      },
      "shouldPass": false,
      "expectedErrorMatch": "Invalid session ID"
    }
  ]
}
```

### TypeScript Validation Test

[src/app/api/sessions/[id]/route.ts](../../../src/app/api/sessions/[id]/route.ts) tests against the shared fixture.

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateSession } from '@/lib/session-validation';

const fixtures = JSON.parse(
  readFileSync(
    join(process.cwd(), 'testdata/validation/session-validation-fixtures.json'),
    'utf-8'
  )
);

describe('Session Validation (Fixture-Driven Parity)', () => {
  fixtures.fixtures.forEach((fixture) => {
    it(`should validate: ${fixture.name}`, () => {
      const result = validateSession(fixture.session);
      
      if (fixture.shouldPass) {
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      } else {
        expect(result.isValid).toBe(false);
        expect(result.errors.some((err) =>
          err.message.includes(fixture.expectedErrorMatch)
        )).toBe(true);
      }
    });
  });
});
```

### Go Validation Test

[internal/sessionapi/validation_test.go](../../../internal/sessionapi/validation_test.go) uses the same fixture file.

```go
func TestValidateSessionParityFixtures(t *testing.T) {
  // Load shared fixture file
  fixtureData, err := os.ReadFile("testdata/validation/session-validation-fixtures.json")
  if err != nil {
    t.Fatal(err)
  }

  var data struct {
    Fixtures []struct {
      Name                string         `json:"name"`
      Session             model.Session  `json:"session"`
      ShouldPass          bool           `json:"shouldPass"`
      ExpectedErrorMatch  string         `json:"expectedErrorMatch"`
    } `json:"fixtures"`
  }
  
  if err := json.Unmarshal(fixtureData, &data); err != nil {
    t.Fatal(err)
  }

  for _, fixture := range data.Fixtures {
    t.Run(fixture.Name, func(t *testing.T) {
      err := sessionapi.ValidateSession(&fixture.Session)
      
      if fixture.ShouldPass {
        if err != nil {
          t.Errorf("Expected validation to pass, got error: %v", err)
        }
      } else {
        if err == nil {
          t.Errorf("Expected validation to fail, but passed")
        }
        if !strings.Contains(err.Error(), fixture.ExpectedErrorMatch) {
          t.Errorf("Expected error to contain '%s', got: %v", 
            fixture.ExpectedErrorMatch, err)
        }
      }
    })
  }
}
```

**Key pattern:** Both languages test against the same fixture file. When a new validation rule is added, the fixture is updated once, and both test suites automatically pick it up.

## Dual-Mode Authentication Testing

Both TypeScript and Go support two auth modes: **Firebase (production)** and **test-token (development)**. Tests must validate both paths work identically.

### TypeScript Dual-Mode Auth

[src/lib/server-auth.ts](../../../src/lib/server-auth.ts):

```typescript
export async function requireAuthenticatedUser(
  request: Request
): Promise<{ uid: string; email?: string }> {
  const token = extractBearerToken(request.headers.get('authorization'));
  
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
```

### Go Dual-Mode Auth

[internal/httpapi/httpapi.go](../../../internal/httpapi/httpapi.go):

```go
func RequireAuthenticatedUser(r *http.Request) (uid, email string, err error) {
  token := extractBearerToken(r.Header.Get("Authorization"))
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
  decodedToken, err := firebaseApp.Auth(context.Background()).VerifyIDToken(context.Background(), token)
  if err != nil {
    return "", "", err
  }

  return decodedToken.UID, decodedToken.Claims["email"].(string), nil
}
```

### Parity Test: Auth Modes

**TypeScript test:**

```typescript
describe('Dual-Mode Authentication', () => {
  afterEach(() => {
    delete process.env.MATMETRICS_AUTH_TEST_MODE;
  });

  it('should accept test-token in test mode', async () => {
    process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
    const req = new NextRequest('http://localhost/api/sessions', {
      headers: { authorization: 'Bearer test-token' },
    });
    
    const user = await requireAuthenticatedUser(req);
    expect(user.uid).toBe('test-user');
  });

  it('should reject invalid token in test mode', async () => {
    process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
    const req = new NextRequest('http://localhost/api/sessions', {
      headers: { authorization: 'Bearer wrong-token' },
    });
    
    expect(() => requireAuthenticatedUser(req)).toThrow('Invalid test token');
  });
});
```

**Go test:**

```go
func TestDualModeAuth(t *testing.T) {
  t.Run("test mode with valid token", func(t *testing.T) {
    t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")
    
    req := &http.Request{
      Header: http.Header{
        "Authorization": []string{"Bearer test-token"},
      },
    }
    
    uid, email, err := httpapi.RequireAuthenticatedUser(req)
    if err != nil {
      t.Fatalf("Expected no error, got: %v", err)
    }
    if uid != "test-user" {
      t.Errorf("Expected uid='test-user', got: %s", uid)
    }
  })

  t.Run("test mode with invalid token", func(t *testing.T) {
    t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")
    
    req := &http.Request{
      Header: http.Header{
        "Authorization": []string{"Bearer wrong-token"},
      },
    }
    
    _, _, err := httpapi.RequireAuthenticatedUser(req)
    if err == nil {
      t.Fatal("Expected error for invalid token")
    }
    if !strings.Contains(err.Error(), "invalid test token") {
      t.Errorf("Expected 'invalid test token' error, got: %v", err)
    }
  })
}
```

## Testing Patterns

### Temp Directory Isolation (TypeScript)

Tests should not interfere with each other. Use temp directories for file I/O tests.

```typescript
import { mkdtemp } from 'fs/promises';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';

// Export for test injection
let testDataDir: string | undefined;
export function __setDataDirForTests(dir: string) {
  testDataDir = dir;
}

// In storage code
function getDataDir() {
  if (testDataDir) return testDataDir; // Use test directory
  return 'data'; // Default
}

// Test helper
async function withTempDataDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(tmpdir() + '/matmetrics-test-');
  __setDataDirForTests(dir);
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true });
    __setDataDirForTests(undefined);
  }
}

// Usage
test('should save session to file', async () => {
  await withTempDataDir(async (dataDir) => {
    const session = { id: 'test-1', date: '2026-03-18' };
    await fileStorage.create(session);
    
    const file = fs.readFileSync(
      path.join(dataDir, '2026/03/YYYYMMDD-matmetrics-test-1.md'),
      'utf-8'
    );
    expect(file).toContain("id: 'test-1'");
  });
});
```

### Stored Config Injection (TypeScript)

Tests for GitHub-backed storage need a way to set stored GitHub config.

```typescript
import { AsyncLocalStorage } from 'async_hooks';

// Storage for test config
const testConfigStore = new AsyncLocalStorage<GitHubConfig | undefined>();

export async function withStoredGitHubConfig(
  config: GitHubConfig,
  run: () => Promise<void>
) {
  return testConfigStore.run(config, run);
}

// In storage code
export async function getStoredGitHubConfig(): Promise<GitHubConfig | undefined> {
  // During tests, return injected config
  const testConfig = testConfigStore.getStore();
  if (testConfig) return testConfig;

  // Otherwise, read from Firebase
  return firebaseStorage.loadConfig();
}

// Usage
test('should route to GitHub when configured', async () => {
  await withStoredGitHubConfig(
    { owner: 'test-owner', repo: 'test-repo', branch: 'main' },
    async () => {
      const session = { id: 'test-1', date: '2026-03-18' };
      await sessionStorage.create(session); // Should go to GitHub
      
      expect(mockGitHubAPI.create).toHaveBeenCalled();
    }
  );
});
```

### Mock HTTP Transport (Go)

Go tests mock GitHub API responses using a custom transport.

```go
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
  return f(req)
}

func TestGitHubListSessions(t *testing.T) {
  mockTransport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
    if req.URL.Path != "/repos/test-owner/test-repo/contents/data" {
      t.Errorf("Unexpected path: %s", req.URL.Path)
    }
    
    body := []byte(`[{"name": "20260318-matmetrics-sess1.md", "type": "file"}]`)
    return &http.Response{
      StatusCode: 200,
      Body:       io.NopCloser(bytes.NewReader(body)),
    }, nil
  })

  gh := &githubapi.Client{
    HTTPClient: &http.Client{Transport: mockTransport},
  }

  sessions, _ := gh.ListSessions("test-owner", "test-repo", "main")
  if len(sessions) != 1 {
    t.Fail()
  }
}
```

## Workflow: Adding a New Validation Rule

**Scenario:** Add a new constraint: duration must be 30-600 minutes.

**Step 1: Update Fixture**

Edit [testdata/validation/session-validation-fixtures.json](../../../testdata/validation/session-validation-fixtures.json):

```json
{
  "name": "invalid_duration_too_short",
  "session": { "id": "sess-1", "date": "2026-03-18", "effort": 3, "category": "Technical", "duration": 15, "techniques": ["Uchi mata"], "description": "Short session", "notes": "" },
  "shouldPass": false,
  "expectedErrorMatch": "Duration must be 30-600"
},
{
  "name": "invalid_duration_too_long",
  "session": { "id": "sess-1", "date": "2026-03-18", "effort": 3, "category": "Technical", "duration": 1000, "techniques": ["Uchi mata"], "description": "Long session", "notes": "" },
  "shouldPass": false,
  "expectedErrorMatch": "Duration must be 30-600"
},
{
  "name": "valid_duration_minimum",
  "session": { "id": "sess-1", "date": "2026-03-18", "effort": 3, "category": "Technical", "duration": 30, "techniques": ["Uchi mata"], "description": "Good session", "notes": "" },
  "shouldPass": true
}
```

**Step 2: Update TypeScript Validation**

Edit [src/lib/session-validation.ts](../../../src/lib/session-validation.ts):

```typescript
function validateDuration(duration: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (duration < 30 || duration > 600) {
    errors.push({
      field: 'duration',
      message: 'Duration must be 30-600 minutes',
    });
  }
  return errors;
}

export function validateSession(session: Session): ValidationResult {
  const allErrors = [
    ...validateDuration(session.duration),
    ...validateEffort(session.effort),
    // ... other validations
  ];
  
  return { isValid: allErrors.length === 0, errors: allErrors };
}
```

**Step 3: Update Go Validation**

Edit [internal/sessionapi/validation.go](../../../internal/sessionapi/validation.go):

```go
func validateDuration(s *model.Session) []string {
  var errs []string
  if s.Duration < 30 || s.Duration > 600 {
    errs = append(errs, "Duration must be 30-600 minutes")
  }
  return errs
}

func ValidateSession(s *model.Session) error {
  var allErrs []string
  allErrs = append(allErrs, validateDuration(s)...)
  allErrs = append(allErrs, validateEffort(s)...)
  // ... other validations
  
  if len(allErrs) > 0 {
    return fmt.Errorf("validation failed: %s", strings.Join(allErrs, "; "))
  }
  return nil
}
```

**Step 4: Run Parity Tests**

```bash
# TypeScript
npm test -- src/app/api/sessions/create/route.test.ts

# Go
go test ./internal/sessionapi/...
```

Both test suites automatically pick up the new fixture cases and validate identical behavior.

## Common Gotchas

### Fixture File Out of Sync

**Problem:** Fixture updated but validation logic not updated, or vice versa.

```typescript
// WRONG: Fixture added but TypeScript validation not updated
// → Tests pass (fixture ignored) but Go tests fail
// → Parity broken silently

// RIGHT: Add both at same time, commit together
// → Both test suites must pass before merge
```

**Prevention:** Require both language test suites to pass in CI before merge.

### Date Format Inconsistency

**Problem:** TypeScript uses ISO string, Go uses time.Time, markdown uses YYYY-MM-DD. Conversions can drift.

```typescript
// WRONG: Different parsing in each language
// TypeScript: new Date(dateStr) (permissive, accepts "March 18, 2026")
// Go: time.Parse("2006-01-02", dateStr) (strict, rejects non-YYYY-MM-DD)

// RIGHT: Strict parsing everywhere
// Fixture: always "2026-03-18"
// TypeScript: expect(validateDate("03/18/26")).toBe(false)
// Go: ValidateDate("03/18/26") returns error
```

**Prevention:** Test with fixture file; any discrepancy is caught immediately.

### Auth Mode Environment Variable Case Sensitivity

**Problem:** TypeScript checks `MATMETRICS_AUTH_TEST_MODE === 'true'`, Go checks `getenv("MATMETRICS_AUTH_TEST_MODE") == "true"`. Case differences in env var names cause mismatch.

```go
// WRONG in Go
if os.Getenv("matmetrics_auth_test_mode") == "true" { // lowercase
  return "test-user", nil
}

// This won't match TypeScript's check for UPPERCASE

// RIGHT: Use same env var name in both
if os.Getenv("MATMETRICS_AUTH_TEST_MODE") == "true" {
  return "test-user", nil
}
```

**Prevention:** Define env var names in a shared document; check both implementations.

## References

- [testdata/validation/session-validation-fixtures.json](../../../testdata/validation/session-validation-fixtures.json) — Shared validation fixture
- [src/lib/session-validation.ts](../../../src/lib/session-validation.ts) — TypeScript validator
- [internal/sessionapi/validation.go](../../../internal/sessionapi/validation.go) — Go validator
- [src/lib/server-auth.ts](../../../src/lib/server-auth.ts) — TypeScript auth
- [internal/httpapi/httpapi.go](../../../internal/httpapi/httpapi.go) — Go auth
- [docs/go-contract.md](../../../docs/go-contract.md) — Frozen session contract

## Next Steps

- Add a new validation rule using the fixture-driven workflow above
- Verify both TypeScript and Go test suites pass
- Document any language-specific edge cases in test comments
- Update this skill if new parity patterns emerge
