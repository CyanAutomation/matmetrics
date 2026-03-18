package markdown

import (
	"strings"
	"testing"

	"matmetrics/internal/model"
)

func TestRoundTripSessionMarkdown(t *testing.T) {
	duration := 90
	session := model.Session{
		ID:          "edge-roundtrip",
		Date:        "2026-03-17",
		Effort:      4,
		Category:    model.CategoryTechnical,
		Techniques:  []string{"Uchi mata", "Tai otoshi"},
		Description: "Roundtrip description with Z marker",
		Notes:       "Roundtrip notes ending at file end Z",
		Duration:    &duration,
	}

	rendered, err := SessionToMarkdown(session)
	if err != nil {
		t.Fatalf("SessionToMarkdown() error = %v", err)
	}

	parsed, err := MarkdownToSession(rendered)
	if err != nil {
		t.Fatalf("MarkdownToSession() error = %v", err)
	}

	if parsed.ID != session.ID || parsed.Date != session.Date || parsed.Description != session.Description || parsed.Notes != session.Notes {
		t.Fatalf("roundtrip mismatch: %#v", parsed)
	}
	if len(parsed.Techniques) != 2 || parsed.Techniques[0] != "Uchi mata" || parsed.Techniques[1] != "Tai otoshi" {
		t.Fatalf("unexpected techniques: %#v", parsed.Techniques)
	}
	if parsed.Duration == nil || *parsed.Duration != 90 {
		t.Fatalf("unexpected duration: %#v", parsed.Duration)
	}
}

func TestMarkdownParserHandlesEndOfFileWithoutTrailingNewline(t *testing.T) {
	input := `---
id: "edge-1"
date: "2026-03-16"
effort: 3
category: "Technical"
---

# March 16, 2026 – Judo Session

## Techniques Practiced
- O soto gari

## Session Description

Includes the letter Z in the middle of content.

## Notes

Finishes at file end with Z`

	parsed, err := MarkdownToSession(input)
	if err != nil {
		t.Fatalf("MarkdownToSession() error = %v", err)
	}

	if parsed.Notes != "Finishes at file end with Z" {
		t.Fatalf("unexpected notes: %q", parsed.Notes)
	}
	if parsed.Description != "Includes the letter Z in the middle of content." {
		t.Fatalf("unexpected description: %q", parsed.Description)
	}
}

func TestMarkdownOutputUsesExpectedHeadings(t *testing.T) {
	session := model.Session{
		ID:         "session-1",
		Date:       "2026-03-17",
		Effort:     3,
		Category:   model.CategoryTechnical,
		Techniques: []string{},
	}

	rendered, err := SessionToMarkdown(session)
	if err != nil {
		t.Fatalf("SessionToMarkdown() error = %v", err)
	}

	titleIndex := strings.Index(rendered, "# March 17, 2026 – Judo Session")
	techniquesHeadingIndex := strings.Index(rendered, "## Techniques Practiced")
	noneRecordedIndex := strings.Index(rendered, "- (none recorded)")

	if titleIndex < 0 || techniquesHeadingIndex < 0 || noneRecordedIndex < 0 {
		t.Fatalf("rendered markdown is missing required sections: %q", rendered)
	}

	if !(titleIndex < techniquesHeadingIndex && techniquesHeadingIndex < noneRecordedIndex) {
		t.Fatalf("unexpected section order in rendered markdown: %q", rendered)
	}
}

func TestMarkdownToSessionWithSingleQuotedFrontmatter(t *testing.T) {
	input := `---
id: 'single-quoted-session''v2'
date: '2026-03-18'
effort: 3
category: 'Technical'
duration: 75
---

# March 18, 2026 – Judo Session

## Techniques Practiced
- O uchi gari

## Session Description

Single-quoted frontmatter should parse.

## Notes

Coach''s note should preserve apostrophe.`

	parsed, err := MarkdownToSession(input)
	if err != nil {
		t.Fatalf("MarkdownToSession() error = %v", err)
	}

	if parsed.ID != "single-quoted-session'v2" {
		t.Fatalf("unexpected ID: %q", parsed.ID)
	}
	if parsed.Date != "2026-03-18" {
		t.Fatalf("unexpected date: %q", parsed.Date)
	}
	if parsed.Category != model.CategoryTechnical {
		t.Fatalf("unexpected category: %q", parsed.Category)
	}
	if parsed.Duration == nil || *parsed.Duration != 75 {
		t.Fatalf("unexpected duration: %#v", parsed.Duration)
	}
}

func TestMarkdownToSessionWithMixedQuotedFrontmatter(t *testing.T) {
	input := `---
id: 'mixed-quoted-session'
date: "2026-03-18"
effort: 4
category: 'Randori'
duration: 60
---

# March 18, 2026 – Judo Session

## Techniques Practiced
- Sasae tsurikomi ashi

## Session Description

Mixed quoting should parse.
`

	parsed, err := MarkdownToSession(input)
	if err != nil {
		t.Fatalf("MarkdownToSession() error = %v", err)
	}

	if parsed.ID != "mixed-quoted-session" {
		t.Fatalf("unexpected ID: %q", parsed.ID)
	}
	if parsed.Date != "2026-03-18" {
		t.Fatalf("unexpected date: %q", parsed.Date)
	}
	if parsed.Category != model.CategoryRandori {
		t.Fatalf("unexpected category: %q", parsed.Category)
	}
	if parsed.Duration == nil || *parsed.Duration != 60 {
		t.Fatalf("unexpected duration: %#v", parsed.Duration)
	}
}
