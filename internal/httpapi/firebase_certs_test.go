package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func resetFirebaseCertState(t *testing.T) {
	t.Helper()
	firebaseCertsCache.Lock()
	firebaseCertsCache.certs = nil
	firebaseCertsCache.freshUntil = time.Time{}
	firebaseCertsCache.staleUntil = time.Time{}
	firebaseCertsCache.Unlock()
	firebaseCertsRefresh.Lock()
	firebaseCertsRefresh.done = nil
	firebaseCertsRefresh.Unlock()

	previousClient := http.DefaultClient
	t.Cleanup(func() {
		http.DefaultClient = previousClient
	})
}

func testCertificate(t *testing.T) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "firebase-test"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

func responseWithBody(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       ioNopCloser{Reader: strings.NewReader(body)},
	}
}

type ioNopCloser struct{ *strings.Reader }

func (ioNopCloser) Close() error { return nil }

func TestFetchFirebaseCertsCoalescesConcurrentRefreshes(t *testing.T) {
	resetFirebaseCertState(t)
	cert := testCertificate(t)
	body, _ := json.Marshal(map[string]string{"test-key": cert})
	started := make(chan struct{})
	release := make(chan struct{})
	var requests atomic.Int32
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		if requests.Add(1) == 1 {
			close(started)
		}
		<-release
		response := responseWithBody(http.StatusOK, string(body))
		response.Header.Set("Cache-Control", "max-age=300")
		return response, nil
	})}

	const callers = 12
	results := make(chan error, callers)
	var ready sync.WaitGroup
	ready.Add(callers)
	for range callers {
		go func() {
			ready.Done()
			_, err := fetchFirebaseCerts(httptest.NewRequest(http.MethodGet, "/", nil))
			results <- err
		}()
	}
	ready.Wait()
	<-started
	close(release)
	for range callers {
		if err := <-results; err != nil {
			t.Fatalf("fetchFirebaseCerts() error = %v", err)
		}
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("network requests = %d, want 1", got)
	}
}

func TestFetchFirebaseCertsUsesStaleCacheWhenRefreshFails(t *testing.T) {
	resetFirebaseCertState(t)
	cert := testCertificate(t)
	firebaseCertsCache.Lock()
	firebaseCertsCache.certs = map[string]string{"old-key": cert}
	firebaseCertsCache.freshUntil = time.Now().Add(-time.Minute)
	firebaseCertsCache.staleUntil = time.Now().Add(time.Minute)
	firebaseCertsCache.Unlock()
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("upstream unavailable")
	})}

	certs, err := fetchFirebaseCerts(httptest.NewRequest(http.MethodGet, "/", nil))
	if err != nil {
		t.Fatalf("fetchFirebaseCerts() error = %v", err)
	}
	if certs["old-key"] != cert {
		t.Fatal("fetchFirebaseCerts() did not return the stale certificate")
	}
}

func TestFetchFirebaseCertsFailsAfterStaleCacheExpires(t *testing.T) {
	resetFirebaseCertState(t)
	firebaseCertsCache.Lock()
	firebaseCertsCache.certs = map[string]string{"old-key": testCertificate(t)}
	firebaseCertsCache.freshUntil = time.Now().Add(-2 * time.Minute)
	firebaseCertsCache.staleUntil = time.Now().Add(-time.Minute)
	firebaseCertsCache.Unlock()
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("upstream unavailable")
	})}

	_, err := fetchFirebaseCerts(httptest.NewRequest(http.MethodGet, "/", nil).WithContext(context.Background()))
	if err == nil {
		t.Fatal("fetchFirebaseCerts() error = nil, want refresh failure")
	}
}

func TestFetchFirebaseCertsDoesNotReplaceCacheWithMalformedResponse(t *testing.T) {
	resetFirebaseCertState(t)
	cert := testCertificate(t)
	firebaseCertsCache.Lock()
	firebaseCertsCache.certs = map[string]string{"old-key": cert}
	firebaseCertsCache.freshUntil = time.Now().Add(-time.Minute)
	firebaseCertsCache.staleUntil = time.Now().Add(time.Minute)
	firebaseCertsCache.Unlock()
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return responseWithBody(http.StatusOK, `{"new-key":"not a certificate"}`), nil
	})}

	certs, err := fetchFirebaseCerts(httptest.NewRequest(http.MethodGet, "/", nil))
	if err != nil {
		t.Fatalf("fetchFirebaseCerts() error = %v", err)
	}
	if certs["old-key"] != cert || certs["new-key"] != "" {
		t.Fatalf("cache was replaced by malformed response: %#v", certs)
	}
}

func TestFirebaseCertLifetimeBoundsMaxAge(t *testing.T) {
	tests := []struct {
		cacheControl string
		want         time.Duration
	}{
		{"public, max-age=600", 10 * time.Minute},
		{"max-age=0", minFirebaseCertLifetime},
		{"max-age=-10", minFirebaseCertLifetime},
		{"max-age=999999999", maxFirebaseCertLifetime},
		{"max-age=invalid", minFirebaseCertLifetime},
		{"public", defaultFirebaseCertLifetime},
	}
	for _, test := range tests {
		t.Run(test.cacheControl, func(t *testing.T) {
			if got := firebaseCertLifetime(test.cacheControl); got != test.want {
				t.Fatalf("firebaseCertLifetime(%q) = %v, want %v", test.cacheControl, got, test.want)
			}
		})
	}
}
