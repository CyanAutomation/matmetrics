package githubapi

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"matmetrics/go/internal/model"
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

	client := &Client{
		BaseURL: "https://example.test",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch {
			case r.Method == http.MethodGet && r.URL.Path == "/repos/o/r":
				return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/sessions/2025/03/20250314-matmetrics-stable.md"):
				payload := map[string]any{
					"sha":     "sha-stable",
					"content": base64.StdEncoding.EncodeToString([]byte("---\nid: \"stable\"\ndate: \"2025-03-14\"\neffort: 3\ncategory: \"Technical\"\n---\n\n# March 14, 2025 – Judo Session\n\n## Techniques Practiced\n- (none recorded)\n\n")),
				}
				return jsonBodyResponse(http.StatusOK, payload), nil
			case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/sessions/2025/03/20250314-matmetrics-changed.md"):
				return jsonResponse(http.StatusNotFound, `{"message":"Not Found"}`), nil
			case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/contents/sessions/2025/03/20250314-matmetrics-changed.md"):
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
