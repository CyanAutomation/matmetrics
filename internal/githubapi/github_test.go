package githubapi

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"matmetrics/internal/markdown"
	"matmetrics/internal/model"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestSessionGitHubPathEncodesIdentifiers(t *testing.T) {
	a, err := SessionGitHubPath(model.Session{
		ID:         "a/b",
		Date:       "2025-03-14",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{},
	})
	if err != nil {
		t.Fatalf("SessionGitHubPath() error = %v", err)
	}
	b, err := SessionGitHubPath(model.Session{
		ID:         "a?b",
		Date:       "2025-03-14",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{},
	})
	if err != nil {
		t.Fatalf("SessionGitHubPath() error = %v", err)
	}

	if !strings.HasSuffix(a, "a%2Fb.md") || !strings.HasSuffix(b, "a%3Fb.md") || a == b {
		t.Fatalf("unexpected paths: %q %q", a, b)
	}
	if !strings.HasPrefix(a, "data/2025/03/") || !strings.HasPrefix(b, "data/2025/03/") {
		t.Fatalf("expected data root paths, got %q %q", a, b)
	}
}

func TestValidateUsesDefaultBranchWhenBranchUnset(t *testing.T) {
	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch r.URL.Path {
			case "/repos/o/r":
				return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
			default:
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			}
		})},
		Token: "test-token",
	}

	result, err := client.Validate(model.GitHubConfig{Owner: "o", Repo: "r"})
	if err != nil {
		t.Fatalf("Validate() error = %v", err)
	}

	if !result.Success || result.Branch != "main" {
		t.Fatalf("unexpected validate result: %#v", result)
	}
}

func TestSyncAllSkipsUnchangedAndPushesChangedSessions(t *testing.T) {
	var putCount int
	stableMarkdown, err := markdown.SessionToMarkdown(model.Session{
		ID:         "stable",
		Date:       "2025-03-14",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{},
	})
	if err != nil {
		t.Fatalf("SessionToMarkdown() error = %v", err)
	}

	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/repos/o/r":
				return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/ref/heads/"):
				return jsonResponse(http.StatusOK, `{"object":{"sha":"commit-sha"}}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/commits/"):
				return jsonResponse(http.StatusOK, `{"tree":{"sha":"tree-sha"}}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/trees/"):
				return jsonResponse(http.StatusOK, `{"truncated":false,"tree":[{"path":"data/2025/03/20250314-matmetrics-stable.md","type":"blob"}]}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/data/2025/03/20250314-matmetrics-stable.md"):
				payload := map[string]any{
					"sha":     "sha-stable",
					"content": base64.StdEncoding.EncodeToString([]byte(stableMarkdown)),
				}
				return jsonBodyResponse(http.StatusOK, payload), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/data/2025/03/20250314-matmetrics-changed.md"):
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/contents/data/2025/03/20250314-matmetrics-changed.md"):
				putCount++
				return jsonResponse(http.StatusOK, `{"content":{"sha":"sha-new"}}`), nil
			default:
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			}
		})},
		Token: "test-token",
	}

	result, err := client.SyncAll(model.GitHubConfig{Owner: "o", Repo: "r"}, []model.Session{
		{ID: "stable", Date: "2025-03-14", Effort: 3, Category: model.CategoryTechnical, Techniques: []string{}},
		{ID: "changed", Date: "2025-03-14", Effort: 3, Category: model.CategoryTechnical, Techniques: []string{}},
	})
	if err != nil {
		t.Fatalf("SyncAll() error = %v", err)
	}

	if !result.Success || result.Pushed != 1 || result.Skipped != 1 || putCount != 1 {
		t.Fatalf("unexpected sync result: %#v putCount=%d", result, putCount)
	}
}

func TestGetFileEncodesPathSegmentsAndRefQuery(t *testing.T) {
	var gotPath string
	var gotQuery string

	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			gotPath = r.URL.EscapedPath()
			gotQuery = r.URL.RawQuery
			return jsonBodyResponse(http.StatusOK, map[string]any{
				"sha":     "sha-1",
				"content": base64.StdEncoding.EncodeToString([]byte("hello")),
			}), nil
		})},
		Token: "test-token",
	}

	_, _, err := client.getFile(model.GitHubConfig{Owner: "o", Repo: "r"}, "data/2025/03/20250314-matmetrics-a%2Fb.md", "feature/session-sync")
	if err != nil {
		t.Fatalf("getFile() error = %v", err)
	}

	wantPath := "/repos/o/r/contents/data/2025/03/20250314-matmetrics-a%252Fb.md"
	if gotPath != wantPath {
		t.Fatalf("unexpected path: got %q want %q", gotPath, wantPath)
	}
	if gotQuery != "ref=feature%2Fsession-sync" {
		t.Fatalf("unexpected query: %q", gotQuery)
	}
}

func TestListTreeEntriesFromContentsAPIEncodesPathAndRef(t *testing.T) {
	var gotPath string
	var gotQuery string

	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			gotPath = r.URL.EscapedPath()
			gotQuery = r.URL.RawQuery
			return jsonResponse(http.StatusOK, `[]`), nil
		})},
		Token: "test-token",
	}

	entries, err := client.listTreeEntriesFromContentsAPI(model.GitHubConfig{Owner: "o", Repo: "r"}, "feature/session-sync", "data/a%2Fb")
	if err != nil {
		t.Fatalf("listTreeEntriesFromContentsAPI() error = %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no entries, got %d", len(entries))
	}

	wantPath := "/repos/o/r/contents/data/a%252Fb"
	if gotPath != wantPath {
		t.Fatalf("unexpected path: got %q want %q", gotPath, wantPath)
	}
	if gotQuery != "ref=feature%2Fsession-sync" {
		t.Fatalf("unexpected query: %q", gotQuery)
	}
}

func TestGetTreeEntriesForPathBranchEndpointHandlesNestedAndSimpleBranchNames(t *testing.T) {
	cases := []struct {
		name       string
		branch     string
		wantRefURI string
	}{
		{
			name:       "nested branch name",
			branch:     "feature/session-sync",
			wantRefURI: "/repos/o/r/git/ref/heads/feature/session-sync",
		},
		{
			name:       "simple branch name unchanged",
			branch:     "main",
			wantRefURI: "/repos/o/r/git/ref/heads/main",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var seenRefPath string

			client := &Client{
				BaseURL: "https://example.test",
				HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
					switch {
					case strings.Contains(r.URL.Path, "/git/ref/heads/"):
						seenRefPath = r.URL.EscapedPath()
						return jsonResponse(http.StatusOK, `{"object":{"sha":"commit-sha"}}`), nil
					case strings.Contains(r.URL.Path, "/git/commits/"):
						return jsonResponse(http.StatusOK, `{"tree":{"sha":"tree-sha"}}`), nil
					case strings.Contains(r.URL.Path, "/git/trees/"):
						return jsonResponse(http.StatusOK, `{"truncated":false,"tree":[]}`), nil
					default:
						return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
					}
				})},
				Token: "test-token",
			}

			entries, err := client.getTreeEntriesForPath(model.GitHubConfig{Owner: "o", Repo: "r"}, tc.branch, "data")
			if err != nil {
				t.Fatalf("getTreeEntriesForPath() error = %v", err)
			}
			if len(entries) != 0 {
				t.Fatalf("expected no entries, got %d", len(entries))
			}
			if seenRefPath != tc.wantRefURI {
				t.Fatalf("unexpected ref endpoint path: got %q want %q", seenRefPath, tc.wantRefURI)
			}
		})
	}
}

func TestGetTreeEntriesForPathReturnsNon404BranchRefError(t *testing.T) {
	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if strings.Contains(r.URL.Path, "/git/ref/heads/") {
				return jsonResponse(http.StatusForbidden, `{"message":"Forbidden"}`), nil
			}
			t.Fatalf("unexpected request path: %s", r.URL.Path)
			return nil, nil
		})},
		Token: "test-token",
	}

	_, err := client.getTreeEntriesForPath(model.GitHubConfig{Owner: "o", Repo: "r"}, "main", "data")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	apiErr, ok := err.(*gitHubAPIError)
	if !ok {
		t.Fatalf("expected *gitHubAPIError, got %T", err)
	}
	if apiErr.Status != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, apiErr.Status)
	}
}

func TestFindSessionPathOnGitHubByIDFallsBackToLegacySanitizedSuffix(t *testing.T) {
	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch {
			case strings.Contains(r.URL.Path, "/git/ref/heads/"):
				return jsonResponse(http.StatusOK, `{"object":{"sha":"commit-sha"}}`), nil
			case strings.Contains(r.URL.Path, "/git/commits/"):
				return jsonResponse(http.StatusOK, `{"tree":{"sha":"tree-sha"}}`), nil
			case strings.Contains(r.URL.Path, "/git/trees/"):
				return jsonResponse(http.StatusOK, `{"truncated":false,"tree":[{"path":"data/2025/03/20250314-matmetrics-a-b.md","type":"blob"}]}`), nil
			default:
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			}
		})},
		Token: "test-token",
	}

	path, branch, err := client.findSessionPathOnGitHubByID(model.GitHubConfig{Owner: "o", Repo: "r", Branch: "main"}, "a/b")
	if err != nil {
		t.Fatalf("findSessionPathOnGitHubByID() error = %v", err)
	}

	if path != "data/2025/03/20250314-matmetrics-a-b.md" {
		t.Fatalf("unexpected path: %q", path)
	}
	if branch != "main" {
		t.Fatalf("unexpected branch: %q", branch)
	}
}

func TestDiagnoseLogsHappyPath(t *testing.T) {
	validMarkdown, err := markdown.SessionToMarkdown(model.Session{
		ID:         "session-valid",
		Date:       "2026-03-18",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{"Uchi mata"},
	})
	if err != nil {
		t.Fatalf("SessionToMarkdown() error = %v", err)
	}

	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/repos/o/r":
				return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/ref/heads/"):
				return jsonResponse(http.StatusOK, `{"object":{"sha":"commit-sha"}}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/commits/"):
				return jsonResponse(http.StatusOK, `{"tree":{"sha":"tree-sha"}}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/trees/"):
				return jsonResponse(http.StatusOK, `{"truncated":false,"tree":[{"path":"data/2026/03/20260318-matmetrics-session-valid.md","type":"blob"}]}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/data/2026/03/20260318-matmetrics-session-valid.md"):
				return jsonBodyResponse(http.StatusOK, map[string]any{
					"sha":     "sha-valid",
					"content": base64.StdEncoding.EncodeToString([]byte(validMarkdown)),
				}), nil
			default:
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			}
		})},
		Token: "test-token",
	}

	result, err := client.DiagnoseLogs(model.GitHubConfig{Owner: "o", Repo: "r"})
	if err != nil {
		t.Fatalf("DiagnoseLogs() error = %v", err)
	}

	if !result.Success {
		t.Fatalf("expected success, got %#v", result)
	}
	if result.Summary.TotalFiles != 1 || result.Summary.ValidFiles != 1 || result.Summary.InvalidFiles != 0 {
		t.Fatalf("unexpected summary: %#v", result.Summary)
	}
	if len(result.Files) != 1 || result.Files[0].Status != "valid" || result.Files[0].ID != "session-valid" {
		t.Fatalf("unexpected files result: %#v", result.Files)
	}
}

func TestDiagnoseLogsMixedValidAndInvalidFiles(t *testing.T) {
	validMarkdown, err := markdown.SessionToMarkdown(model.Session{
		ID:         "session-valid",
		Date:       "2026-03-18",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{"Uchi mata"},
	})
	if err != nil {
		t.Fatalf("SessionToMarkdown() error = %v", err)
	}

	invalidFrontmatter := `---
id: "bad-frontmatter"
date "2026-03-19"
effort: 3
category: "Technical"
---

# Broken frontmatter

## Techniques Practiced
- O soto gari

## Session Description

Content

## Notes

Notes`

	missingRequiredSections := `---
id: "missing-sections"
date: "2026-03-20"
effort: 3
category: "Technical"
---

# Missing sections`

	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/repos/o/r":
				return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/ref/heads/"):
				return jsonResponse(http.StatusOK, `{"object":{"sha":"commit-sha"}}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/commits/"):
				return jsonResponse(http.StatusOK, `{"tree":{"sha":"tree-sha"}}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/trees/"):
				return jsonResponse(http.StatusOK, `{"truncated":false,"tree":[{"path":"data/2026/03/20260318-matmetrics-session-valid.md","type":"blob"},{"path":"data/2026/03/20260319-matmetrics-bad-frontmatter.md","type":"blob"},{"path":"data/2026/03/20260320-matmetrics-missing-sections.md","type":"blob"}]}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/data/2026/03/20260318-matmetrics-session-valid.md"):
				return jsonBodyResponse(http.StatusOK, map[string]any{"sha": "sha-valid", "content": base64.StdEncoding.EncodeToString([]byte(validMarkdown))}), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/data/2026/03/20260319-matmetrics-bad-frontmatter.md"):
				return jsonBodyResponse(http.StatusOK, map[string]any{"sha": "sha-invalid-frontmatter", "content": base64.StdEncoding.EncodeToString([]byte(invalidFrontmatter))}), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/data/2026/03/20260320-matmetrics-missing-sections.md"):
				return jsonBodyResponse(http.StatusOK, map[string]any{"sha": "sha-invalid-sections", "content": base64.StdEncoding.EncodeToString([]byte(missingRequiredSections))}), nil
			default:
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			}
		})},
		Token: "test-token",
	}

	result, err := client.DiagnoseLogs(model.GitHubConfig{Owner: "o", Repo: "r"})
	if err != nil {
		t.Fatalf("DiagnoseLogs() error = %v", err)
	}

	if result.Success {
		t.Fatalf("expected overall failure, got success: %#v", result)
	}
	if result.Summary.TotalFiles != 3 || result.Summary.ValidFiles != 1 || result.Summary.InvalidFiles != 2 {
		t.Fatalf("unexpected summary: %#v", result.Summary)
	}
	if len(result.Files) != 3 {
		t.Fatalf("unexpected file count: %d", len(result.Files))
	}

	invalidCount := 0
	for _, file := range result.Files {
		if file.Status == "invalid" {
			invalidCount++
			if len(file.Errors) == 0 {
				t.Fatalf("expected errors for invalid file: %#v", file)
			}
		}
	}
	if invalidCount != 2 {
		t.Fatalf("expected 2 invalid files, got %d", invalidCount)
	}
}

func TestDiagnoseLogsRepoNotFound(t *testing.T) {
	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.Method == http.MethodGet && r.URL.Path == "/repos/o/r" {
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			}
			return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
		})},
		Token: "test-token",
	}

	_, err := client.DiagnoseLogs(model.GitHubConfig{Owner: "o", Repo: "r"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "Not Found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDiagnoseLogsPathNotFoundReturnsEmptyReport(t *testing.T) {
	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/repos/o/r":
				return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/ref/heads/"):
				return jsonResponse(http.StatusOK, `{"object":{"sha":"commit-sha"}}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/commits/"):
				return jsonResponse(http.StatusOK, `{"tree":{"sha":"tree-sha"}}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/git/trees/"):
				return jsonResponse(http.StatusOK, `{"truncated":false,"tree":[]}`), nil
			default:
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			}
		})},
		Token: "test-token",
	}

	result, err := client.DiagnoseLogs(model.GitHubConfig{Owner: "o", Repo: "r"})
	if err != nil {
		t.Fatalf("DiagnoseLogs() error = %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success for empty path, got %#v", result)
	}
	if result.Summary.TotalFiles != 0 || result.Summary.ValidFiles != 0 || result.Summary.InvalidFiles != 0 {
		t.Fatalf("unexpected summary: %#v", result.Summary)
	}
}

func TestFixLogsDryRunProvidesPreview(t *testing.T) {
	input := `---
id: "needs-fix"
date: "2026-03-20"
effort: 3
category: "Technical"
---

# Needs fix

## Notes

Out of order sections.

## Techniques Practiced
- Kouchi gari
`

	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/repos/o/r":
				return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/data/2026/03/needs-fix.md"):
				return jsonBodyResponse(http.StatusOK, map[string]any{"sha": "sha-1", "content": base64.StdEncoding.EncodeToString([]byte(input))}), nil
			default:
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			}
		})},
		Token: "test-token",
	}

	result, err := client.FixLogs(model.GitHubConfig{Owner: "o", Repo: "r"}, LogDoctorFixRequest{
		Mode:  LogDoctorFixModeDryRun,
		Paths: []string{"data/2026/03/needs-fix.md"},
	})
	if err != nil {
		t.Fatalf("FixLogs() error = %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success, got %#v", result)
	}
	if len(result.Files) != 1 || result.Files[0].Status != "preview" {
		t.Fatalf("unexpected file result: %#v", result.Files)
	}
	if !result.Files[0].Preview.Changed {
		t.Fatalf("expected changed preview: %#v", result.Files[0].Preview)
	}
}

func TestFixLogsApplyRequiresConfirmation(t *testing.T) {
	client := &Client{
		BaseURL:    "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) { return jsonResponse(http.StatusOK, `{}`), nil })},
		Token:      "test-token",
	}

	_, err := client.FixLogs(model.GitHubConfig{Owner: "o", Repo: "r", Branch: "main"}, LogDoctorFixRequest{
		Mode:  LogDoctorFixModeApply,
		Paths: []string{"data/2026/03/needs-fix.md"},
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "explicit confirmation") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFixLogsRejectsUnsafePath(t *testing.T) {
	client := &Client{
		BaseURL:    "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) { return jsonResponse(http.StatusOK, `{}`), nil })},
		Token:      "test-token",
	}

	_, err := client.FixLogs(model.GitHubConfig{Owner: "o", Repo: "r", Branch: "main"}, LogDoctorFixRequest{
		Mode:  LogDoctorFixModeDryRun,
		Paths: []string{"../etc/passwd"},
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "invalid file path") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Status:     http.StatusText(status),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func jsonBodyResponse(status int, payload any) *http.Response {
	raw, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return jsonResponse(status, string(raw))
}
