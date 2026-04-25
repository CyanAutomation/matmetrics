package markdown

import (
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"matmetrics/internal/model"
)

func SessionToMarkdown(session model.Session) (string, error) {
	if err := validateSession(session); err != nil {
		return "", err
	}

	_, err := time.Parse("2006-01-02", session.Date)
	if err != nil {
		return "", fmt.Errorf("invalid session date %q: %w", session.Date, err)
	}

	var b strings.Builder
	b.WriteString("---\n")
	b.WriteString(fmt.Sprintf("id: %q\n", session.ID))
	b.WriteString(fmt.Sprintf("date: %q\n", session.Date))
	b.WriteString(fmt.Sprintf("effort: %d\n", session.Effort))
	b.WriteString(fmt.Sprintf("category: %q\n", session.Category))
	if session.Duration != nil {
		b.WriteString(fmt.Sprintf("duration: %d\n", *session.Duration))
	}
	if strings.TrimSpace(session.VideoURL) != "" {
		b.WriteString(fmt.Sprintf("videoUrl: %q\n", session.VideoURL))
	}
	b.WriteString("---\n\n")

	b.WriteString(fmt.Sprintf("# %s - Judo Session: %s\n\n", session.Date, session.Category))
	b.WriteString("## Techniques Practiced\n")
	if len(session.Techniques) == 0 {
		b.WriteString("- (none recorded)\n")
	} else {
		for _, technique := range session.Techniques {
			b.WriteString("- ")
			b.WriteString(technique)
			b.WriteString("\n")
		}
	}
	b.WriteString("\n")

	b.WriteString("## Session Description\n\n")
	if session.Description != "" {
		b.WriteString(session.Description)
	}
	b.WriteString("\n\n")

	b.WriteString("## Notes\n\n")
	if session.Notes != "" {
		b.WriteString(session.Notes)
	}
	b.WriteString("\n")

	return b.String(), nil
}

// MarkdownToSession parses a markdown string with YAML frontmatter into a Session.
// Frontmatter is canonical. Title is informational and may be edited manually.
func MarkdownToSession(markdown string) (model.Session, error) {
	frontmatter, content, err := splitFrontmatter(markdown)
	if err != nil {
		return model.Session{}, err
	}

	values, err := parseFrontmatter(frontmatter)
	if err != nil {
		return model.Session{}, err
	}

	id, ok := values["id"].(string)
	if !ok || strings.TrimSpace(id) == "" {
		return model.Session{}, fmt.Errorf("missing or invalid %q in frontmatter", "id")
	}
	dateValue, ok := values["date"].(string)
	if !ok || strings.TrimSpace(dateValue) == "" {
		return model.Session{}, fmt.Errorf("missing or invalid %q in frontmatter", "date")
	}
	effortRaw, ok := values["effort"].(int)
	if !ok {
		return model.Session{}, fmt.Errorf("missing or invalid %q in frontmatter", "effort")
	}
	categoryValue, ok := values["category"].(string)
	if !ok || strings.TrimSpace(categoryValue) == "" {
		return model.Session{}, fmt.Errorf("missing or invalid %q in frontmatter", "category")
	}

	if err := validateTitlePresence(content); err != nil {
		return model.Session{}, err
	}
	if err := validateRequiredSections(content); err != nil {
		return model.Session{}, err
	}

	description := extractSectionContent(content, "Session Description")
	notes := extractSectionContent(content, "Notes")

	session := model.Session{
		ID:          id,
		Date:        dateValue,
		Effort:      model.EffortLevel(effortRaw),
		Category:    model.SessionCategory(categoryValue),
		Techniques:  extractTechniques(content),
		Description: description,
		Notes:       notes,
	}

	if durationRaw, ok := values["duration"]; ok {
		duration, ok := durationRaw.(int)
		if !ok {
			return model.Session{}, fmt.Errorf("invalid %q in frontmatter", "duration")
		}
		session.Duration = &duration
	}
	if videoURLRaw, ok := values["videoUrl"]; ok {
		videoURL, ok := videoURLRaw.(string)
		if !ok {
			return model.Session{}, fmt.Errorf("invalid %q in frontmatter", "videoUrl")
		}
		session.VideoURL = videoURL
	}

	if err := validateSession(session); err != nil {
		return model.Session{}, err
	}

	return session, nil
}

func splitFrontmatter(markdown string) (string, string, error) {
	markdown = strings.ReplaceAll(markdown, "\r\n", "\n")

	const marker = "---\n"
	if !strings.HasPrefix(markdown, marker) {
		return "", "", fmt.Errorf("markdown is missing YAML frontmatter")
	}

	rest := markdown[len(marker):]
	endIndex := strings.Index(rest, "\n---\n")
	if endIndex < 0 {
		return "", "", fmt.Errorf("markdown frontmatter terminator not found")
	}

	frontmatter := rest[:endIndex]
	content := rest[endIndex+len("\n---\n"):]
	return frontmatter, content, nil
}

func parseFrontmatter(frontmatter string) (map[string]any, error) {
	values := make(map[string]any)
	lines := strings.Split(frontmatter, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid frontmatter line %q", line)
		}

		key := strings.TrimSpace(parts[0])
		rawValue := strings.TrimSpace(parts[1])

		unquoted, isQuoted, err := parseQuotedFrontmatterValue(rawValue)
		if err != nil {
			return nil, fmt.Errorf("invalid quoted value for %q: %w", key, err)
		}
		if isQuoted {
			values[key] = unquoted
			continue
		}

		numberValue, err := strconv.Atoi(rawValue)
		if err != nil {
			return nil, fmt.Errorf("unsupported frontmatter value for %q: %q", key, rawValue)
		}
		values[key] = numberValue
	}

	return values, nil
}

func parseQuotedFrontmatterValue(rawValue string) (string, bool, error) {
	if len(rawValue) < 2 {
		return "", false, nil
	}

	if strings.HasPrefix(rawValue, "\"") && strings.HasSuffix(rawValue, "\"") {
		unquoted, err := strconv.Unquote(rawValue)
		if err != nil {
			return "", false, err
		}
		return unquoted, true, nil
	}

	if strings.HasPrefix(rawValue, "'") && strings.HasSuffix(rawValue, "'") {
		content := rawValue[1 : len(rawValue)-1]
		content = strings.ReplaceAll(content, "''", "'")
		return content, true, nil
	}

	return "", false, nil
}

func extractTechniques(content string) []string {
	section := extractSectionContent(content, "Techniques Practiced")
	if section == "" {
		return []string{}
	}

	lines := strings.Split(section, "\n")
	techniques := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "- ") {
			continue
		}
		technique := strings.TrimSpace(strings.TrimPrefix(trimmed, "- "))
		if technique == "" || technique == "(none recorded)" {
			continue
		}
		techniques = append(techniques, technique)
	}

	return techniques
}

func extractSectionContent(content string, heading string) string {
	sectionHeadings := []string{
		"## Techniques Practiced",
		"## Session Description",
		"## Notes",
	}
	targetHeading := "## " + heading
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")

	inFencedCodeBlock := false
	headingLineIndex := -1

	for i, line := range lines {
		if isFencedCodeDelimiter(line) {
			inFencedCodeBlock = !inFencedCodeBlock
			continue
		}

		if !inFencedCodeBlock && line == targetHeading {
			headingLineIndex = i
			break
		}
	}

	if headingLineIndex == -1 {
		return ""
	}

	sectionStartIndex := headingLineIndex + 1
	if sectionStartIndex < len(lines) && lines[sectionStartIndex] == "" {
		sectionStartIndex += 1
	}

	sectionLines := make([]string, 0, len(lines)-sectionStartIndex)
	inFencedCodeBlock = false

	for i := sectionStartIndex; i < len(lines); i++ {
		line := lines[i]

		if isFencedCodeDelimiter(line) {
			inFencedCodeBlock = !inFencedCodeBlock
			sectionLines = append(sectionLines, line)
			continue
		}

		if !inFencedCodeBlock && containsString(sectionHeadings, line) && line != targetHeading {
			break
		}

		sectionLines = append(sectionLines, line)
	}

	return strings.TrimRight(strings.Join(sectionLines, "\n"), "\n")
}

func validateSession(session model.Session) error {
	if strings.TrimSpace(session.ID) == "" {
		return fmt.Errorf("session ID is required")
	}
	if len(session.ID) > 100 {
		return fmt.Errorf("session ID exceeds maximum allowed length of 100 characters")
	}
	if _, err := time.Parse("2006-01-02", session.Date); err != nil {
		return fmt.Errorf("session date must be YYYY-MM-DD")
	}
	if session.Effort < 1 || session.Effort > 5 {
		return fmt.Errorf("session effort must be between 1 and 5")
	}
	switch session.Category {
	case model.CategoryTechnical, model.CategoryRandori, model.CategoryShiai:
	default:
		return fmt.Errorf("invalid session category %q", session.Category)
	}
	if session.Duration != nil && *session.Duration < 0 {
		return fmt.Errorf("session duration must be a non-negative integer")
	}
	if err := validateOptionalVideoURL(session.VideoURL); err != nil {
		return err
	}
	return nil
}

func validateOptionalVideoURL(value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	parsedURL, err := url.Parse(trimmed)
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return fmt.Errorf("invalid videoUrl: expected a valid absolute URL")
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("invalid videoUrl: protocol must be http or https")
	}

	// Prevent SSRF attacks by blocking private/internal network ranges
	host := parsedURL.Hostname()
	if isDisallowedVideoHost(host) {
		return fmt.Errorf("invalid videoUrl: private or internal network addresses are not allowed")
	}

	return nil
}

func isDisallowedVideoHost(host string) bool {
	lowerHost := strings.ToLower(strings.TrimSpace(host))
	if lowerHost == "" || lowerHost == "localhost" {
		return true
	}

	if ip, err := netip.ParseAddr(lowerHost); err == nil {
		return isDisallowedIP(ip)
	}

	resolvedIPs, err := net.LookupIP(lowerHost)
	if err != nil {
		return false
	}
	for _, resolvedIP := range resolvedIPs {
		addr, ok := netip.AddrFromSlice(resolvedIP)
		if ok && isDisallowedIP(addr) {
			return true
		}
	}
	return false
}

func isDisallowedIP(addr netip.Addr) bool {
	return addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsMulticast() ||
		addr.IsUnspecified()
}

func validateTitlePresence(content string) error {
	lines := strings.Split(content, "\n")

	// Find the first non-empty line (the title)
	var titleLine string
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			titleLine = line
			break
		}
	}

	if titleLine == "" {
		return fmt.Errorf("markdown content has no title")
	}

	if !strings.HasPrefix(titleLine, "# ") {
		return fmt.Errorf("markdown content must begin with a level-1 title. Got: %q", titleLine)
	}

	return nil
}

func validateRequiredSections(content string) error {
	requiredHeadings := []string{
		"## Techniques Practiced",
		"## Session Description",
		"## Notes",
	}

	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	inFencedCodeBlock := false
	foundHeadings := make(map[string]bool, len(requiredHeadings))

	for _, line := range lines {
		if isFencedCodeDelimiter(line) {
			inFencedCodeBlock = !inFencedCodeBlock
			continue
		}
		if inFencedCodeBlock {
			continue
		}
		if containsString(requiredHeadings, line) {
			foundHeadings[line] = true
		}
	}

	missing := make([]string, 0, len(requiredHeadings))
	for _, heading := range requiredHeadings {
		if !foundHeadings[heading] {
			missing = append(missing, strings.TrimPrefix(heading, "## "))
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("markdown content is missing required sections: %s", strings.Join(missing, ", "))
	}

	return nil
}

func isFencedCodeDelimiter(line string) bool {
	trimmed := strings.TrimLeft(line, " \t")
	return strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~")
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

type NormalizeResult struct {
	Markdown string
	Changed  bool
	Errors   []string
}

// NormalizeMarkdown rewrites markdown into canonical frontmatter + section order.
// It preserves discovered section content where possible and injects any missing
// required sections so the content can be re-validated consistently.
func NormalizeMarkdown(content string) NormalizeResult {
	normalizedInput := strings.ReplaceAll(content, "\r\n", "\n")
	frontmatter, body, err := splitFrontmatter(normalizedInput)
	if err != nil {
		return NormalizeResult{Markdown: normalizedInput, Errors: []string{err.Error()}}
	}

	values, err := parseFrontmatter(frontmatter)
	if err != nil {
		return NormalizeResult{Markdown: normalizedInput, Errors: []string{err.Error()}}
	}

	id, _ := values["id"].(string)
	date, _ := values["date"].(string)
	category, _ := values["category"].(string)
	effort, effortOK := values["effort"].(int)

	errors := make([]string, 0)
	if strings.TrimSpace(id) == "" {
		errors = append(errors, `missing or invalid "id" in frontmatter`)
	}
	if strings.TrimSpace(date) == "" {
		errors = append(errors, `missing or invalid "date" in frontmatter`)
	}
	if !effortOK {
		errors = append(errors, `missing or invalid "effort" in frontmatter`)
	}
	if strings.TrimSpace(category) == "" {
		errors = append(errors, `missing or invalid "category" in frontmatter`)
	}
	if len(errors) > 0 {
		return NormalizeResult{Markdown: normalizedInput, Errors: errors}
	}

	session := model.Session{
		ID:          id,
		Date:        date,
		Effort:      model.EffortLevel(effort),
		Category:    model.SessionCategory(category),
		Techniques:  extractTechniques(body),
		Description: extractSectionContent(body, "Session Description"),
		Notes:       extractSectionContent(body, "Notes"),
	}
	if durationRaw, ok := values["duration"]; ok {
		duration, ok := durationRaw.(int)
		if !ok {
			return NormalizeResult{Markdown: normalizedInput, Errors: []string{`invalid "duration" in frontmatter`}}
		}
		session.Duration = &duration
	}
	if videoURLRaw, ok := values["videoUrl"]; ok {
		videoURL, ok := videoURLRaw.(string)
		if !ok {
			return NormalizeResult{Markdown: normalizedInput, Errors: []string{`invalid "videoUrl" in frontmatter`}}
		}
		session.VideoURL = videoURL
	}

	rendered, err := SessionToMarkdown(session)
	if err != nil {
		return NormalizeResult{Markdown: normalizedInput, Errors: []string{err.Error()}}
	}

	title := extractTitleLine(body)
	if strings.TrimSpace(title) != "" {
		rendered = replaceTitleLine(rendered, title)
	}

	normalized := strings.TrimRight(rendered, "\n") + "\n"
	changed := normalized != strings.TrimRight(normalizedInput, "\n")+"\n"
	return NormalizeResult{Markdown: normalized, Changed: changed}
}

func extractTitleLine(content string) string {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "# ") {
			return trimmed
		}
		return ""
	}
	return ""
}

func replaceTitleLine(markdown, title string) string {
	re := regexp.MustCompile(`(?m)^# .*$`)
	loc := re.FindStringIndex(markdown)
	if loc == nil {
		return markdown
	}
	return markdown[:loc[0]] + title + markdown[loc[1]:]
}
