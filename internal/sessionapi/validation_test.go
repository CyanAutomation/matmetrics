package sessionapi

import (
	"testing"

	"matmetrics/internal/model"
)

func validSession() model.Session {
	return model.Session{
		ID:         "session-1",
		Date:       "2025-01-12",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{"osoto-gari"},
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
			session := validSession()
			session.VideoURL = tc.videoURL

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
