package httpapi

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	testAuthAudience = "matmetrics-api"
	testAuthKeyID    = "better-auth-test-key"
)

type testJWKS struct {
	mu     sync.RWMutex
	body   string
	status int
}

func (j *testJWKS) set(body string, status int) {
	j.mu.Lock()
	j.body = body
	j.status = status
	j.mu.Unlock()
}

func (j *testJWKS) serve(w http.ResponseWriter, _ *http.Request) {
	j.mu.RLock()
	body, status := j.body, j.status
	j.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

func newTestBetterAuthVerifier(t *testing.T, jwks *testJWKS) *betterAuthVerifier {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(jwks.serve))
	t.Cleanup(server.Close)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	verifier, err := newBetterAuthVerifier(ctx, betterAuthConfig{
		JWKSURL:  server.URL,
		Issuer:   server.URL,
		Audience: testAuthAudience,
	}, server.Client().Transport)
	if err != nil {
		t.Fatalf("newBetterAuthVerifier() error = %v", err)
	}
	return verifier
}

func testEd25519Key(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return publicKey, privateKey
}

func testJWKSJSON(t *testing.T, kid string, publicKey ed25519.PublicKey) string {
	t.Helper()
	set := struct {
		Keys []map[string]string `json:"keys"`
	}{Keys: []map[string]string{{
		"alg": "EdDSA",
		"crv": "Ed25519",
		"kid": kid,
		"kty": "OKP",
		"use": "sig",
		"x":   base64.RawURLEncoding.EncodeToString(publicKey),
	}}}
	body, err := json.Marshal(set)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func validBetterAuthClaims(now time.Time, issuer string) betterAuthTokenClaims {
	return betterAuthTokenClaims{
		AppUserID: "legacy-firebase-uid",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   "legacy-firebase-uid",
			Audience:  jwt.ClaimStrings{testAuthAudience},
			IssuedAt:  jwt.NewNumericDate(now.Add(-time.Minute)),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
		},
	}
}

func signBetterAuthToken(t *testing.T, kid string, privateKey ed25519.PrivateKey, claims betterAuthTokenClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = kid
	signed, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func TestBetterAuthVerifierAcceptsCanonicalEdDSAToken(t *testing.T) {
	publicKey, privateKey := testEd25519Key(t)
	jwks := &testJWKS{}
	jwks.set(testJWKSJSON(t, testAuthKeyID, publicKey), http.StatusOK)
	verifier := newTestBetterAuthVerifier(t, jwks)

	principal, err := verifier.verify(context.Background(), signBetterAuthToken(t, testAuthKeyID, privateKey, validBetterAuthClaims(time.Now(), verifier.config.Issuer)))
	if err != nil {
		t.Fatalf("verify() error = %v", err)
	}
	if principal.Provider != "better-auth" || principal.UserID != "legacy-firebase-uid" || principal.AppUserID != principal.UserID {
		t.Fatalf("principal = %#v, want Better Auth principal for canonical Firebase UID", principal)
	}
}

func TestRequireAuthenticatedUserAcceptsBetterAuthAndAttachesCanonicalPrincipal(t *testing.T) {
	resetBetterAuthVerifierForTest()
	t.Cleanup(resetBetterAuthVerifierForTest)
	publicKey, privateKey := testEd25519Key(t)
	jwks := &testJWKS{}
	jwks.set(testJWKSJSON(t, testAuthKeyID, publicKey), http.StatusOK)
	server := httptest.NewTLSServer(http.HandlerFunc(jwks.serve))
	defer server.Close()
	previousTransport := http.DefaultTransport
	http.DefaultTransport = server.Client().Transport
	t.Cleanup(func() { http.DefaultTransport = previousTransport })
	t.Setenv("MATMETRICS_AUTH_JWKS_URL", server.URL)
	t.Setenv("MATMETRICS_AUTH_ISSUER", server.URL)
	t.Setenv("MATMETRICS_AUTH_AUDIENCE", testAuthAudience)
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "false")
	t.Setenv("NODE_ENV", "production")

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	claims := validBetterAuthClaims(time.Now(), server.URL)
	request.Header.Set("Authorization", "Bearer "+signBetterAuthToken(t, testAuthKeyID, privateKey, claims))
	recorder := httptest.NewRecorder()
	if !RequireAuthenticatedUser(recorder, request) {
		t.Fatalf("Better Auth authentication failed with status %d: %s", recorder.Code, recorder.Body.String())
	}
	principal, ok := AuthenticatedPrincipalFromContext(request.Context())
	if !ok || principal.Provider != "better-auth" || principal.UserID != "legacy-firebase-uid" || principal.AppUserID != principal.UserID {
		t.Fatalf("principal = %#v, ok = %v, want canonical Better Auth principal", principal, ok)
	}
}

func TestBetterAuthVerifierRejectsInvalidSignature(t *testing.T) {
	publicKey, _ := testEd25519Key(t)
	_, attackerKey := testEd25519Key(t)
	jwks := &testJWKS{}
	jwks.set(testJWKSJSON(t, testAuthKeyID, publicKey), http.StatusOK)
	verifier := newTestBetterAuthVerifier(t, jwks)

	_, err := verifier.verify(context.Background(), signBetterAuthToken(t, testAuthKeyID, attackerKey, validBetterAuthClaims(time.Now(), verifier.config.Issuer)))
	if err == nil {
		t.Fatal("verify() accepted a token signed with a different key")
	}
}

func TestBetterAuthVerifierKeepsInvalidCredentialsUnauthorizedDuringJWKSOutage(t *testing.T) {
	publicKey, _ := testEd25519Key(t)
	_, attackerKey := testEd25519Key(t)
	jwks := &testJWKS{}
	jwks.set(testJWKSJSON(t, testAuthKeyID, publicKey), http.StatusOK)
	verifier := newTestBetterAuthVerifier(t, jwks)
	verifier.health.markFailure()

	_, err := verifier.verify(context.Background(), signBetterAuthToken(t, testAuthKeyID, attackerKey, validBetterAuthClaims(time.Now(), verifier.config.Issuer)))
	if err == nil {
		t.Fatal("verify() accepted a token with an invalid signature")
	}
	if errors.Is(err, errAuthVerificationUnavailable) {
		t.Fatal("invalid signature was misclassified as a JWKS outage")
	}
}

func TestBetterAuthVerifierRejectsInvalidClaims(t *testing.T) {
	publicKey, privateKey := testEd25519Key(t)
	jwks := &testJWKS{}
	jwks.set(testJWKSJSON(t, testAuthKeyID, publicKey), http.StatusOK)
	verifier := newTestBetterAuthVerifier(t, jwks)
	now := time.Now()

	tests := []struct {
		name   string
		change func(*betterAuthTokenClaims)
	}{
		{name: "issuer", change: func(claims *betterAuthTokenClaims) { claims.Issuer = "https://attacker.example" }},
		{name: "audience", change: func(claims *betterAuthTokenClaims) { claims.Audience = jwt.ClaimStrings{"other-api"} }},
		{name: "expiry", change: func(claims *betterAuthTokenClaims) { claims.ExpiresAt = jwt.NewNumericDate(now.Add(-time.Minute)) }},
		{name: "not-before", change: func(claims *betterAuthTokenClaims) { claims.NotBefore = jwt.NewNumericDate(now.Add(time.Hour)) }},
		{name: "missing subject", change: func(claims *betterAuthTokenClaims) { claims.Subject = "" }},
		{name: "missing app user ID", change: func(claims *betterAuthTokenClaims) { claims.AppUserID = "" }},
		{name: "cross-user subject mismatch", change: func(claims *betterAuthTokenClaims) { claims.AppUserID = "another-user" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			claims := validBetterAuthClaims(now, verifier.config.Issuer)
			test.change(&claims)
			if _, err := verifier.verify(context.Background(), signBetterAuthToken(t, testAuthKeyID, privateKey, claims)); err == nil {
				t.Fatal("verify() accepted invalid claims")
			}
		})
	}
}

func TestBetterAuthVerifierRejectsUnknownKey(t *testing.T) {
	publicKey, privateKey := testEd25519Key(t)
	jwks := &testJWKS{}
	jwks.set(testJWKSJSON(t, "known-key", publicKey), http.StatusOK)
	verifier := newTestBetterAuthVerifier(t, jwks)

	_, err := verifier.verify(context.Background(), signBetterAuthToken(t, "unknown-key", privateKey, validBetterAuthClaims(time.Now(), verifier.config.Issuer)))
	if err == nil {
		t.Fatal("verify() accepted a token with an unknown key ID")
	}
}

func TestBetterAuthVerifierRefreshesKeysAfterRotation(t *testing.T) {
	firstPublicKey, _ := testEd25519Key(t)
	secondPublicKey, secondPrivateKey := testEd25519Key(t)
	jwks := &testJWKS{}
	jwks.set(testJWKSJSON(t, "first-key", firstPublicKey), http.StatusOK)
	verifier := newTestBetterAuthVerifier(t, jwks)
	jwks.set(testJWKSJSON(t, "second-key", secondPublicKey), http.StatusOK)

	principal, err := verifier.verify(context.Background(), signBetterAuthToken(t, "second-key", secondPrivateKey, validBetterAuthClaims(time.Now(), verifier.config.Issuer)))
	if err != nil {
		t.Fatalf("verify() after key rotation error = %v", err)
	}
	if principal.AppUserID != "legacy-firebase-uid" {
		t.Fatalf("AppUserID = %q, want canonical ID", principal.AppUserID)
	}
}

func TestRequireAuthenticatedUserReturnsUnavailableWhenJWKSFails(t *testing.T) {
	resetBetterAuthVerifierForTest()
	t.Cleanup(resetBetterAuthVerifierForTest)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	previousTransport := http.DefaultTransport
	http.DefaultTransport = server.Client().Transport
	t.Cleanup(func() { http.DefaultTransport = previousTransport })
	t.Setenv("MATMETRICS_AUTH_JWKS_URL", server.URL)
	t.Setenv("MATMETRICS_AUTH_ISSUER", server.URL)
	t.Setenv("MATMETRICS_AUTH_AUDIENCE", testAuthAudience)
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "false")
	t.Setenv("NODE_ENV", "production")

	_, privateKey := testEd25519Key(t)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	claims := validBetterAuthClaims(time.Now(), server.URL)
	request.Header.Set("Authorization", "Bearer "+signBetterAuthToken(t, testAuthKeyID, privateKey, claims))
	recorder := httptest.NewRecorder()
	if RequireAuthenticatedUser(recorder, request) {
		t.Fatal("authentication passed while the JWKS endpoint was unavailable")
	}
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
}

func TestRequireAuthenticatedUserRejectsUnsupportedAlgorithm(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "false")
	t.Setenv("NODE_ENV", "production")
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "legacy-firebase-uid"})
	signed, err := token.SignedString([]byte("test-only-secret"))
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer "+signed)
	recorder := httptest.NewRecorder()
	if RequireAuthenticatedUser(recorder, request) {
		t.Fatal("authentication accepted an unsupported signing algorithm")
	}
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestBetterAuthConfigRequiresSameOriginIssuerAndJWKS(t *testing.T) {
	t.Setenv("MATMETRICS_AUTH_JWKS_URL", "https://matmetrics.example/api/auth/jwks")
	t.Setenv("MATMETRICS_AUTH_AUDIENCE", testAuthAudience)
	tests := []struct {
		name   string
		issuer string
	}{
		{name: "different origin", issuer: "https://other.example"},
		{name: "issuer with path", issuer: "https://matmetrics.example/not-an-origin"},
		{name: "issuer with query", issuer: "https://matmetrics.example?unexpected=true"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("MATMETRICS_AUTH_ISSUER", test.issuer)
			if _, err := betterAuthConfigFromEnv(); err == nil {
				t.Fatal("betterAuthConfigFromEnv() accepted an unsafe issuer/JWKS configuration")
			}
		})
	}
}

func TestBetterAuthJWKSFetchIsBounded(t *testing.T) {
	publicKey, _ := testEd25519Key(t)
	body := testJWKSJSON(t, testAuthKeyID, publicKey) + strings.Repeat(" ", betterAuthJWKSMaxBytes)
	jwks := &testJWKS{}
	jwks.set(body, http.StatusOK)
	server := httptest.NewTLSServer(http.HandlerFunc(jwks.serve))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	_, err := newBetterAuthVerifier(ctx, betterAuthConfig{JWKSURL: server.URL, Issuer: server.URL, Audience: testAuthAudience}, server.Client().Transport)
	if err == nil {
		t.Fatal("newBetterAuthVerifier() accepted an oversized JWKS response")
	}
}

func TestRequireAuthenticatedUserAcceptsFirebaseAndAttachesCanonicalPrincipal(t *testing.T) {
	resetFirebaseCertState(t)
	t.Setenv("MATMETRICS_AUTH_TEST_MODE", "false")
	t.Setenv("NODE_ENV", "production")
	const projectID = "matmetrics-auth-test"
	privateKey, certPEM := newFirebaseTestCertificate(t)
	certs, err := json.Marshal(map[string]string{"firebase-test-key": certPEM})
	if err != nil {
		t.Fatal(err)
	}
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		response := responseWithBody(http.StatusOK, string(certs))
		response.Header.Set("Cache-Control", "max-age=300")
		return response, nil
	})}
	account, err := json.Marshal(firebaseServiceAccount{ProjectID: projectID, ClientEmail: "test@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("FIREBASE_SERVICE_ACCOUNT_KEY", string(account))

	claims := jwt.MapClaims{
		"aud": projectID,
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Add(-time.Minute).Unix(),
		"iss": "https://securetoken.google.com/" + projectID,
		"sub": "legacy-firebase-uid",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = "firebase-test-key"
	signed, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Authorization", "Bearer "+signed)
	recorder := httptest.NewRecorder()
	if !RequireAuthenticatedUser(recorder, request) {
		t.Fatalf("Firebase authentication failed with status %d: %s", recorder.Code, recorder.Body.String())
	}
	principal, ok := AuthenticatedPrincipalFromContext(request.Context())
	if !ok || principal.Provider != "firebase" || principal.UserID != "legacy-firebase-uid" || principal.AppUserID != principal.UserID {
		t.Fatalf("principal = %#v, ok = %v, want canonical Firebase principal", principal, ok)
	}
}

func newFirebaseTestCertificate(t *testing.T) (*rsa.PrivateKey, string) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(7),
		Subject:      pkix.Name{CommonName: "firebase-test"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &privateKey.PublicKey, privateKey)
	if err != nil {
		t.Fatal(err)
	}
	return privateKey, string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}
