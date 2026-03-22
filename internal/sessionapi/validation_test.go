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
