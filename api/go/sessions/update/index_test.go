package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerRejectsOutOfRangeEffort(t *testing.T) {
	body := []byte(`{"session":{"id":"session-1","date":"2025-01-12","effort":6,"category":"Technical","techniques":["osoto-gari"]},"config":{"owner":"octocat","repo":"hello-world"}}`)
	request := httptest.NewRequest(http.MethodPut, "/api/go/sessions/update", bytes.NewReader(body))
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	if got := recorder.Body.String(); got == "" || !bytes.Contains([]byte(got), []byte("Invalid effort level (must be 1-5)")) {
		t.Fatalf("unexpected body: %s", got)
	}
}
