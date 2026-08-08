---
name: go-cli-development
description: Build CLI subcommands and backend logic in Go using MatMetrics patterns. Covers command routing, validation, file layout, caching, error handling, and file locking.
license: MIT
---

# Go CLI Development

MatMetrics' Go CLI (`go/cmd/matmetrics-cli/`) demonstrates a flat, dependency-free command router pattern ideal for small-to-medium CLIs. This skill covers the architecture, patterns, and common gotchas when building new CLI subcommands or extending backend logic in `internal/` packages.

## When to Use

- Building a new CLI subcommand (e.g., `matmetrics github sync`, `matmetrics sessions validate`)
- Adding validation logic for sessions or other domain objects
- Implementing storage or cache layer operations
- Working with GitHub API integration
- Parsing and serializing markdown session files
- Testing concurrent file access or locking behavior

## When NOT to Use

- Building user-facing web or desktop UI (use TypeScript/React)
- Testing session storage from TypeScript (use Cross-Language Parity Testing skill instead)
- Debugging network/HTTP issues (use Error Handling Patterns skill)
- Building REST API handlers (use API Gateway Pattern skill)

## Architecture Overview

### Command Router Pattern

MatMetrics CLI uses a simple, flat switch-based router with no external command framework. This avoids framework overhead while maintaining clarity.

```go
// main.go structure
func main() {
  if len(os.Args) < 2 {
    fmt.Println("Usage: matmetrics-cli <command> [args...]")
    os.Exit(1)
  }

  switch os.Args[1] {
  case "sessions":
    handleSessions(os.Args[2:])
  case "github":
    handleGitHub(os.Args[2:])
  default:
    fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
    os.Exit(1)
  }
}

// Each subcommand has its own flagset and handler
func handleSessions(args []string) {
  fs := flag.NewFlagSet("sessions", flag.ExitOnError)
  var action string
  fs.StringVar(&action, "action", "", "list|get|validate")
  fs.Parse(args)

  switch action {
  case "list":
    listSessions()
  case "validate":
    validateSessions()
  default:
    fmt.Fprintf(os.Stderr, "Unknown action: %s\n", action)
    os.Exit(1)
  }
}
```

**Key patterns:**
- Each subcommand is a separate function (`handleSessions`, `handleGitHub`)
- Per-command `flag.FlagSet` isolates flags (no global state)
- Exit on error immediately; no error return threading
- Output to `os.Stdout` for normal results, `os.Stderr` for diagnostics

### Session Validation Pattern

Validation is centralized in [internal/sessionapi/validation.go](../../../internal/sessionapi/validation.go) using regex patterns and strict parsing.

```go
// Session ID must be alphanumeric + dash/underscore
const SessionIDPattern = "^[A-Za-z0-9_-]+$"

// Date must be YYYY-MM-DD
func parseSessionDate(dateStr string) (time.Time, error) {
  return time.Parse("2006-01-02", dateStr)
}

// Full session validation
func ValidateSession(s *model.Session) error {
  var errs []string
  
  if !regexp.MustCompile(SessionIDPattern).MatchString(s.ID) {
    errs = append(errs, fmt.Sprintf("Invalid session ID: %s", s.ID))
  }
  
  if s.Effort < 1 || s.Effort > 5 {
    errs = append(errs, fmt.Sprintf("Effort must be 1-5, got %d", s.Effort))
  }
  
  if len(errs) > 0 {
    return fmt.Errorf("validation failed: %s", strings.Join(errs, "; "))
  }
  
  return nil
}
```

**Key patterns:**
- Regex patterns at package level for reuse
- Collect all errors before returning (avoid early exit for partial feedback)
- Error messages include field name and context
- Use `time.Parse()` for strict date validation

### File Layout Convention

Sessions are stored in a date-based directory structure:

```
data/
  2026/                        # Year
    03/                        # Month (zero-padded)
      YYYYMMDD-matmetrics-<id>.md
      # Example: 20260318-matmetrics-session-abc123.md
```

**File naming rules:**
- Prefix: `YYYYMMDD` (date of session)
- Middle: `-matmetrics-` (namespace)
- Suffix: URL-encoded session ID (or legacy sanitized format)
- All filenames lowercase

**File content:** YAML frontmatter + markdown sections (see [docs/go-contract.md](../../../docs/go-contract.md) for exact format).

### Storage & File Locking Pattern

[internal/storage/storage.go](../../../internal/storage/storage.go) handles concurrent file access using PID-based locks in `.index/` directory.

```go
// Acquire lock for a session
func acquireLock(sessionID string) (string, error) {
  lockDir := filepath.Join(".index", sessionID)
  
  // Create lock file: <lockDir>/<pid>
  lockFile := filepath.Join(lockDir, fmt.Sprintf("%d", os.Getpid()))
  
  for attempt := 0; attempt < maxRetries; attempt++ {
    if err := os.MkdirAll(lockDir, 0755); err == nil {
      if err := os.WriteFile(lockFile, nil, 0644); err == nil {
        return lockFile, nil // Lock acquired
      }
    }
    time.Sleep(time.Duration(attempt*50) * time.Millisecond) // Exponential backoff
  }
  
  return "", fmt.Errorf("failed to acquire lock after retries")
}

// Release lock and check for stale PIDs
func releaseLock(lockFile string) error {
  lockDir := filepath.Dir(lockFile)
  
  // Clean up stale locks (PIDs not running)
  entries, _ := os.ReadDir(lockDir)
  for _, e := range entries {
    pidStr := e.Name()
    pid, _ := strconv.Atoi(pidStr)
    if !processExists(pid) {
      os.Remove(filepath.Join(lockDir, pidStr)) // Stale, remove
    }
  }
  
  return os.Remove(lockFile)
}
```

**Key patterns:**
- Lock files are PIDs; avoids named-lock collisions
- Retry with exponential backoff (50ms, 100ms, 150ms, ...)
- Clean up stale locks from dead processes
- Mutual exclusion per session, not global

### Caching Pattern

GitHub operations (default branch, session list) use time-based caching.

```go
type GitHubCache struct {
  data      map[string]interface{}
  timestamp map[string]time.Time
  mu        sync.RWMutex
  ttl       time.Duration
}

func (c *GitHubCache) Get(key string) (interface{}, bool) {
  c.mu.RLock()
  defer c.mu.RUnlock()
  
  if cached, ok := c.data[key]; ok {
    if time.Since(c.timestamp[key]) < c.ttl {
      return cached, true // Cache hit
    }
  }
  
  return nil, false // Cache miss or expired
}

func (c *GitHubCache) Set(key string, value interface{}) {
  c.mu.Lock()
  defer c.mu.Unlock()
  
  c.data[key] = value
  c.timestamp[key] = time.Now()
}
```

**Key patterns:**
- Per-key TTL tracking (not global)
- RWMutex for concurrent reads
- In-flight deduplication: only one goroutine fetches; others wait on channel
- Cache key includes token fingerprint (support multi-token scenarios)

### Markdown Serialization Pattern

[internal/markdown/markdown.go](../../../internal/markdown/markdown.go) parses YAML frontmatter and renders markdown.

```go
// Parse YAML frontmatter
func ParseSession(content string) (*model.Session, error) {
  // Extract YAML between first and second ---
  lines := strings.Split(content, "\n")
  if lines[0] != "---" {
    return nil, fmt.Errorf("missing frontmatter start")
  }
  
  var yamlLines []string
  endIdx := -1
  for i := 1; i < len(lines); i++ {
    if lines[i] == "---" {
      endIdx = i
      break
    }
    yamlLines = append(yamlLines, lines[i])
  }
  
  if endIdx == -1 {
    return nil, fmt.Errorf("missing frontmatter end")
  }
  
  // Parse YAML
  var s model.Session
  if err := yaml.Unmarshal([]byte(strings.Join(yamlLines, "\n")), &s); err != nil {
    return nil, err
  }
  
  return &s, nil
}

// Render markdown
func RenderSession(s *model.Session) string {
  buf := &strings.Builder{}
  fmt.Fprintf(buf, "---\n")
  fmt.Fprintf(buf, "id: '%s'\n", s.ID)
  fmt.Fprintf(buf, "date: '%s'\n", s.Date.Format("2006-01-02"))
  fmt.Fprintf(buf, "effort: %d\n", s.Effort)
  fmt.Fprintf(buf, "category: '%s'\n", s.Category)
  fmt.Fprintf(buf, "duration: %d\n", s.Duration)
  fmt.Fprintf(buf, "---\n\n")
  fmt.Fprintf(buf, "# %s\n\n", s.Title)
  fmt.Fprintf(buf, s.Description)
  return buf.String()
}
```

**Key patterns:**
- YAML frontmatter delimited by `---`
- Strict parsing: fail on missing delimiters
- String builder for efficient rendering
- Date format always `YYYY-MM-DD` (frozen contract)

## Common Patterns

### Error Propagation

Functions return `(Result, error)` tuples. CLI propagates errors immediately.

```go
// In handler
if result, err := validateSessions(); err != nil {
  fmt.Fprintf(os.Stderr, "Error: %v\n", err)
  os.Exit(1)
}

// Non-error exit
fmt.Println(result)
os.Exit(0)
```

### Logging & Output

- Normal output: `fmt.Println()`
- Errors: `fmt.Fprintf(os.Stderr, "Error: %v\n", err)`
- JSON output: Use `json.Marshal()` for machine-readable formats
- No structured logging library; simple is best

### Testing Patterns

Tests use mock HTTP transports and temp directories.

```go
// Mock GitHub response
func TestListSessionsFromGitHub(t *testing.T) {
  gh := &GitHubAPI{
    HTTPClient: &http.Client{
      Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
        body := `[{"id": "abc123", "filename": "20260318-matmetrics-abc123.md"}]`
        return &http.Response{
          StatusCode: 200,
          Body:       io.NopCloser(strings.NewReader(body)),
        }, nil
      }),
    },
  }
  
  sessions, _ := gh.ListSessions("owner", "repo", "main")
  if len(sessions) != 1 {
    t.Fail()
  }
}
```

## Common Gotchas

### Session ID Encoding

New sessions use URL-encoded IDs (`a%2Fb` for `a/b`). Legacy sessions used sanitized dashes (`a-b`). Lookups must check both formats.

```go
// Lookup helper: try both encoded and sanitized
func findSessionFile(dataDir, sessionID string) (string, error) {
  // Try URL-encoded format first
  if path, err := findByPattern(dataDir, fmt.Sprintf("*-%s.md", url.QueryEscape(sessionID))); err == nil {
    return path, nil
  }
  
  // Fall back to legacy sanitized format
  sanitized := strings.Map(func(r rune) rune {
    if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
      return r
    }
    return '-'
  }, sessionID)
  
  return findByPattern(dataDir, fmt.Sprintf("*-%s.md", sanitized))
}
```

**Impact:** Without this, legacy sessions become unfindable after code changes.

### File Walk Silently Fails If Base Directory Missing

`filepath.Walk()` silently returns `nil` if the base directory doesn't exist, leading to empty results instead of an error.

```go
// WRONG: Silent failure if data/ doesn't exist
sessions, _ := walkSessions("data/2026")

// RIGHT: Explicit directory check
if _, err := os.Stat("data/2026"); os.IsNotExist(err) {
  return fmt.Errorf("session directory not found")
}
sessions, _ := walkSessions("data/2026")
```

### GitHub Token Fingerprint Caching

Cache key must include token hash to support scenarios where multiple tokens are in use (e.g., rotation, multi-account).

```go
// WRONG: Cache key ignores token
cacheKey := fmt.Sprintf("%s/%s/%s", owner, repo, branch)

// RIGHT: Include token fingerprint
tokenHash := sha256.Sum256([]byte(token))
cacheKey := fmt.Sprintf("%s/%s/%s/%x", owner, repo, branch, tokenHash)
```

**Impact:** Without this, user A sees results cached under user B's token, leading to authorization bugs.

### Date Parsing Must Be Strict

Session dates must be `YYYY-MM-DD` (frozen contract). Use strict parsing, not fuzzy date detection.

```go
// WRONG: Fuzzy parsing accepts "3/18/26"
t, _ := time.Parse("1/2/06", dateStr)

// RIGHT: Strict parsing
t, _ := time.Parse("2006-01-02", dateStr)
if t.IsZero() {
  return fmt.Errorf("date must be YYYY-MM-DD, got %s", dateStr)
}
```

### In-Flight Deduplication Requires Channel Sync

When multiple goroutines request the same GitHub resource, only one should fetch; others wait for the result.

```go
type InFlightCache struct {
  results map[string]chan interface{}
  mu      sync.Mutex
}

func (c *InFlightCache) Get(key string, fetch func() (interface{}, error)) (interface{}, error) {
  c.mu.Lock()
  if ch, ok := c.results[key]; ok {
    c.mu.Unlock()
    return <-ch, nil // Wait for in-flight result
  }
  
  ch := make(chan interface{})
  c.results[key] = ch
  c.mu.Unlock()
  
  // This goroutine owns the fetch
  result, _ := fetch()
  ch <- result
  close(ch)
  
  return result, nil
}
```

**Impact:** Without this, identical concurrent requests to GitHub cause duplicate API calls, wasting quota and slowing CLI.

## References

- [go/cmd/matmetrics-cli/main.go](../../../go/cmd/matmetrics-cli/main.go) — Command router entry point
- [internal/sessionapi/validation.go](../../../internal/sessionapi/validation.go) — Session validation rules
- [internal/storage/storage.go](../../../internal/storage/storage.go) — File layout and locking
- [internal/githubapi/github.go](../../../internal/githubapi/github.go) — GitHub API client and caching
- [internal/markdown/markdown.go](../../../internal/markdown/markdown.go) — Markdown parsing and rendering
- [docs/go-contract.md](../../../docs/go-contract.md) — Frozen session shape and markdown format contract

## Next Steps

- Implement a new CLI subcommand using this pattern (e.g., `matmetrics github sync-all`)
- Add integration tests using mock HTTP transports and temp directories
- Verify parity with TypeScript validation using shared fixture file (`testdata/validation/session-validation-fixtures.json`)
