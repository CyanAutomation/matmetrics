package storage

import (
	"os"
	"path/filepath"
	"testing"

	"matmetrics/go/internal/markdown"
	"matmetrics/go/internal/model"
)

func TestGetSessionFilePathSanitizesID(t *testing.T) {
	session := model.Session{
		ID:         "a/b",
		Date:       "2025-03-14",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{},
	}

	got, err := GetSessionFilePath("/tmp/data", session)
	if err != nil {
		t.Fatalf("GetSessionFilePath() error = %v", err)
	}

	want := filepath.Join("/tmp/data", "2025", "03", "20250314-matmetrics-a-b.md")
	if got != want {
		t.Fatalf("GetSessionFilePath() = %q, want %q", got, want)
	}
}

func TestEncodedSessionIDMatchesTypeScriptBehavior(t *testing.T) {
	a, err := EncodedSessionID("a/b")
	if err != nil {
		t.Fatalf("EncodedSessionID() error = %v", err)
	}
	b, err := EncodedSessionID("a?b")
	if err != nil {
		t.Fatalf("EncodedSessionID() error = %v", err)
	}

	if a != "a%2Fb" || b != "a%3Fb" || a == b {
		t.Fatalf("unexpected encoded values: %q %q", a, b)
	}
}

func TestListSessionsSortsNewestFirst(t *testing.T) {
	dataDir := t.TempDir()
	writeSessionFile(t, dataDir, model.Session{
		ID:         "older",
		Date:       "2025-01-10",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{"uchi-mata"},
	})
	writeSessionFile(t, dataDir, model.Session{
		ID:         "newer",
		Date:       "2025-02-12",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{"tai-otoshi"},
	})

	sessions, err := ListSessions(dataDir)
	if err != nil {
		t.Fatalf("ListSessions() error = %v", err)
	}

	if len(sessions) != 2 || sessions[0].ID != "newer" || sessions[1].ID != "older" {
		t.Fatalf("unexpected session order: %#v", sessions)
	}
}

func writeSessionFile(t *testing.T, dataDir string, session model.Session) {
	t.Helper()

	path, err := GetSessionFilePath(dataDir, session)
	if err != nil {
		t.Fatalf("GetSessionFilePath() error = %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	markdownValue, err := markdown.SessionToMarkdown(session)
	if err != nil {
		t.Fatalf("SessionToMarkdown() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(markdownValue), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}
