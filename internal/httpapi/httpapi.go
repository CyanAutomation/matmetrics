package httpapi

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const firebaseCertsURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

const (
	defaultFirebaseCertLifetime = 5 * time.Minute
	minFirebaseCertLifetime     = time.Minute
	maxFirebaseCertLifetime     = 24 * time.Hour
	firebaseCertStaleGrace      = time.Hour
)

type firebaseServiceAccount struct {
	ProjectID   string `json:"project_id"`
	ClientEmail string `json:"client_email"`
}

type jwtHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

type firebaseTokenClaims struct {
	Aud string `json:"aud"`
	Exp int64  `json:"exp"`
	Iat int64  `json:"iat"`
	Iss string `json:"iss"`
	Sub string `json:"sub"`
}

var firebaseCertsCache struct {
	sync.RWMutex
	certs      map[string]string
	freshUntil time.Time
	staleUntil time.Time
}

// firebaseCertsRefresh is deliberately separate from firebaseCertsCache. This
// keeps refresh coordination from holding the cache lock during network I/O.
var firebaseCertsRefresh struct {
	sync.Mutex
	done chan struct{}
}

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

func DecodeJSON(r *http.Request, target any) error {
	if r.Body == nil {
		return errors.New("request body is required")
	}
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(target)
}

func MethodNotAllowed(w http.ResponseWriter, allowed string) {
	w.Header().Set("Allow", allowed)
	WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
}

// ValidateFirebaseConfig checks that the FIREBASE_SERVICE_ACCOUNT_KEY environment
// variable is set and contains valid project_id and client_email fields.
// Call this at application startup to fail fast.
func ValidateFirebaseConfig() error {
	raw := strings.TrimSpace(os.Getenv("FIREBASE_SERVICE_ACCOUNT_KEY"))
	if raw == "" {
		return errors.New("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set")
	}

	var account firebaseServiceAccount
	if err := json.Unmarshal([]byte(raw), &account); err != nil {
		return fmt.Errorf("FIREBASE_SERVICE_ACCOUNT_KEY contains malformed JSON: %w", err)
	}

	if strings.TrimSpace(account.ProjectID) == "" {
		return errors.New("FIREBASE_SERVICE_ACCOUNT_KEY is missing project_id")
	}
	if strings.TrimSpace(account.ClientEmail) == "" {
		return errors.New("FIREBASE_SERVICE_ACCOUNT_KEY is missing client_email")
	}

	return nil
}

func serviceAccountFromEnv() (firebaseServiceAccount, bool) {
	raw := strings.TrimSpace(os.Getenv("FIREBASE_SERVICE_ACCOUNT_KEY"))
	if raw == "" {
		return firebaseServiceAccount{}, false
	}

	var account firebaseServiceAccount
	if err := json.Unmarshal([]byte(raw), &account); err != nil {
		return firebaseServiceAccount{}, false
	}

	if strings.TrimSpace(account.ProjectID) == "" {
		return firebaseServiceAccount{}, false
	}

	return account, true
}

func verifyFirebaseIDToken(r *http.Request, token, projectID string) (AuthenticatedPrincipal, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return AuthenticatedPrincipal{}, errors.New("token has invalid format")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return AuthenticatedPrincipal{}, fmt.Errorf("failed to decode token header: %w", err)
	}
	var header jwtHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return AuthenticatedPrincipal{}, fmt.Errorf("failed to parse token header: %w", err)
	}
	if header.Alg != "RS256" || header.Kid == "" {
		return AuthenticatedPrincipal{}, errors.New("token header is invalid")
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return AuthenticatedPrincipal{}, fmt.Errorf("failed to decode token claims: %w", err)
	}
	var claims firebaseTokenClaims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return AuthenticatedPrincipal{}, fmt.Errorf("failed to parse token claims: %w", err)
	}

	now := time.Now().Unix()
	expectedIssuer := "https://securetoken.google.com/" + projectID
	if claims.Aud != projectID || claims.Iss != expectedIssuer || claims.Sub == "" || len(claims.Sub) > 128 {
		return AuthenticatedPrincipal{}, errors.New("token claims are invalid")
	}
	if claims.Exp <= now || claims.Iat > now {
		return AuthenticatedPrincipal{}, errors.New("token timing claims are invalid")
	}

	certs, err := fetchFirebaseCerts(r)
	if err != nil {
		return AuthenticatedPrincipal{}, fmt.Errorf("%w: Firebase signing keys could not be fetched", errAuthVerificationUnavailable)
	}
	pemCert, ok := certs[header.Kid]
	if !ok {
		return AuthenticatedPrincipal{}, errors.New("token certificate key not found")
	}

	publicKey, err := parseRSAPublicKeyFromCertPEM(pemCert)
	if err != nil {
		return AuthenticatedPrincipal{}, err
	}

	signingInput := parts[0] + "." + parts[1]
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return AuthenticatedPrincipal{}, fmt.Errorf("failed to decode token signature: %w", err)
	}

	hash := sha256.Sum256([]byte(signingInput))
	if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, hash[:], signature); err != nil {
		return AuthenticatedPrincipal{}, fmt.Errorf("token signature verification failed: %w", err)
	}

	return AuthenticatedPrincipal{
		Provider:  "firebase",
		UserID:    claims.Sub,
		AppUserID: claims.Sub,
	}, nil
}

func fetchFirebaseCerts(r *http.Request) (map[string]string, error) {
	now := time.Now()
	if cached, fresh, _ := cachedFirebaseCerts(now); fresh {
		return cached, nil
	}

	firebaseCertsRefresh.Lock()
	if done := firebaseCertsRefresh.done; done != nil {
		firebaseCertsRefresh.Unlock()
		if cached, _, stale := cachedFirebaseCerts(now); stale {
			return cached, nil
		}
		select {
		case <-done:
			if cached, fresh, stale := cachedFirebaseCerts(time.Now()); fresh || stale {
				return cached, nil
			}
			return nil, errors.New("failed to refresh Firebase certs")
		case <-r.Context().Done():
			return nil, r.Context().Err()
		}
	}
	if cached, fresh, _ := cachedFirebaseCerts(time.Now()); fresh {
		firebaseCertsRefresh.Unlock()
		return cached, nil
	}
	done := make(chan struct{})
	firebaseCertsRefresh.done = done
	firebaseCertsRefresh.Unlock()

	certs, lifetime, err := requestFirebaseCerts(r)
	if err == nil {
		refreshedAt := time.Now()
		firebaseCertsCache.Lock()
		firebaseCertsCache.certs = cloneCerts(certs)
		firebaseCertsCache.freshUntil = refreshedAt.Add(lifetime)
		firebaseCertsCache.staleUntil = refreshedAt.Add(lifetime + firebaseCertStaleGrace)
		firebaseCertsCache.Unlock()
	}

	firebaseCertsRefresh.Lock()
	firebaseCertsRefresh.done = nil
	close(done)
	firebaseCertsRefresh.Unlock()

	if err != nil {
		if cached, _, stale := cachedFirebaseCerts(time.Now()); stale {
			return cached, nil
		}
		return nil, err
	}
	return cloneCerts(certs), nil
}

func cachedFirebaseCerts(now time.Time) (map[string]string, bool, bool) {
	firebaseCertsCache.RLock()
	defer firebaseCertsCache.RUnlock()

	if len(firebaseCertsCache.certs) == 0 {
		return nil, false, false
	}
	return cloneCerts(firebaseCertsCache.certs), now.Before(firebaseCertsCache.freshUntil), now.Before(firebaseCertsCache.staleUntil)
}

func cloneCerts(certs map[string]string) map[string]string {
	cloned := make(map[string]string, len(certs))
	for key, cert := range certs {
		cloned[key] = cert
	}
	return cloned
}

func requestFirebaseCerts(r *http.Request) (map[string]string, time.Duration, error) {

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, firebaseCertsURL, nil)
	if err != nil {
		return nil, 0, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch Firebase certs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("failed to fetch Firebase certs: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read Firebase certs response: %w", err)
	}

	certs := map[string]string{}
	if err := json.Unmarshal(body, &certs); err != nil {
		return nil, 0, fmt.Errorf("failed to decode Firebase certs: %w", err)
	}
	if len(certs) == 0 {
		return nil, 0, errors.New("Firebase certs response was empty")
	}
	for key, cert := range certs {
		if strings.TrimSpace(key) == "" {
			return nil, 0, errors.New("Firebase certs response contains an empty key ID")
		}
		if _, err := parseRSAPublicKeyFromCertPEM(cert); err != nil {
			return nil, 0, fmt.Errorf("Firebase certs response contains an invalid certificate for %q: %w", key, err)
		}
	}

	return certs, firebaseCertLifetime(resp.Header.Get("Cache-Control")), nil
}

func firebaseCertLifetime(cacheControl string) time.Duration {
	lifetime := defaultFirebaseCertLifetime
	for _, directive := range strings.Split(cacheControl, ",") {
		name, value, found := strings.Cut(strings.TrimSpace(directive), "=")
		if !found || !strings.EqualFold(name, "max-age") {
			continue
		}
		seconds, err := strconv.ParseInt(strings.Trim(strings.TrimSpace(value), `"`), 10, 64)
		if err == nil && seconds > 0 && seconds <= int64(maxFirebaseCertLifetime/time.Second) {
			lifetime = time.Duration(seconds) * time.Second
		} else if err == nil && seconds > int64(maxFirebaseCertLifetime/time.Second) {
			lifetime = maxFirebaseCertLifetime
		} else {
			lifetime = minFirebaseCertLifetime
		}
		break
	}
	if lifetime < minFirebaseCertLifetime {
		return minFirebaseCertLifetime
	}
	return lifetime
}

func parseRSAPublicKeyFromCertPEM(certPEM string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil {
		return nil, errors.New("failed to decode certificate PEM")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	publicKey, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("certificate public key is not RSA")
	}
	return publicKey, nil
}
