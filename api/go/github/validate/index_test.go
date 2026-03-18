package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerRejectsMissingAuthorization(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/go/github/validate", bytes.NewReader([]byte(`{}`)))
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestHandlerContinuesWhenAuthorized(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	request := httptest.NewRequest(http.MethodPost, "/api/go/github/validate", bytes.NewReader([]byte(`{"owner":"","repo":""}`)))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
}
