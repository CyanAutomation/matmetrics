package handler

import (
	"bytes"
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

	if got := recorder.Body.String(); got == "" || !bytes.Contains([]byte(got), []byte("Missing session id")) {
		t.Fatalf("unexpected body: %s", got)
	}
}

func TestHandlerWithValidIDContinuesToExistingConfigValidation(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	request := httptest.NewRequest(http.MethodDelete, "/api/go/sessions/delete", bytes.NewReader([]byte(`{"id":"session-123","config":{"owner":"","repo":""}}`)))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	if got := recorder.Body.String(); got == "" || !bytes.Contains([]byte(got), []byte("Missing owner or repo")) {
		t.Fatalf("unexpected body: %s", got)
	}
}
