# Go Session Contract

This document freezes the cross-language contract between the existing TypeScript implementation and the new Go tooling.

## Session shape

`JudoSession` fields:

- `id: string`
- `date: string` in `YYYY-MM-DD`
- `description?: string`
- `techniques: string[]`
- `effort: 1 | 2 | 3 | 4 | 5`
- `category: "Technical" | "Randori" | "Shiai"`
- `notes?: string`
- `duration?: number` (session duration in minutes)
- `videoUrl?: string` (optional absolute `http://` or `https://` URL to a session video)

## Markdown format

Each session markdown file must use YAML frontmatter followed by fixed headings. Frontmatter is canonical; the title is informational.

```md
---
id: 'session-id'
date: '2026-03-17'
effort: 3
category: 'Technical'
duration: 90
---

# 2026-03-17 - Judo Session: Technical

## Techniques Practiced

- Uchi mata

## Session Description

Description text

## Notes

Notes text
```

**Format Rules:**

- The first non-empty body line must be a level-1 title (`# ...`)
- Generated files use the default title format `# YYYY-MM-DD - Judo Session: Category`
- Parsers do not treat title text as canonical metadata
- `duration` is optional in frontmatter
- `videoUrl` is optional in frontmatter; when present it should be a valid absolute `http://` or `https://` URL
- If `techniques` is empty, write `- (none recorded)`
- Generated files always include these body sections, even when empty
- Section names must stay exactly:
  - `Techniques Practiced`
  - `Session Description`
  - `Notes`

## Local file layout

- Base directory: `data/`
- Relative path: `YYYY/MM/YYYYMMDD-matmetrics-<sanitized-id>.md`
- Local filename sanitization replaces every non `[a-zA-Z0-9-_]` character with `-`.

Example:

- Session ID `a/b` becomes local filename suffix `a-b`

## GitHub file layout

- Relative path: `data/YYYY/MM/YYYYMMDD-matmetrics-<encoded-id>.md`
- GitHub path encoding must match JavaScript `encodeURIComponent`.

Examples:

- Session ID `a/b` becomes `a%2Fb`
- Session ID `a?b` becomes `a%3Fb`

## Error semantics

- Invalid session data is a validation error.
- Missing `GITHUB_TOKEN` is an operator/configuration error.
- GitHub `404` while reading a session file means not found.
- Bulk sync must be idempotent for unchanged content: unchanged files are skipped, not rewritten.
- Missing a level-1 title in the body is a validation error.
