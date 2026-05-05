package sessionapi

import (
	"encoding/json"
	"os"
	"testing"

	"matmetrics/internal/model"
)

type fixture struct {
	Name    string         `json:"name"`
	Session map[string]any `json:"session"`
	Error   string         `json:"error"`
}

func TestValidateSessionParityFixtures(t *testing.T) {
	data, err := os.ReadFile("../../testdata/validation/session-validation-fixtures.json")
	if err != nil { t.Fatal(err) }
	var fixtures []fixture
	if err := json.Unmarshal(data, &fixtures); err != nil { t.Fatal(err) }
	for _, tc := range fixtures {
		t.Run(tc.Name, func(t *testing.T) {
			b, _ := json.Marshal(tc.Session)
			var s model.Session
			_ = json.Unmarshal(b, &s)
			err := ValidateSession(s)
			got := ""
			if err != nil { got = err.Error() }
			if got != tc.Error { t.Fatalf("got %q want %q", got, tc.Error) }
		})
	}
}
