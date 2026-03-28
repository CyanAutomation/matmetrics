package markdown

import (
	"fmt"
	"strings"
	"testing"

	"matmetrics/internal/model"
)

func TestSplitFrontmatterWithLF(t *testing.T) {
	input := "---\nid: \"lf\"\n---\n\nbody"

	frontmatter, content, err := splitFrontmatter(input)
	if err != nil {
		t.Fatalf("splitFrontmatter() error = %v", err)
	}

	if frontmatter != "id: \"lf\"" {
		t.Fatalf("unexpected frontmatter: %q", frontmatter)
	}
	if content != "\nbody" {
		t.Fatalf("unexpected content: %q", content)
	}
}

func TestSplitFrontmatterWithCRLF(t *testing.T) {
	input := "---\r\nid: \"crlf\"\r\n---\r\n\r\nbody"

	frontmatter, content, err := splitFrontmatter(input)
	if err != nil {
		t.Fatalf("splitFrontmatter() error = %v", err)
	}

	if frontmatter != "id: \"crlf\"" {
		t.Fatalf("unexpected frontmatter: %q", frontmatter)
	}
	if content != "\nbody" {
		t.Fatalf("unexpected content: %q", content)
	}
}

func TestSplitFrontmatterMissingOrInvalidTerminator(t *testing.T) {
	testCases := []struct {
		name  string
		input string
	}{
		{
			name:  "missing terminator",
			input: "---\nid: \"missing\"\n",
		},
		{
			name:  "invalid terminator",
			input: "---\nid: \"invalid\"\n--\n\nbody",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := splitFrontmatter(tc.input)
			if err == nil {
				t.Fatalf("splitFrontmatter() error = nil, want error")
			}
			if err.Error() != "markdown frontmatter terminator not found" {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

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
		VideoURL:    "https://example.com/videos/123",
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
	if parsed.VideoURL != "https://example.com/videos/123" {
		t.Fatalf("unexpected video URL: %q", parsed.VideoURL)
	}
}

func TestMarkdownToSessionWithoutVideoURLStillParses(t *testing.T) {
	input := `---
id: "no-video"
date: "2026-03-24"
effort: 3
category: "Technical"
---

# 2026-03-24 - Judo Session: Technical

## Techniques Practiced
- O soto gari

## Session Description

No video URL in frontmatter.

## Notes

Older file format.
`

	parsed, err := MarkdownToSession(input)
	if err != nil {
		t.Fatalf("MarkdownToSession() error = %v", err)
	}
	if parsed.VideoURL != "" {
		t.Fatalf("expected empty video URL, got %q", parsed.VideoURL)
	}
}

func TestMarkdownParserHandlesEndOfFileWithoutTrailingNewline(t *testing.T) {
	input := `---
id: "edge-1"
date: "2026-03-16"
effort: 3
category: "Technical"
---

# 2026-03-16 - Judo Session: Technical

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

	titleIndex := strings.Index(rendered, "# 2026-03-17 - Judo Session: Technical")
	techniquesHeadingIndex := strings.Index(rendered, "## Techniques Practiced")
	noneRecordedIndex := strings.Index(rendered, "- (none recorded)")

	if titleIndex < 0 || techniquesHeadingIndex < 0 || noneRecordedIndex < 0 {
		t.Fatalf("rendered markdown is missing required sections: %q", rendered)
	}

	if !(titleIndex < techniquesHeadingIndex && techniquesHeadingIndex < noneRecordedIndex) {
		t.Fatalf("unexpected section order in rendered markdown: %q", rendered)
	}

	if !strings.Contains(rendered, "## Session Description") {
		t.Fatalf("rendered markdown is missing description heading: %q", rendered)
	}
	if !strings.Contains(rendered, "## Notes") {
		t.Fatalf("rendered markdown is missing notes heading: %q", rendered)
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

# 2026-03-18 - Judo Session: Technical

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

# 2026-03-18 - Judo Session: Randori

## Techniques Practiced
- Sasae tsurikomi ashi

## Session Description

Mixed quoting should parse.

## Notes

No additional notes.
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

func TestNormalizeMarkdownReordersAndAddsRequiredSections(t *testing.T) {
	input := `---
id: "normalize-1"
date: "2026-03-20"
effort: 3
category: "Technical"
---

# Custom Title

## Notes

Some note first.

## Techniques Practiced
- Harai goshi
`

	result := NormalizeMarkdown(input)
	if len(result.Errors) > 0 {
		t.Fatalf("NormalizeMarkdown() errors = %#v", result.Errors)
	}
	if !result.Changed {
		t.Fatalf("NormalizeMarkdown() expected changed=true")
	}
	if !strings.Contains(result.Markdown, "## Techniques Practiced") ||
		!strings.Contains(result.Markdown, "## Session Description") ||
		!strings.Contains(result.Markdown, "## Notes") {
		t.Fatalf("normalized markdown missing required sections: %q", result.Markdown)
	}
	techniquesIndex := strings.Index(result.Markdown, "## Techniques Practiced")
	descriptionIndex := strings.Index(result.Markdown, "## Session Description")
	notesIndex := strings.Index(result.Markdown, "## Notes")
	if !(techniquesIndex < descriptionIndex && descriptionIndex < notesIndex) {
		t.Fatalf("required sections are not in canonical order: %q", result.Markdown)
	}
	if !strings.Contains(result.Markdown, "# Custom Title") {
		t.Fatalf("expected custom title to be preserved: %q", result.Markdown)
	}
}

func TestNormalizeMarkdownReturnsErrorsForInvalidFrontmatter(t *testing.T) {
	input := `---
id: "missing-effort"
date: "2026-03-20"
category: "Technical"
---

# Title`

	result := NormalizeMarkdown(input)
	if len(result.Errors) == 0 {
		t.Fatalf("NormalizeMarkdown() expected errors, got none")
	}
	if !strings.Contains(strings.Join(result.Errors, ","), "effort") {
		t.Fatalf("expected effort error, got %#v", result.Errors)
	}
}

func TestMarkdownToSessionAllowsEditedInformationalTitle(t *testing.T) {
	input := `---
id: "edited-title"
date: "2026-03-22"
effort: 3
category: "Technical"
---

# Tuesday drilling session

## Techniques Practiced
- Seoi nage

## Session Description

Worked entries and kuzushi.

## Notes

Keep left elbow higher.`

	parsed, err := MarkdownToSession(input)
	if err != nil {
		t.Fatalf("MarkdownToSession() error = %v", err)
	}

	if parsed.Date != "2026-03-22" {
		t.Fatalf("unexpected date: %q", parsed.Date)
	}
	if parsed.Category != model.CategoryTechnical {
		t.Fatalf("unexpected category: %q", parsed.Category)
	}
	if len(parsed.Techniques) != 1 || parsed.Techniques[0] != "Seoi nage" {
		t.Fatalf("unexpected techniques: %#v", parsed.Techniques)
	}
}

func TestMarkdownToSessionRequiresLevelOneTitle(t *testing.T) {
	input := `---
id: "missing-h1"
date: "2026-03-22"
effort: 3
category: "Technical"
---

Tuesday drilling session

## Techniques Practiced
- Seoi nage

## Session Description

Worked entries and kuzushi.

## Notes

Keep left elbow higher.`

	_, err := MarkdownToSession(input)
	if err == nil {
		t.Fatal("MarkdownToSession() error = nil, want error")
	}
	if !strings.Contains(err.Error(), "level-1 title") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMarkdownToSessionRequiresAllStandardSections(t *testing.T) {
	input := `---
id: "missing-sections"
date: "2026-03-22"
effort: 3
category: "Technical"
---

# Tuesday drilling session`

	_, err := MarkdownToSession(input)
	if err == nil {
		t.Fatal("MarkdownToSession() error = nil, want error")
	}
	if !strings.Contains(err.Error(), "missing required sections") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMarkdownToSessionRejectsNegativeDuration(t *testing.T) {
	input := `---
id: "negative-duration"
date: "2026-03-22"
effort: 3
category: "Technical"
duration: -5
---

# 2026-03-22 - Judo Session: Technical

## Techniques Practiced
- Seoi nage

## Session Description

Worked entries.

## Notes

No additional notes.
`

	_, err := MarkdownToSession(input)
	if err == nil {
		t.Fatal("MarkdownToSession() error = nil, want error")
	}
	if !strings.Contains(err.Error(), "non-negative integer") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMarkdownToSessionPreservesEmbeddedHashesAndFencedCode(t *testing.T) {
	input := `---
id: "edge-fenced-code"
date: "2026-03-22"
effort: 4
category: "Technical"
---

# 2026-03-22 - Judo Session: Technical

## Techniques Practiced
- Tomoe nage

## Session Description

This line includes a literal token: ## not-a-heading.
Another line keeps ## Session Description as plain text content.

` + "```md" + `
## Notes
console.log("inside description");
` + "```" + `
After code fence in description.

## Notes

Keep ## Notes literal in notes text too.
And retain ## Techniques Practiced as inline text.

` + "```text" + `
## Session Description
note_code();
` + "```" + `
After code fence in notes.`

	parsed, err := MarkdownToSession(input)
	if err != nil {
		t.Fatalf("MarkdownToSession() error = %v", err)
	}

	expectedDescription := strings.Join([]string{
		"This line includes a literal token: ## not-a-heading.",
		"Another line keeps ## Session Description as plain text content.",
		"",
		"```md",
		"## Notes",
		`console.log("inside description");`,
		"```",
		"After code fence in description.",
	}, "\n")
	if parsed.Description != expectedDescription {
		t.Fatalf("unexpected description: %q", parsed.Description)
	}

	expectedNotes := strings.Join([]string{
		"Keep ## Notes literal in notes text too.",
		"And retain ## Techniques Practiced as inline text.",
		"",
		"```text",
		"## Session Description",
		"note_code();",
		"```",
		"After code fence in notes.",
	}, "\n")
	if parsed.Notes != expectedNotes {
		t.Fatalf("unexpected notes: %q", parsed.Notes)
	}
}

func TestMarkdownToSessionRejectsVideoURLPrivateHosts(t *testing.T) {
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
			hostForURL := host
			if strings.Contains(hostForURL, ":") {
				hostForURL = "[" + hostForURL + "]"
			}
			input := fmt.Sprintf(`---
id: "blocked-video-host-%s"
date: "2026-03-28"
effort: 3
category: "Technical"
videoUrl: "https://%s/video"
---

# 2026-03-28 - Judo Session: Technical

## Techniques Practiced
- Uchi mata

## Session Description

Description.

## Notes

Notes.
`, strings.NewReplacer(".", "-", ":", "-").Replace(host), hostForURL)

			_, err := MarkdownToSession(input)
			if err == nil {
				t.Fatalf("MarkdownToSession() error = nil, want error for host %q", host)
			}
			if !strings.Contains(err.Error(), "private or internal network addresses are not allowed") {
				t.Fatalf("unexpected error for host %q: %v", host, err)
			}
		})
	}
}
