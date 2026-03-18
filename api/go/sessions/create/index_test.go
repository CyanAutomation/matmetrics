package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerRejectsOutOfRangeEffort(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	body, err := json.Marshal(sessionRequest{
		Session: sessionRequest{}.Session,
		Config:  sessionRequest{}.Config,
	})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	// overwrite zero-value payload with a valid request except effort
	body = []byte(`{"session":{"id":"session-1","date":"2025-01-12","effort":0,"category":"Technical","techniques":["osoto-gari"]},"config":{"owner":"octocat","repo":"hello-world"}}`)

	request := httptest.NewRequest(http.MethodPost, "/api/go/sessions/create", bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	if got := recorder.Body.String(); got == "" || !bytes.Contains([]byte(got), []byte("Invalid effort level (must be 1-5)")) {
		t.Fatalf("unexpected body: %s", got)
	}
}

func TestHandlerRejectsMissingAuthorization(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/go/sessions/create", bytes.NewReader([]byte(`{}`)))
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}
