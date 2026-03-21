package storage

import (
	"os"
	"path/filepath"
	"testing"

	"matmetrics/internal/markdown"
	"matmetrics/internal/model"
)

func TestGetSessionFilePathEncodesID(t *testing.T) {
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

	want := filepath.Join("/tmp/data", "2025", "03", "20250314-matmetrics-a%2Fb.md")
	if got != want {
		t.Fatalf("GetSessionFilePath() = %q, want %q", got, want)
	}
}

func TestGetSessionFilePathKeepsSpecialCharacterIDsDistinct(t *testing.T) {
	base := model.Session{
		Date:       "2025-03-14",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{},
	}

	withSlash := base
	withSlash.ID = "a/b"
	withQuestion := base
	withQuestion.ID = "a?b"
	withSpace := base
	withSpace.ID = "a b"

	slashPath, err := GetSessionFilePath("/tmp/data", withSlash)
	if err != nil {
		t.Fatalf("GetSessionFilePath() slash error = %v", err)
	}
	questionPath, err := GetSessionFilePath("/tmp/data", withQuestion)
	if err != nil {
		t.Fatalf("GetSessionFilePath() question error = %v", err)
	}
	spacePath, err := GetSessionFilePath("/tmp/data", withSpace)
	if err != nil {
		t.Fatalf("GetSessionFilePath() space error = %v", err)
	}

	if slashPath == questionPath || slashPath == spacePath || questionPath == spacePath {
		t.Fatalf("expected distinct paths, got slash=%q question=%q space=%q", slashPath, questionPath, spacePath)
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

func TestSessionIDPathSuffixCandidatesIncludesLegacySanitizedFallback(t *testing.T) {
	candidates, err := SessionIDPathSuffixCandidates("a/b")
	if err != nil {
		t.Fatalf("SessionIDPathSuffixCandidates() error = %v", err)
	}

	if len(candidates) != 2 || candidates[0] != "a%2Fb" || candidates[1] != "a-b" {
		t.Fatalf("unexpected candidates: %#v", candidates)
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
