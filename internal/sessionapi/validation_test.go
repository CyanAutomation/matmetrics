package sessionapi

import (
	"fmt"
	"net"
	"strings"
	"testing"

	"matmetrics/internal/model"
)

func validSession(options ...func(*model.Session)) model.Session {
	session := model.Session{
		ID:         "session-1",
		Date:       "2025-01-12",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{"osoto-gari"},
	}

	for _, option := range options {
		option(&session)
	}

	return session
}

func withVideoURL(videoURL string) func(*model.Session) {
	return func(session *model.Session) {
		session.VideoURL = videoURL
	}
}

func withDuration(duration *int) func(*model.Session) {
	return func(session *model.Session) {
		session.Duration = duration
	}
}

func TestValidateSessionRejectsInvalidDateCases(t *testing.T) {
	tests := []struct {
		name string
		date string
	}{
		{name: "invalid month", date: "2025-13-01"},
		{name: "invalid day", date: "2025-02-30"},
		{name: "non leap day", date: "2025-02-29"},
		{name: "malformed format", date: "01/12/2025"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			session := validSession()
			session.Date = tc.date

			err := ValidateSession(session)
			if err == nil {
				t.Fatalf("ValidateSession() error = nil, want non-nil")
			}
			if got, want := err.Error(), "invalid date: must be a real calendar date"; got != want {
				t.Fatalf("ValidateSession() error = %q, want %q", got, want)
			}
		})
	}
}

func TestValidateSessionVideoURLValidation(t *testing.T) {
	tests := []struct {
		name     string
		videoURL string
		wantErr  string
	}{
		{
			name:    "accepts empty video url",
			wantErr: "",
		},
		{
			name:     "rejects invalid url",
			videoURL: "not-a-url",
			wantErr:  "invalid videoUrl: expected a valid absolute URL",
		},
		{
			name:     "rejects unsupported protocol",
			videoURL: "ftp://example.com/video.mp4",
			wantErr:  "invalid videoUrl: protocol must be http or https",
		},
		{
			name:     "accepts valid https url",
			videoURL: "https://example.com/video/123",
			wantErr:  "",
		},
		{
			name:     "accepts valid http url",
			videoURL: "http://example.com/video/123",
			wantErr:  "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			session := validSession(withVideoURL(tc.videoURL))

			err := ValidateSession(session)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("ValidateSession() error = %v, want nil", err)
				}
				return
			}

			if err == nil {
				t.Fatalf("ValidateSession() error = nil, want %q", tc.wantErr)
			}
			if got := err.Error(); got != tc.wantErr {
				t.Fatalf("ValidateSession() error = %q, want %q", got, tc.wantErr)
			}
		})
	}
}

func TestValidateSessionAllowsMissingVideoURL(t *testing.T) {
	session := validSession()

	if err := ValidateSession(session); err != nil {
		t.Fatalf("ValidateSession() error = %v, want nil", err)
	}
}

func TestValidateSessionDurationValidation(t *testing.T) {
	negativeDuration := -1
	zeroDuration := 0
	positiveDuration := 90

	tests := []struct {
		name     string
		duration *int
		wantErr  string
	}{
		{
			name:     "rejects negative duration",
			duration: &negativeDuration,
			wantErr:  "invalid duration: expected a non-negative integer",
		},
		{
			name:     "accepts zero duration",
			duration: &zeroDuration,
			wantErr:  "",
		},
		{
			name:     "accepts positive duration",
			duration: &positiveDuration,
			wantErr:  "",
		},
		{
			name:     "accepts nil duration",
			duration: nil,
			wantErr:  "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			session := validSession(withDuration(tc.duration))

			err := ValidateSession(session)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("ValidateSession() error = %v, want nil", err)
				}
				return
			}

			if err == nil {
				t.Fatalf("ValidateSession() error = nil, want %q", tc.wantErr)
			}
			if got := err.Error(); got != tc.wantErr {
				t.Fatalf("ValidateSession() error = %q, want %q", got, tc.wantErr)
			}
		})
	}
}

func TestValidateSessionRejectsPrivateVideoURLHosts(t *testing.T) {
	blockedHosts := []string{
		"localhost",
		"127.0.0.1",
		"::1",
		"10.0.0.1",
		"172.16.0.1",
		"192.168.1.1",
		"169.254.169.254",
		"fc00::1",
		"fe80::1",
	}

	for _, host := range blockedHosts {
		t.Run(host, func(t *testing.T) {
			session := validSession()
			hostForURL := host
			if strings.Contains(hostForURL, ":") {
				hostForURL = "[" + hostForURL + "]"
			}
			session.VideoURL = fmt.Sprintf("https://%s/video", hostForURL)

			err := ValidateSession(session)
			if err == nil {
				t.Fatalf("ValidateSession() error = nil, want non-nil for host %q", host)
			}
			if got, want := err.Error(), "invalid videoUrl: private or internal network addresses are not allowed"; got != want {
				t.Fatalf("ValidateSession() error = %q, want %q", got, want)
			}
		})
	}
}

func TestValidateSessionRejectsDNSResolvedPrivateVideoURLHost(t *testing.T) {
	originalLookupIP := lookupIP
	t.Cleanup(func() {
		lookupIP = originalLookupIP
	})

	lookupIP = func(host string) ([]net.IP, error) {
		if host == "public.example.test" {
			return []net.IP{net.ParseIP("127.0.0.1")}, nil
		}
		return []net.IP{net.ParseIP("93.184.216.34")}, nil
	}

	session := validSession(withVideoURL("https://public.example.test/video"))
	err := ValidateSession(session)
	if err == nil {
		t.Fatalf("ValidateSession() error = nil, want non-nil for DNS-resolved private host")
	}
	if got, want := err.Error(), "invalid videoUrl: private or internal network addresses are not allowed"; got != want {
		t.Fatalf("ValidateSession() error = %q, want %q", got, want)
	}
}
