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
	t.Setenv("NODE_ENV", "test")

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	ok := RequireAuthenticatedUser(recorder, request)
	if !ok {
		t.Fatal("expected authentication to pass")
	}
	principal, ok := AuthenticatedPrincipalFromContext(request.Context())
	if !ok || principal.Provider != "test" || principal.UserID != "test-user" || principal.AppUserID != principal.UserID {
		t.Fatalf("principal = %#v, ok = %v, want test principal", principal, ok)
	}
}

func TestRequireAuthenticatedUserAcceptsLowercaseBearerScheme(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")
	t.Setenv("NODE_ENV", "test")

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "bearer test-token")
	recorder := httptest.NewRecorder()

	ok := RequireAuthenticatedUser(recorder, request)
	if !ok {
		t.Fatal("expected authentication to pass for lowercase bearer scheme")
	}
}

func TestRequireAuthenticatedUserRejectsInvalidTestModeToken(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")
	t.Setenv("NODE_ENV", "test")

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer invalid")
	recorder := httptest.NewRecorder()

	ok := RequireAuthenticatedUser(recorder, request)
	if ok {
		t.Fatal("expected authentication to fail")
	}
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuthenticatedUserDoesNotEnableTestModeOutsideTests(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")
	t.Setenv("NODE_ENV", "production")

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()

	if RequireAuthenticatedUser(recorder, request) {
		t.Fatal("test token was accepted outside NODE_ENV=test")
	}
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuthenticatedUserRejectsMalformedAuthorizationHeaders(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "true")
	t.Setenv("NODE_ENV", "test")

	malformedHeaders := []string{
		"Bearer",
		"Basic test-token",
		"Token test-token",
		"test-token",
	}

	for _, authorization := range malformedHeaders {
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		request.Header.Set("Authorization", authorization)
		recorder := httptest.NewRecorder()

		ok := RequireAuthenticatedUser(recorder, request)
		if ok {
			t.Fatalf("expected authentication to fail for malformed header %q", authorization)
		}
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("header %q: status = %d, want %d", authorization, recorder.Code, http.StatusUnauthorized)
		}
	}
}
