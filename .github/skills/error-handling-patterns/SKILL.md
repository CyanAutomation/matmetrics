---
name: error-handling-patterns
description: Design custom error types with type guards and discriminators. Covers error classification, actionable error messages, and propagation across TypeScript + Go boundaries.
license: MIT
---

# Custom Error Types & Type Guards

Errors in MatMetrics span TypeScript and Go and must be classified, propagated, and presented to users with actionable context. This skill covers the pattern for designing custom error types, implementing type-safe guards, and ensuring errors carry enough context to debug or display to end users.

## When to Use

- Adding a new error case (validation error, auth error, GitHub API error)
- Debugging an error that doesn't include enough context (missing field name, status code, etc.)
- Propagating errors from Go to TypeScript (HTTP responses, JSON error format)
- Testing error scenarios in both languages
- Displaying errors to users in the UI

## When NOT to Use

- Catching generic exceptions from external libraries (convert to custom types first)
- Using errors only for control flow (use `Result` type or exceptions as flow control)
- Errors that don't need recovery information (uncatchable errors, e.g., OOM)

## Architecture Overview

### Error Classification

MatMetrics errors fall into three categories:

| Category | Recovery | Example | User Message |
|----------|----------|---------|--------------|
| **User-Actionable** | Retry with correction | Invalid session ID | "Session ID must contain only letters, numbers, dash, underscore" |
| **Operational** | Retry or fallback | GitHub rate limit exceeded | "Too many requests to GitHub. Please try again in 5 minutes." |
| **Permanent** | No recovery | Invalid Firebase token | "Authentication failed. Please sign in again." |

**Pattern:**

```typescript
// Classification predicate
function isUserActionableError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

// Usage
try {
  validateSession(sessionData);
} catch (err) {
  if (isUserActionableError(err)) {
    // Display to user: "Please fix this field..."
    displayUserError(err.message);
  } else if (isOperationalError(err)) {
    // Log for monitoring, retry with backoff
    logOperationalError(err);
    scheduleRetry();
  } else {
    // Permanent error, sign out user
    signOut();
  }
}
```

### Custom Error Types

**Base Error Class (TypeScript):**

```typescript
// src/lib/errors.ts
export class MatMetricsError extends Error {
  // Classification field
  readonly category: 'user-actionable' | 'operational' | 'permanent';
  
  // Context fields
  readonly statusCode?: number;
  readonly context?: Record<string, unknown>;
  readonly originalError?: Error;

  constructor(
    message: string,
    category: 'user-actionable' | 'operational' | 'permanent',
    options?: {
      statusCode?: number;
      context?: Record<string, unknown>;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.category = category;
    this.statusCode = options?.statusCode;
    this.context = options?.context;
    this.originalError = options?.originalError;
  }
}
```

**Specific Error Types:**

```typescript
export class ValidationError extends MatMetricsError {
  constructor(
    message: string,
    options?: { context?: Record<string, unknown> }
  ) {
    super(message, 'user-actionable', options);
  }
}

export class GitHubApiError extends MatMetricsError {
  readonly statusCode: number;
  readonly retryAfter?: number; // From GitHub rate-limit headers

  constructor(
    message: string,
    statusCode: number,
    options?: { retryAfter?: number; context?: Record<string, unknown> }
  ) {
    super(message, 'operational', {
      statusCode,
      context: options?.context,
    });
    this.statusCode = statusCode;
    this.retryAfter = options?.retryAfter;
  }
}

export class AuthError extends MatMetricsError {
  constructor(message: string, statusCode: number = 401) {
    super(message, 'permanent', { statusCode });
  }
}

export class NotFoundError extends MatMetricsError {
  constructor(resource: string) {
    super(
      `${resource} not found`,
      'user-actionable',
      { context: { resource } }
    );
  }
}
```

**Key patterns:**
- Extend base class for inheritance and `instanceof` checks
- Classify upfront (category never changes)
- Include context fields for debugging (field names, status codes, values)
- Store original error for chain tracing

### Type Guards

Type guards allow safe access to error properties without `instanceof`.

```typescript
// Type guard predicates
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isGitHubApiError(error: unknown): error is GitHubApiError {
  return error instanceof GitHubApiError;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

// Generic category guard
export function isUserActionableError(error: unknown): boolean {
  return (
    error instanceof MatMetricsError &&
    error.category === 'user-actionable'
  );
}

// Usage
try {
  await validateSession(sessionData);
} catch (err) {
  if (isValidationError(err)) {
    // TypeScript now knows: err.context, err.message
    console.log(`Validation failed for field: ${err.context?.field}`);
  } else if (isGitHubApiError(err)) {
    // TypeScript now knows: err.statusCode, err.retryAfter
    if (err.statusCode === 429) {
      console.log(`Rate limited, retry after ${err.retryAfter}s`);
    }
  }
}
```

### Actionable Error Messages

Errors should include enough context for users or developers to fix the issue.

**Pattern:**

```typescript
// WRONG: Not enough context
throw new ValidationError('Invalid effort');

// RIGHT: Include field name, constraint, actual value
throw new ValidationError(
  'Effort must be 1-5, got 6',
  {
    context: {
      field: 'effort',
      constraint: '1-5',
      actual: 6,
    }
  }
);

// Display to user
function renderFieldError(err: ValidationError): string {
  if (err.context?.field) {
    return `${err.context.field}: ${err.message}`;
  }
  return err.message; // Fallback
}
```

**Context fields to include:**

| Field | Example | Used For |
|-------|---------|----------|
| `field` | "effort" | Highlight form field in UI |
| `constraint` | "1-5" | Explain what's valid |
| `actual` | 6 | Show what was provided |
| `allowedValues` | ["Technical", "Randori", "Shiai"] | Enum options |
| `resource` | "session-abc123" | Which item failed |
| `statusCode` | 404 | HTTP status from API |

### Error Propagation Across TypeScript ↔ Go

Errors are created in Go, serialized to JSON, sent to TypeScript, and deserialized back to typed errors.

**Go Handler → JSON Response:**

```go
// internal/httpapi/httpapi.go
func WriteError(w http.ResponseWriter, err error) {
  w.Header().Set("Content-Type", "application/json")

  // Classify error
  statusCode := 500
  category := "permanent"
  context := map[string]interface{}{}

  if validationErr, ok := err.(*sessionapi.ValidationError); ok {
    statusCode = 400
    category = "user-actionable"
    context["field"] = validationErr.Field
    context["constraint"] = validationErr.Constraint
    context["actual"] = validationErr.Actual
  } else if githubErr, ok := err.(*githubapi.Error); ok {
    statusCode = githubErr.StatusCode
    category = "operational"
    context["retryAfter"] = githubErr.RetryAfter
  } else if strings.Contains(err.Error(), "unauthorized") {
    statusCode = 401
    category = "permanent"
  }

  w.WriteHeader(statusCode)
  json.NewEncoder(w).Encode(map[string]interface{}{
    "error": err.Error(),
    "category": category,
    "context": context,
  })
}
```

**TypeScript Client ← JSON Response:**

```typescript
// src/lib/errors.ts
export function parseErrorResponse(response: {
  error: string;
  category: string;
  context?: Record<string, unknown>;
}): MatMetricsError {
  const { error, category, context } = response;

  switch (category) {
    case 'user-actionable':
      if (context?.field) {
        return new ValidationError(error, { context });
      }
      return new ValidationError(error);

    case 'operational':
      return new GitHubApiError(
        error,
        response.statusCode || 500,
        {
          retryAfter: context?.retryAfter as number,
          context,
        }
      );

    case 'permanent':
      return new AuthError(error);

    default:
      return new MatMetricsError(error, 'operational', { context });
  }
}

// Usage in fetch
async function fetchFromGo(endpoint: string) {
  const response = await fetch(endpoint);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw parseErrorResponse(errorData);
  }
  
  return response.json();
}
```

**Key pattern:** Error classification and context are serialized to JSON, deserialized back to typed errors on client. Type information is preserved across the TypeScript ↔ Go boundary.

## Go Error Design

**Go Base Error:**

```go
// internal/sessionapi/errors.go
type ValidationError struct {
  Field      string
  Constraint string
  Actual     interface{}
  Message    string
}

func (e *ValidationError) Error() string {
  return e.Message
}

type GitHubError struct {
  StatusCode int
  Message    string
  RetryAfter int // Seconds (from GitHub rate-limit header)
}

func (e *GitHubError) Error() string {
  return e.Message
}
```

**Creating Errors:**

```go
// Validation error with context
if effort < 1 || effort > 5 {
  return &sessionapi.ValidationError{
    Field:      "effort",
    Constraint: "1-5",
    Actual:     effort,
    Message:    fmt.Sprintf("Effort must be 1-5, got %d", effort),
  }
}

// GitHub API error with retry info
if resp.StatusCode == 429 {
  retryAfter, _ := strconv.Atoi(resp.Header.Get("X-RateLimit-Reset"))
  return &githubapi.GitHubError{
    StatusCode: 429,
    Message:    "GitHub API rate limit exceeded",
    RetryAfter: retryAfter,
  }
}
```

**Type assertions in Go:**

```go
// Safe type assertion
if validationErr, ok := err.(*sessionapi.ValidationError); ok {
  fmt.Printf("Validation failed on %s: %s\n",
    validationErr.Field, validationErr.Message)
} else if githubErr, ok := err.(*githubapi.GitHubError); ok {
  fmt.Printf("GitHub error (retry in %ds): %s\n",
    githubErr.RetryAfter, githubErr.Message)
}
```

## Testing Error Scenarios

### TypeScript Error Tests

```typescript
// src/lib/errors.test.ts
describe('Error Types', () => {
  describe('ValidationError', () => {
    it('should create with context', () => {
      const err = new ValidationError(
        'Effort must be 1-5, got 6',
        {
          context: {
            field: 'effort',
            constraint: '1-5',
            actual: 6,
          },
        }
      );

      expect(err.category).toBe('user-actionable');
      expect(err.context?.field).toBe('effort');
      expect(isValidationError(err)).toBe(true);
    });
  });

  describe('Error serialization', () => {
    it('should serialize and deserialize GitHubApiError', () => {
      const original = new GitHubApiError('Rate limit exceeded', 429, {
        retryAfter: 60,
      });

      const serialized = {
        error: original.message,
        category: original.category,
        context: { retryAfter: original.retryAfter },
        statusCode: original.statusCode,
      };

      const deserialized = parseErrorResponse(serialized);
      
      expect(isGitHubApiError(deserialized)).toBe(true);
      expect((deserialized as GitHubApiError).retryAfter).toBe(60);
    });
  });
});
```

### Go Error Tests

```go
// internal/sessionapi/errors_test.go
func TestValidationError(t *testing.T) {
  err := &ValidationError{
    Field:      "effort",
    Constraint: "1-5",
    Actual:     6,
    Message:    "Effort must be 1-5, got 6",
  }

  if err.Field != "effort" {
    t.Errorf("Expected field='effort', got %s", err.Field)
  }

  if !strings.Contains(err.Error(), "Effort must be 1-5") {
    t.Errorf("Error message missing constraint info: %s", err.Error())
  }
}
```

### Error Propagation Tests

```typescript
// Test that Go error → JSON → TypeScript error preserves context
test('should preserve error context through HTTP round-trip', async () => {
  // Mock Go response
  const goErrorResponse = {
    error: 'Effort must be 1-5, got 6',
    category: 'user-actionable',
    context: {
      field: 'effort',
      constraint: '1-5',
      actual: 6,
    },
  };

  // Parse on TypeScript side
  const err = parseErrorResponse(goErrorResponse);

  expect(isValidationError(err)).toBe(true);
  expect((err as ValidationError).context?.field).toBe('effort');
});
```

## Common Gotchas

### Throwing Generic Error Instead of Custom Type

**Problem:** Throw `Error("message")` instead of custom type. Caller can't narrow to specific error.

```typescript
// WRONG: Generic error, caller can't tell error type
if (effort < 1 || effort > 5) {
  throw new Error('Invalid effort');
}

// Caller must guess error type
try {
  validateEffort(6);
} catch (err) {
  // Is this a validation error? Auth error? Network error?
  // No type guard available
}

// RIGHT: Throw specific type
if (effort < 1 || effort > 5) {
  throw new ValidationError(
    'Effort must be 1-5, got ' + effort,
    { context: { field: 'effort', actual: effort } }
  );
}

// Caller can narrow type
try {
  validateEffort(6);
} catch (err) {
  if (isValidationError(err)) {
    console.log(`Invalid field: ${err.context?.field}`);
  }
}
```

**Impact:** Errors lose context; debugging becomes hard.

### Missing Context in Error Message

**Problem:** Error message lacks details needed to debug or display.

```typescript
// WRONG: No context
throw new ValidationError('Invalid session ID');

// User sees: "Invalid session ID"
// Developer sees: "Invalid session ID"
// Neither can fix it

// RIGHT: Include constraint and actual value
throw new ValidationError(
  'Session ID must contain only alphanumeric, dash, underscore; got "session/invalid"',
  {
    context: {
      field: 'id',
      constraint: '^[A-Za-z0-9_-]+$',
      actual: 'session/invalid',
      allowedCharacters: ['alphanumeric', 'dash', 'underscore'],
    },
  }
);

// User sees: fix the `/` character
// Developer sees: regex pattern and actual value
```

**Impact:** Users can't fix validation errors; support tickets pile up.

### Error Classification Mismatch Between Languages

**Problem:** TypeScript says "operational" (retry), Go says "permanent" (give up). Clients retry forever.

```typescript
// WRONG: Different classifications
// Go:
return &GitHubError{
  StatusCode: 401,
  Message: "Invalid token",
  Category: "operational", // Wrong! Should be permanent
}

// TypeScript handler:
if (err.category === 'operational') {
  scheduleRetry(); // Will retry forever on bad token
}

// RIGHT: Use same classification in both languages
// When Go detects 401 Unauthorized:
return &GitHubError{
  StatusCode: 401,
  Message: "Invalid token",
  Category: "permanent", // No retry
}

// TypeScript:
if (err.category === 'permanent') {
  signOut(); // Permanent error, ask user to re-authenticate
}
```

**Impact:** Infinite retries on permanent errors (e.g., invalid token). Poor UX.

### Error Context Lost in Error Wrapping

**Problem:** Wrapping error multiple times without preserving original context.

```typescript
// WRONG: Context lost
try {
  await githubAPI.listSessions();
} catch (err) {
  throw new Error('Failed to list sessions'); // Lost GitHub context
}

// Caller doesn't know: was it auth? Rate limit? Network?

// RIGHT: Preserve original error
try {
  await githubAPI.listSessions();
} catch (err) {
  throw new GitHubApiError(
    `Failed to list sessions: ${err.message}`,
    (err as GitHubApiError).statusCode || 500,
    { originalError: err }
  );
}

// Caller can inspect originalError to determine retry strategy
```

**Impact:** Loss of error chain; impossible to debug.

## References

- [src/lib/errors.ts](../../../src/lib/errors.ts) — TypeScript error types
- [src/lib/server-auth.ts](../../../src/lib/server-auth.ts) — Auth error usage
- [src/lib/session-validation.ts](../../../src/lib/session-validation.ts) — Validation errors
- [src/lib/github-storage.ts](../../../src/lib/github-storage.ts) — GitHub error handling
- [internal/sessionapi/validation.go](../../../internal/sessionapi/validation.go) — Go validation errors
- [internal/githubapi/github.go](../../../internal/githubapi/github.go) — Go GitHub errors
- [internal/httpapi/httpapi.go](../../../internal/httpapi/httpapi.go) — Go error response formatting

## Next Steps

- Add a new error type for a feature you're building
- Write type guards to safely narrow to your new error
- Test serialization and deserialization across TypeScript ↔ Go
- Update error classification if new scenarios emerge
