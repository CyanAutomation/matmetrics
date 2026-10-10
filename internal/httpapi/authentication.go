package httpapi

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/time/rate"
)

const (
	betterAuthJWKSRequestTimeout = 5 * time.Second
	betterAuthJWKSRefreshEvery   = 15 * time.Minute
	betterAuthJWKSMaxBytes       = 256 * 1024
)

var (
	errAuthConfiguration           = errors.New("authentication is not configured")
	errAuthVerificationUnavailable = errors.New("authentication verification is temporarily unavailable")
)

// AuthenticatedPrincipal identifies an authenticated account without binding
// downstream code to the token provider used for this request.
type AuthenticatedPrincipal struct {
	Provider  string
	UserID    string
	AppUserID string
}

type principalContextKey struct{}

// AuthenticatedPrincipalFromContext returns the canonical principal attached by
// RequireAuthenticatedUser. Both UserID and AppUserID identify the same
// MatMetrics account for Firebase and Better Auth tokens.
func AuthenticatedPrincipalFromContext(ctx context.Context) (AuthenticatedPrincipal, bool) {
	principal, ok := ctx.Value(principalContextKey{}).(AuthenticatedPrincipal)
	return principal, ok
}

// RequireAuthenticatedUser accepts migration-era Firebase ID tokens and
// Better Auth service JWTs. It keeps the existing handler API while attaching a
// provider-neutral principal to the request context for authorization logic.
func RequireAuthenticatedUser(w http.ResponseWriter, r *http.Request) bool {
	token, ok := bearerToken(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Authentication required")
		return false
	}

	if os.Getenv("MATMETRICS_AUTH_TEST_MODE") == "true" && os.Getenv("NODE_ENV") == "test" {
		if token != "test-token" {
			WriteError(w, http.StatusUnauthorized, "Invalid test token")
			return false
		}
		attachPrincipal(r, AuthenticatedPrincipal{
			Provider:  "test",
			UserID:    "test-user",
			AppUserID: "test-user",
		})
		return true
	}

	algorithm, err := tokenAlgorithm(token)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "Invalid authentication token")
		return false
	}

	var principal AuthenticatedPrincipal
	switch algorithm {
	case jwt.SigningMethodRS256.Alg():
		serviceAccount, configured := serviceAccountFromEnv()
		if !configured {
			writeAuthFailure(w, errAuthConfiguration)
			return false
		}
		principal, err = verifyFirebaseIDToken(r, token, serviceAccount.ProjectID)
	case jwt.SigningMethodEdDSA.Alg():
		var verifier *betterAuthVerifier
		verifier, err = betterAuthVerifierFromEnv()
		if err == nil {
			principal, err = verifier.verify(r.Context(), token)
		}
	default:
		err = errors.New("unsupported signing algorithm")
	}

	if err != nil {
		writeAuthFailure(w, err)
		return false
	}

	attachPrincipal(r, principal)
	return true
}

func attachPrincipal(r *http.Request, principal AuthenticatedPrincipal) {
	*r = *r.WithContext(context.WithValue(r.Context(), principalContextKey{}, principal))
}

func writeAuthFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errAuthConfiguration):
		WriteError(w, http.StatusInternalServerError, "Authentication is not configured")
	case errors.Is(err, errAuthVerificationUnavailable):
		WriteError(w, http.StatusServiceUnavailable, "Authentication service temporarily unavailable")
	default:
		WriteError(w, http.StatusUnauthorized, "Invalid authentication token")
	}
}

func bearerToken(r *http.Request) (string, bool) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if header == "" {
		return "", false
	}

	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", false
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", false
	}

	return token, true
}

func tokenAlgorithm(raw string) (string, error) {
	parsed, _, err := jwt.NewParser().ParseUnverified(raw, jwt.MapClaims{})
	if err != nil {
		return "", err
	}
	if parsed.Method == nil {
		return "", errors.New("token signing algorithm is missing")
	}
	return parsed.Method.Alg(), nil
}

type betterAuthConfig struct {
	JWKSURL  string
	Issuer   string
	Audience string
}

type betterAuthTokenClaims struct {
	AppUserID string `json:"appUserId"`
	jwt.RegisteredClaims
}

type betterAuthVerifier struct {
	config  betterAuthConfig
	keyfunc keyfunc.Keyfunc
	health  *jwksHealth
}

type jwksHealth struct {
	mu          sync.RWMutex
	lastSuccess time.Time
	lastFailure time.Time
}

func (h *jwksHealth) markSuccess() {
	h.mu.Lock()
	h.lastSuccess = time.Now()
	h.mu.Unlock()
}

func (h *jwksHealth) markFailure() {
	h.mu.Lock()
	h.lastFailure = time.Now()
	h.mu.Unlock()
}

func (h *jwksHealth) unavailableAfterLastSuccess() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.lastFailure.After(h.lastSuccess)
}

var betterAuthVerifierCache struct {
	sync.Mutex
	config   betterAuthConfig
	verifier *betterAuthVerifier
	cancel   context.CancelFunc
}

func betterAuthVerifierFromEnv() (*betterAuthVerifier, error) {
	config, err := betterAuthConfigFromEnv()
	if err != nil {
		return nil, err
	}

	betterAuthVerifierCache.Lock()
	defer betterAuthVerifierCache.Unlock()
	if betterAuthVerifierCache.verifier != nil && betterAuthVerifierCache.config == config {
		return betterAuthVerifierCache.verifier, nil
	}
	if betterAuthVerifierCache.cancel != nil {
		betterAuthVerifierCache.cancel()
		betterAuthVerifierCache.cancel = nil
		betterAuthVerifierCache.verifier = nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	verifier, err := newBetterAuthVerifier(ctx, config, http.DefaultTransport)
	if err != nil {
		cancel()
		return nil, err
	}
	betterAuthVerifierCache.config = config
	betterAuthVerifierCache.verifier = verifier
	betterAuthVerifierCache.cancel = cancel
	return verifier, nil
}

func betterAuthConfigFromEnv() (betterAuthConfig, error) {
	config := betterAuthConfig{
		JWKSURL:  strings.TrimSpace(os.Getenv("MATMETRICS_AUTH_JWKS_URL")),
		Issuer:   strings.TrimSpace(os.Getenv("MATMETRICS_AUTH_ISSUER")),
		Audience: strings.TrimSpace(os.Getenv("MATMETRICS_AUTH_AUDIENCE")),
	}
	if config.JWKSURL == "" || config.Issuer == "" || config.Audience == "" {
		return betterAuthConfig{}, errAuthConfiguration
	}
	if err := validateServiceURL(config.JWKSURL, true); err != nil {
		return betterAuthConfig{}, fmt.Errorf("%w: invalid Better Auth JWKS URL", errAuthConfiguration)
	}
	if err := validateServiceURL(config.Issuer, false); err != nil {
		return betterAuthConfig{}, fmt.Errorf("%w: invalid Better Auth issuer", errAuthConfiguration)
	}
	if !sameServiceOrigin(config.JWKSURL, config.Issuer) {
		return betterAuthConfig{}, fmt.Errorf("%w: Better Auth JWKS URL must share the issuer origin", errAuthConfiguration)
	}
	return config, nil
}

func sameServiceOrigin(first, second string) bool {
	firstURL, firstErr := url.Parse(first)
	secondURL, secondErr := url.Parse(second)
	return firstErr == nil && secondErr == nil &&
		strings.EqualFold(firstURL.Scheme, secondURL.Scheme) &&
		strings.EqualFold(firstURL.Host, secondURL.Host)
}

func validateServiceURL(raw string, allowPath bool) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return errors.New("URL is not a valid public service URL")
	}
	if !allowPath && parsed.Path != "" && parsed.Path != "/" {
		return errors.New("issuer must be an origin")
	}
	if parsed.Scheme == "https" {
		return nil
	}
	if parsed.Scheme != "http" || !isLoopbackHost(parsed.Hostname()) {
		return errors.New("service URL must use HTTPS")
	}
	return nil
}

func isLoopbackHost(host string) bool {
	switch strings.ToLower(host) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}

func newBetterAuthVerifier(ctx context.Context, config betterAuthConfig, transport http.RoundTripper) (*betterAuthVerifier, error) {
	if err := validateServiceURL(config.JWKSURL, true); err != nil {
		return nil, fmt.Errorf("%w: invalid Better Auth JWKS URL", errAuthConfiguration)
	}
	if config.Issuer == "" || config.Audience == "" {
		return nil, errAuthConfiguration
	}
	if err := validateServiceURL(config.Issuer, false); err != nil || !sameServiceOrigin(config.JWKSURL, config.Issuer) {
		return nil, fmt.Errorf("%w: Better Auth JWKS URL and issuer must share a valid origin", errAuthConfiguration)
	}
	parsedURL, err := url.Parse(config.JWKSURL)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid Better Auth JWKS URL", errAuthConfiguration)
	}
	if transport == nil {
		transport = http.DefaultTransport
	}
	health := &jwksHealth{}
	client := &http.Client{
		Transport: &boundedJWKSRoundTripper{base: transport, health: health},
		Timeout:   betterAuthJWKSRequestTimeout,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 3 || request.URL.Scheme != parsedURL.Scheme || !strings.EqualFold(request.URL.Host, parsedURL.Host) {
				return errors.New("JWKS endpoint redirected outside its configured origin")
			}
			return nil
		},
	}
	noErrorOnFirstFailure := false
	keys, err := keyfunc.NewDefaultOverrideCtx(ctx, []string{config.JWKSURL}, keyfunc.Override{
		Client:                    client,
		HTTPTimeout:               betterAuthJWKSRequestTimeout,
		NoErrorReturnFirstHTTPReq: &noErrorOnFirstFailure,
		RefreshInterval:           betterAuthJWKSRefreshEvery,
		RefreshUnknownKID:         rate.NewLimiter(rate.Every(time.Minute), 1),
		RefreshErrorHandlerFunc: func(string) func(context.Context, error) {
			return func(ctx context.Context, err error) {
				health.markFailure()
				slog.Default().ErrorContext(ctx, "Better Auth JWKS refresh failed", "error_type", fmt.Sprintf("%T", err))
			}
		},
	})
	if err != nil {
		slog.Default().Error("Better Auth JWKS initialization failed", "error_type", fmt.Sprintf("%T", err))
		return nil, fmt.Errorf("%w: Better Auth signing keys could not be loaded", errAuthVerificationUnavailable)
	}
	return &betterAuthVerifier{config: config, keyfunc: keys, health: health}, nil
}

func (v *betterAuthVerifier) verify(ctx context.Context, raw string) (AuthenticatedPrincipal, error) {
	claims := &betterAuthTokenClaims{}
	verificationContext, cancel := context.WithTimeout(ctx, betterAuthJWKSRequestTimeout)
	defer cancel()
	token, err := jwt.ParseWithClaims(raw, claims, v.keyfunc.KeyfuncCtx(verificationContext),
		jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
		jwt.WithIssuer(v.config.Issuer),
		jwt.WithAudience(v.config.Audience),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		if errors.Is(err, keyfunc.ErrKeyfunc) && v.health.unavailableAfterLastSuccess() {
			return AuthenticatedPrincipal{}, fmt.Errorf("%w: Better Auth signing keys are unavailable", errAuthVerificationUnavailable)
		}
		return AuthenticatedPrincipal{}, err
	}
	if token == nil || !token.Valid || claims.Subject == "" || len(claims.Subject) > 128 || claims.AppUserID == "" || len(claims.AppUserID) > 128 || claims.Subject != claims.AppUserID {
		return AuthenticatedPrincipal{}, errors.New("Better Auth token canonical identity is invalid")
	}
	return AuthenticatedPrincipal{
		Provider:  "better-auth",
		UserID:    claims.Subject,
		AppUserID: claims.AppUserID,
	}, nil
}

type boundedJWKSRoundTripper struct {
	base   http.RoundTripper
	health *jwksHealth
}

func (t *boundedJWKSRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	if request.URL.Scheme != "https" && !(request.URL.Scheme == "http" && isLoopbackHost(request.URL.Hostname())) {
		t.health.markFailure()
		return nil, errors.New("JWKS request must use HTTPS")
	}
	response, err := t.base.RoundTrip(request)
	if err != nil {
		t.health.markFailure()
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		t.health.markFailure()
		return response, nil
	}
	response.Body = &boundedJWKSResponseBody{source: response.Body, health: t.health}
	return response, nil
}

type boundedJWKSResponseBody struct {
	source  io.ReadCloser
	health  *jwksHealth
	reader  *bytes.Reader
	loaded  bool
	loadErr error
}

func (b *boundedJWKSResponseBody) Read(p []byte) (int, error) {
	if !b.loaded {
		b.loaded = true
		payload, err := io.ReadAll(io.LimitReader(b.source, betterAuthJWKSMaxBytes+1))
		if err != nil {
			b.loadErr = err
			b.health.markFailure()
		} else if len(payload) > betterAuthJWKSMaxBytes {
			b.loadErr = errors.New("JWKS response exceeds size limit")
			b.health.markFailure()
		} else {
			b.reader = bytes.NewReader(payload)
			b.health.markSuccess()
		}
	}
	if b.loadErr != nil {
		return 0, b.loadErr
	}
	return b.reader.Read(p)
}

func (b *boundedJWKSResponseBody) Close() error {
	return b.source.Close()
}

func resetBetterAuthVerifierForTest() {
	betterAuthVerifierCache.Lock()
	defer betterAuthVerifierCache.Unlock()
	if betterAuthVerifierCache.cancel != nil {
		betterAuthVerifierCache.cancel()
	}
	betterAuthVerifierCache.config = betterAuthConfig{}
	betterAuthVerifierCache.verifier = nil
	betterAuthVerifierCache.cancel = nil
}
