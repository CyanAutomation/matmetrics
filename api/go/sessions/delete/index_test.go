package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

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
