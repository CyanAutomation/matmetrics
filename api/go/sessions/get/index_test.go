package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerRejectsMissingAuthorization(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/go/sessions/get?owner=octocat&repo=hello-world&id=session-1", nil)
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestHandlerContinuesWhenAuthorized(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	request := httptest.NewRequest(http.MethodGet, "/api/go/sessions/get", nil)
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	Handler(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
}
