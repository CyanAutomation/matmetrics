package model

type EffortLevel int

type SessionCategory string

const (
	CategoryTechnical SessionCategory = "Technical"
	CategoryRandori   SessionCategory = "Randori"
	CategoryShiai     SessionCategory = "Shiai"
)

type Session struct {
	ID          string          `json:"id"`
	Date        string          `json:"date"`
	Description string          `json:"description,omitempty"`
	Techniques  []string        `json:"techniques"`
	Effort      EffortLevel     `json:"effort"`
	Category    SessionCategory `json:"category"`
	Notes       string          `json:"notes,omitempty"`
	Duration    *int            `json:"duration,omitempty"`
	VideoURL    string          `json:"videoUrl,omitempty"`
}

type GitHubConfig struct {
	Owner  string `json:"owner"`
	Repo   string `json:"repo"`
	Branch string `json:"branch,omitempty"`
}
