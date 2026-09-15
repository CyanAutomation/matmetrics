package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"matmetrics/pkg/githubapi"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestHandlerReturnsBadRequestWhenIDIsEmpty(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	request := httptest.NewRequest(http.MethodDelete, "/api/go/sessions/delete", bytes.NewReader([]byte(`{"id":"   ","config":{"owner":"octocat","repo":"hello-world"}}`)))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	if payload["error"] != "Missing session id" {
		t.Fatalf("error = %q, want %q", payload["error"], "Missing session id")
	}
}

func TestHandlerReturnsConfigValidationErrorForValidIDWhenOwnerRepoMissing(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	request := httptest.NewRequest(http.MethodDelete, "/api/go/sessions/delete", bytes.NewReader([]byte(`{"id":"session-123","config":{"owner":"","repo":""}}`)))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}

	if payload["error"] != "Missing owner or repo" {
		t.Fatalf("error = %q, want %q", payload["error"], "Missing owner or repo")
	}
}

func TestHandlerReturnsConflictWhenDeleteRevisionIsStale(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")
	originalNewClient := newGitHubClient
	t.Cleanup(func() { newGitHubClient = originalNewClient })
	newGitHubClient = func() (*githubapi.Client, error) {
		return &githubapi.Client{
			BaseURL: "https://example.test",
			Token:   "test-token",
			HTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
				body := `{"message":"Not Found"}`
				status := http.StatusNotFound
				switch {
				case strings.Contains(request.URL.Path, "/git/ref/heads/"):
					body, status = `{"object":{"sha":"commit-sha"}}`, http.StatusOK
				case strings.Contains(request.URL.Path, "/git/commits/"):
					body, status = `{"tree":{"sha":"tree-sha"}}`, http.StatusOK
				case strings.Contains(request.URL.Path, "/git/trees/"):
					body, status = `{"truncated":false,"tree":[{"path":"data/2026/03/20260318-matmetrics-session-123.md","type":"blob"}]}`, http.StatusOK
				case strings.Contains(request.URL.Path, "/contents/"):
					body, status = `{"sha":"sha-after-update","content":""}`, http.StatusOK
				}
				return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: request}, nil
			})},
		}, nil
	}

	request := httptest.NewRequest(http.MethodDelete, "/api/go/sessions/delete", bytes.NewReader([]byte(`{"id":"session-123","revisionSha":"sha-client-read","config":{"owner":"octocat","repo":"hello-world","branch":"main"}}`)))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d; body = %s", recorder.Code, http.StatusConflict, recorder.Body.String())
	}
}
