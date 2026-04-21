# Markdown Style Guide

This guide documents the markdown conventions used throughout the MatMetrics repository. All markdown files should follow these standards for consistency and readability.

## Heading Hierarchy

Headings must follow a strict hierarchical structure with no skipped levels. The first heading in any document must be an `# H1` title.

### Correct Pattern

```markdown
# Document Title

## Main Section

### Subsection

#### Detail Level
```

### Incorrect Patterns

```markdown
## Document Title  ← ❌ Should be H1

### Subsection    ← ❌ Skips H2
```

**Reference examples:** [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), [docs/go-contract.md](go-contract.md)

## Links

### Internal File Links

Use relative markdown paths with descriptive link text:

```markdown
[text description](path/to/file.md)
[text description](../other/file.md)
```

### Internal Line References

Link to specific lines using the markdown anchor format:

```markdown
[relevant section](path/file.md#L10)
[configuration example](../config.ts#L20-L25)
```

### External Links

Use absolute URLs for external resources:

```markdown
[GitHub API docs](https://docs.github.com/en/rest)
[TypeScript handbook](https://www.typescriptlang.org/docs/)
```

### Cross-Document References

When referencing another document's section, use heading anchors (lowercase, hyphenated):

```markdown
See [Session Data Contract](docs/go-contract.md#session-data-contract)
```

**Reference examples:** [AGENTS.md](../AGENTS.md) (extensive cross-links), Plugin READMEs in [plugins/github-sync/README.md](../plugins/github-sync/README.md)

## Code Blocks

All code blocks must specify a language tag for syntax highlighting:

```bash
npm run dev
```

```go
go build ./go/cmd/matmetrics-cli
```

```typescript
const session = await fetchSession(id);
```

```json
{
  "id": "session-uuid",
  "date": "2026-03-18"
}
```

### Supported Languages

- `bash` — Shell commands, environment setup
- `go` — Go source code
- `typescript` or `ts` — TypeScript
- `json` — JSON configuration or data
- `markdown` — Markdown examples
- `text` — Plain text, logs, or output
- `yaml` — YAML configuration
- `html` — HTML markup

**Reference examples:** [CLAUDE.md](../CLAUDE.md#frontend-nextjs--typescript) (command blocks), [docs/go-contract.md](go-contract.md) (JSON examples)

## Tables

Use markdown pipe-delimited tables with proper alignment:

```markdown
| Column A | Column B | Column C |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
| Value 4  | Value 5  | Value 6  |
```

### Guidelines

- Include a header row (required)
- Use `|` delimiters on both edges
- Separate header from body with `|---|---|---|`
- Use consistent alignment markers: `-` (default), `:--` (left), `--:` (right), `:--:` (center)
- For large tables (15+ rows), consider breaking into multiple sections with subheadings

**Reference examples:** [AGENTS.md](../AGENTS.md#code-style) (architecture table), [CHANGELOG.md](../CHANGELOG.md) (version table)

## Lists

### Unordered Lists

Use `-` consistently for all unordered lists:

```markdown
- Item one
- Item two
- Item three
```

### Ordered Lists

Use numeric markers for sequential steps or procedures:

```markdown
1. First step
2. Second step
3. Third step
```

### Nested Lists

Maintain consistent indentation (2 spaces):

```markdown
- Parent item
  - Child item one
  - Child item two
- Another parent
  - Child item three
```

**Reference examples:** Plugin READMEs, [docs/plugin-capability-policy.md](plugin-capability-policy.md)

## Document Structure

### Standard Sections

Organize documents with these common sections (order varies by document type):

- **Title** (`# Document Title`)
- **Overview/Introduction** — 2–3 sentence summary of scope
- **Main Content** — Sections organized by topic (H2/H3 hierarchy)
- **Examples** — Code samples or concrete use cases
- **References** — Links to related documentation
- **See Also** — Cross-references to other docs

### Example Document Structure

```markdown
# Document Title

Brief description of what this document covers and who should read it.

## Section One

Content here...

## Section Two

### Subsection

Content here...

## References

- [Related doc](../related-doc.md)
- [External resource](https://example.com)
```

**Reference examples:** [AGENTS.md](../AGENTS.md) (well-organized sections), Plugin READMEs (consistent template structure)

## Terminology & Consistency

### Key Terms

Use these terms consistently across all documentation:

- **session** — Individual Judo training session (not "workout" or "practice")
- **technique** — Specific Judo move or technique (e.g., Uchi mata)
- **plugin** — Extension system component (not "module" or "extension")
- **dashboard** or **tab** — UI component for displaying content
- **UI contract** — Interface specification for plugins
- **storage layer** — Data persistence mechanism (GitHub, local, Firebase)
- **flow** — Genkit AI flow for task automation

### Terminology Examples

```markdown
✅ The user logs a Judo session by recording techniques practiced.
❌ The user logs a workout by recording moves used.

✅ Plugins extend the dashboard with custom tabs.
❌ Extensions add modules to the interface.
```

**Reference examples:** [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md) (consistent terminology throughout)

## Formatting Conventions

### Bold and Italics

- **Bold** (`**text**`) — For emphasis on key terms, headings within prose, or important warnings
- *Italic* (`*text*`) — For code variable names in prose, technical terms, or filenames when not using inline code

### Inline Code

Use backticks for:

- Variable or parameter names: `` `sessionId` ``
- Function names: `` `fetchSession()` ``
- Command names: `` `npm run dev` ``
- Configuration keys: `` `GITHUB_TOKEN` ``
- File extensions or types: `` `.md` files ``

### Block Quotes

Use for examples, notes, or important information:

```markdown
> **Note:** This is an important note that applies to the surrounding content.

> **Warning:** This action cannot be undone.
```

## Line Length

Target **100 characters** for readability; hard limit is **120 characters**. Exceptions:

- URLs (may exceed limit)
- Code blocks (preserve indentation)
- Tables (preserve formatting)
- Long inline code (`` `very-long-function-name()` ``)

## Special Characters

### No Emoji in Headings

Headings must use text only; emoji are not allowed:

```markdown
✅ ## Installation Steps
❌ ## 🚀 Installation Steps

✅ ### Configuration
❌ ### ⚙️ Configuration
```

### Escaping Special Characters

When using special markdown characters in prose, escape with backslash:

```markdown
Use \* for asterisks or \# for hashes when needed in text.
```

## Document Types & Templates

### Architecture/Contract Documents

Structure: Overview → Key Concepts → Detailed Specifications → Examples → References

**Examples:** [docs/go-contract.md](go-contract.md), [docs/plugin-ui-contract.md](plugin-ui-contract.md)

### Plugin READMEs

Structure: Title → Purpose & Capabilities → UI Ownership → Usage → Verification → References

**Examples:** [plugins/github-sync/README.md](../plugins/github-sync/README.md), all plugin directories

### Project Guidance

Structure: Title → Quick Reference Table → Sections → Conventions → References

**Examples:** [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md)

### Setup/How-To Documents

Structure: Title → Prerequisites → Step-by-Step Instructions → Verification → Troubleshooting

**Examples:** [nextsteps.md](../nextsteps.md), Go command examples in [go/README.md](../go/README.md)

## Linting & Validation

All markdown files are validated using `.markdownlint.json` with these key rules:

| Rule | Enforces |
|------|----------|
| `first-line-h1` | First heading must be H1 |
| `heading-increment` | No skipped heading levels (H1 → H2 → H3, not H1 → H3) |
| `fenced-code-language` | Code blocks must have language tag |
| `line-length` | Lines should not exceed 120 characters |
| `no-bare-urls` | URLs must be in markdown links |
| `blanks-around-headings` | Blank lines before/after headings |
| `no-multiple-blanks` | Max 1 consecutive blank line |

### Running Linting

```bash
# Install markdownlint-cli globally
npm install -g markdownlint-cli

# Lint all markdown files
markdownlint -c .markdownlint.json "**/*.md"

# Lint specific file
markdownlint -c .markdownlint.json docs/MARKDOWN_STYLE.md
```

## Quick Reference: Before Committing

- [ ] First heading is `# Document Title` (not `##`)
- [ ] Heading hierarchy uses H2 → H3 → H4 (no skips)
- [ ] All code blocks have language tags (` ```bash `)
- [ ] Internal links use relative paths (`[text](../path/file.md)`)
- [ ] No line exceeds 120 characters (except URLs)
- [ ] No emoji in headings
- [ ] Consistent list markers (all `-` or all numbered)
- [ ] Tables have consistent column counts
- [ ] Key terms use standardized vocabulary
- [ ] Blank lines separate major sections

## See Also

- [AGENTS.md](../AGENTS.md) — Project guidelines (exemplary formatting)
- [.markdownlint.json](../.markdownlint.json) — Linting configuration
- [CommonMark Spec](https://spec.commonmark.org/) — Markdown standard
- [GitHub Flavored Markdown](https://github.github.com/gfm/) — GitHub extensions
