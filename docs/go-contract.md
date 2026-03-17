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
- `duration?: number`

## Markdown format

Each session markdown file must use YAML frontmatter followed by fixed headings:

```md
---
id: "session-id"
date: "2026-03-17"
effort: 3
category: "Technical"
duration: 90
---

# March 17, 2026 – Judo Session

## Techniques Practiced
- Uchi mata

## Session Description

Description text

## Notes

Notes text
```

Rules:

- `duration` is optional.
- If `techniques` is empty, write `- (none recorded)`.
- Section names must stay exactly:
  - `Techniques Practiced`
  - `Session Description`
  - `Notes`
- The title line uses an en dash: `# Month Day, Year – Judo Session`.

## Local file layout

- Base directory: `data/`
- Relative path: `YYYY/MM/YYYYMMDD-matmetrics-<sanitized-id>.md`
- Local filename sanitization replaces every non `[a-zA-Z0-9-_]` character with `-`.

Example:

- Session ID `a/b` becomes local filename suffix `a-b`

## GitHub file layout

- Relative path: `sessions/YYYY/MM/YYYYMMDD-matmetrics-<encoded-id>.md`
- GitHub path encoding must match JavaScript `encodeURIComponent`.

Examples:

- Session ID `a/b` becomes `a%2Fb`
- Session ID `a?b` becomes `a%3Fb`

## Error semantics

- Invalid session data is a validation error.
- Missing `GITHUB_TOKEN` is an operator/configuration error.
- GitHub `404` while reading a session file means not found.
- Bulk sync must be idempotent for unchanged content: unchanged files are skipped, not rewritten.
