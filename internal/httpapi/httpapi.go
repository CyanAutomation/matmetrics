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

type firebaseServiceAccount struct {
	ProjectID string `json:"project_id"`
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

var (
	firebaseCertsCache struct {
		sync.RWMutex
		certs     map[string]string
		expiresAt time.Time
	}
)

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

func RequireAuthenticatedUser(w http.ResponseWriter, r *http.Request) bool {
	token, ok := bearerToken(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Authentication required")
		return false
	}

	if os.Getenv("MATMETRICS_AUTH_TEST_MODE") == "true" {
		return true
	}

	serviceAccount, ok := serviceAccountFromEnv()
	if !ok {
		WriteError(w, http.StatusInternalServerError, "Firebase admin is not configured")
		return false
	}

	if err := verifyFirebaseIDToken(r, token, serviceAccount.ProjectID); err != nil {
		fmt.Printf("Failed to verify Firebase ID token: %v\n", err)
		WriteError(w, http.StatusUnauthorized, "Invalid authentication token")
		return false
	}

	return true
}

func bearerToken(r *http.Request) (string, bool) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if header == "" {
		return "", false
	}

	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return "", false
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", false
	}

	return token, true
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

func verifyFirebaseIDToken(r *http.Request, token, projectID string) error {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return errors.New("token has invalid format")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("failed to decode token header: %w", err)
	}
	var header jwtHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return fmt.Errorf("failed to parse token header: %w", err)
	}
	if header.Alg != "RS256" || header.Kid == "" {
		return errors.New("token header is invalid")
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("failed to decode token claims: %w", err)
	}
	var claims firebaseTokenClaims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return fmt.Errorf("failed to parse token claims: %w", err)
	}

	now := time.Now().Unix()
	expectedIssuer := "https://securetoken.google.com/" + projectID
	if claims.Aud != projectID || claims.Iss != expectedIssuer || claims.Sub == "" {
		return errors.New("token claims are invalid")
	}
	if claims.Exp <= now || claims.Iat > now {
		return errors.New("token timing claims are invalid")
	}

	certs, err := fetchFirebaseCerts(r)
	if err != nil {
		return err
	}
	pemCert, ok := certs[header.Kid]
	if !ok {
		return errors.New("token certificate key not found")
	}

	publicKey, err := parseRSAPublicKeyFromCertPEM(pemCert)
	if err != nil {
		return err
	}

	signingInput := parts[0] + "." + parts[1]
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return fmt.Errorf("failed to decode token signature: %w", err)
	}

	hash := sha256.Sum256([]byte(signingInput))
	if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, hash[:], signature); err != nil {
		return fmt.Errorf("token signature verification failed: %w", err)
	}

	return nil
}

func fetchFirebaseCerts(r *http.Request) (map[string]string, error) {
	firebaseCertsCache.RLock()
	if time.Now().Before(firebaseCertsCache.expiresAt) && len(firebaseCertsCache.certs) > 0 {
		cached := firebaseCertsCache.certs
		firebaseCertsCache.RUnlock()
		return cached, nil
	}
	firebaseCertsCache.RUnlock()

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, firebaseCertsURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Firebase certs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch Firebase certs: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read Firebase certs response: %w", err)
	}

	certs := map[string]string{}
	if err := json.Unmarshal(body, &certs); err != nil {
		return nil, fmt.Errorf("failed to decode Firebase certs: %w", err)
	}

	expiresAt := time.Now().Add(5 * time.Minute)
	if cacheControl := resp.Header.Get("Cache-Control"); cacheControl != "" {
		directives := strings.Split(cacheControl, ",")
		for _, directive := range directives {
			directive = strings.TrimSpace(directive)
			if strings.HasPrefix(directive, "max-age=") {
				seconds, parseErr := strconv.Atoi(strings.TrimPrefix(directive, "max-age="))
				if parseErr == nil {
					expiresAt = time.Now().Add(time.Duration(seconds) * time.Second)
				}
			}
		}
	}

	firebaseCertsCache.Lock()
	firebaseCertsCache.certs = certs
	firebaseCertsCache.expiresAt = expiresAt
	firebaseCertsCache.Unlock()

	return certs, nil
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
