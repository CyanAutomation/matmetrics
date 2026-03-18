package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireAuthenticatedUserRejectsMissingAuthorization(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()

	ok := RequireAuthenticatedUser(recorder, request)
	if ok {
		t.Fatal("expected authentication to fail")
	}
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuthenticatedUserAcceptsTestModeToken(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	ok := RequireAuthenticatedUser(recorder, request)
	if !ok {
		t.Fatal("expected authentication to pass")
	}
}
