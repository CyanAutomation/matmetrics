# Project Guidelines

## Code Style

### TypeScript/React

- Follow the surrounding code style. Linting uses [ESLint with Next.js config](./eslint.config.mjs) (Next.js core web vitals, TypeScript) with relaxed rules for explicit any and require imports.
- Organize components in `src/components/`, hooks in `src/hooks/`, utilities in `src/lib/`
- Use Radix UI primitives with Tailwind CSS for styling; see [design system](./docs/blueprint.md) for colors and typography

### Go

- Go files follow [standard Go conventions](https://golang.org/doc/effective_go)
- Command-line tools in `go/cmd/`, shared logic in `internal/`
- Build with: `go build ./go/cmd/matmetrics-cli`
- Test with: `go test ./internal/... ./go/... ./api/go/...`

## Architecture

### Full-Stack Layout

```text
src/          → Next.js frontend (React, TypeScript, Tailwind)
go/cmd/       → CLI tooling (session list, GitHub sync, validation)
internal/     → Shared Go logic (session types, markdown parsing, storage)
api/          → API endpoint scaffolding (TypeScript and Go variants)
docs/         → Architecture decisions and contracts
```

### Session Data Contract

Frontend and CLI share a frozen **session shape** and **markdown format**. Changes require both TypeScript and Go updates.

- **Shape**: `id`, `date` (YYYY-MM-DD), `techniques[]`, `effort` (1–5), `category` (Technical|Randori|Shiai|Cardio|S&C), `description`, `notes`, `duration`, `videoUrl`
- **Markdown format**: YAML frontmatter + fixed sections (id, date, effort, category)

See [docs/go-contract.md](./docs/go-contract.md) for the complete contract and exact markdown template.

### Storage Layer

- Primary: GitHub-backed markdown files in user's repo (synced via `github sync-all` command)
- Fallback: Local markdown files in `data/YYYY/MM/` (ISO date directory structure)
- Firebase: User preferences and session metadata (indexed by `uid`)

## Build and Test

### Frontend (Next.js)

```bash
npm install        # Install dependencies
npm run dev        # Start dev server on port 9002 with Turbopack
npm run build      # Production build
npm run start      # Start production server
npm test           # Run TypeScript unit tests (tsx test runner)
```

### CLI & Go Tooling

```bash
go build ./go/cmd/matmetrics-cli              # Build CLI binary
go run ./go/cmd/matmetrics-cli sessions list  # List sessions as JSON
go test ./internal/... ./go/... ./api/go/...  # Run all Go tests
```

See [go/README.md](./go/README.md) for detailed command examples.

### Type Generation & Validation

```bash
npm run typecheck  # Regenerate Next.js types, run TypeScript check
npm run lint       # Lint with ESLint
```

## Conventions

### Session Markdown Files

Sessions are stored as `data/YYYY/MM/YYYYMMDD-matmetrics.md` with strict format:

```markdown
---
id: 'session-uuid'
date: '2026-03-18'
effort: 3
category: 'Technical'
duration: 90
videoUrl: 'https://example.com/session.mp4'
---

# 2026-03-18 - Judo Session: Technical

## Techniques Practiced

- Uchi mata

## Session Description

...

## Notes

...
```

Exact rules in [docs/go-contract.md](./docs/go-contract.md). The CLI validates this format; changes require both TypeScript and Go updates.

### Directory Organization

- **Single-language files**: `src/` → TypeScript/React, `go/` → Go
- **Shared types**: Mirror structure in `internal/` (Go) and type definitions in `src/lib/types.ts`
- **Tests**: Colocate with source files (`*.test.ts`, `*_test.go`)
- **Docs**: Major decisions and contracts live in `docs/`

### Cross-Language Contracts

Some exports appear unused in TypeScript but are part of **shared contracts** with Go or Cloudflare Workers. These must never be removed without verifying both implementations.

**Contract Files (Do not suppress without checking both sides):**

- `src/lib/background-jobs.ts` — TypeScript job types (`BackgroundJobResult`, `isBackgroundJobResult`) mirrored in `workers/matmetrics-data/src/index.ts`. **CRITICAL:** Removing these breaks Worker↔Server job contract. See file header for safeguard checklist.
- `src/lib/types.ts` — Session shape shared with Go CLI in `internal/model/session.go`
- `src/lib/session-validation.ts` — Validation rules synced with Go in `internal/markdown/parser.go`

**Active Exports (Not Dead Code):**

- `src/lib/storage-queue.ts` — Exports (`SyncRequestError`, `parseRetryAfterMs`, `processSingleQueueOperation`) are actively used by `storage.ts` sync orchestration (139+ call sites). Not dead code.

If an export from contract files is flagged as unused, cross-check the Go/Worker implementation before removing. See [docs/go-contract.md](./docs/go-contract.md) for session format details.

### Test Helper Patterns

**Test utilities are intentionally public exports**, not dead code. These files export helpers used across multiple test suites:

- `src/lib/test-helpers/github-mock-builder.ts` — Exports `GitHubMockBuilder`, `makeTestSession`, `withMockedGitHub` used by github-storage.test.ts and session-storage.test.ts
- `src/tests/api-*.ts` — Shared test fixtures for API route testing

Test helper files use `// fallow-ignore file unused-exports` to suppress false positives. When adding new test utilities, use the same pattern.

### Environment Variables

See [README.md](./README.md) for required variables (GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, Firebase keys, SENTRY_DSN, SENTRY_AUTH_TOKEN). Locally, copy `.env.example` to `.env.local`.

### AI & Cloudflare Gateway

AI-powered technique suggestions and practice description transformation are provided via Cloudflare AI Gateway. Two POST endpoints accept `{ description }` payloads and return JSON responses with suggestions or transformed prose. Client implementation is in `src/lib/cloudflare-ai-client.ts` with error handling and type safety via Zod schemas.

### Markdown Documentation

All markdown files in the repository follow standardized conventions for consistency and readability. See [docs/MARKDOWN_STYLE.md](./docs/MARKDOWN_STYLE.md) for complete guidelines including:

- Heading hierarchy and structure
- Link formatting (internal and external)
- Code block language tags
- Table formatting
- Terminology and terminology conventions
- Automated linting with `.markdownlint.json`

**Key rule:** First heading must be `# Document Title` (H1); no skipping heading levels.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
