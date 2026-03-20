package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerRejectsMalformedDateBeforeCallingGitHub(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	body := []byte(`{"session":{"id":"session-1","date":"01/12/2025","effort":3,"category":"Technical","techniques":["osoto-gari"]},"config":{"owner":"octocat","repo":"hello-world"}}`)

	request := httptest.NewRequest(http.MethodPut, "/api/go/sessions/update", bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}

	if got := recorder.Body.String(); got == "" || !bytes.Contains([]byte(got), []byte("Invalid date: must be a real calendar date")) {
		t.Fatalf("unexpected body: %s", got)
	}
}
