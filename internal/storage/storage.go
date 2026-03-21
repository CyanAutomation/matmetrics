package storage

import (
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"matmetrics/internal/markdown"
	"matmetrics/internal/model"
)

func GetSessionFilePath(dataDir string, session model.Session) (string, error) {
	encodedID, err := EncodedSessionID(session.ID)
	if err != nil {
		return "", err
	}

	parts := strings.Split(session.Date, "-")
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid session date %q", session.Date)
	}

	fileName := fmt.Sprintf("%s%s%s-matmetrics-%s.md", parts[0], parts[1], parts[2], encodedID)
	return filepath.Join(dataDir, parts[0], parts[1], fileName), nil
}

func sanitizeSessionID(sessionID string) string {
	var b strings.Builder
	for _, r := range sessionID {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
			continue
		}
		b.WriteByte('-')
	}
	return b.String()
}

func EncodedSessionID(sessionID string) (string, error) {
	if len(sessionID) > 100 {
		return "", fmt.Errorf("session ID exceeds maximum allowed length of 100 characters")
	}
	return url.PathEscape(sessionID), nil
}

func SessionIDPathSuffixCandidates(sessionID string) ([]string, error) {
	encodedID, err := EncodedSessionID(sessionID)
	if err != nil {
		return nil, err
	}

	candidates := []string{encodedID}
	legacySanitizedID := sanitizeSessionID(sessionID)
	if legacySanitizedID != encodedID {
		candidates = append(candidates, legacySanitizedID)
	}

	return candidates, nil
}

func ListSessions(dataDir string) ([]model.Session, error) {
	sessions := make([]model.Session, 0)

	err := filepath.WalkDir(dataDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) {
				return nil
			}
			return walkErr
		}
		if entry.IsDir() || filepath.Ext(path) != ".md" {
			return nil
		}

		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		session, err := markdown.MarkdownToSession(string(raw))
		if err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}

		sessions = append(sessions, session)
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return []model.Session{}, nil
		}
		return nil, err
	}

	slices.SortFunc(sessions, func(a model.Session, b model.Session) int {
		switch {
		case a.Date > b.Date:
			return -1
		case a.Date < b.Date:
			return 1
		default:
			return 0
		}
	})

	return sessions, nil
}
