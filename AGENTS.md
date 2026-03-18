# Project Guidelines

## Code Style

### TypeScript/React

- Files use [Prettier](/.prettierrc.json) for formatting: `semi: true`, `singleQuote: true`, `trailingComma: es5`
- Linting: [ESLint with Next.js config](./eslint.config.mjs) (Next.js core web vitals, TypeScript) with relaxed rules for explicit any and require imports
- Organize components in `src/components/`, hooks in `src/hooks/`, utilities in `src/lib/`
- Use Radix UI primitives with Tailwind CSS for styling; see [design system](./docs/blueprint.md) for colors and typography

### Go

- Go files follow [standard Go conventions](https://golang.org/doc/effective_go)
- Command-line tools in `go/cmd/`, shared logic in `internal/`
- Build with: `go build ./go/cmd/matmetrics-cli`
- Test with: `go test ./internal/... ./go/... ./api/go/...`

## Architecture

### Full-Stack Layout

```
src/          → Next.js frontend (React, TypeScript, Tailwind)
go/cmd/       → CLI tooling (session list, GitHub sync, validation)
internal/     → Shared Go logic (session types, markdown parsing, storage)
api/          → API endpoint scaffolding (TypeScript and Go variants)
docs/         → Architecture decisions and contracts
```

### Session Data Contract

Frontend and CLI share a frozen **session shape** and **markdown format**. Changes require both TypeScript and Go updates.

- **Shape**: `id`, `date` (YYYY-MM-DD), `techniques[]`, `effort` (1–5), `category` (Technical|Randori|Shiai), `description`, `notes`, `duration`
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
npm run genkit:dev # Start Genkit AI flow dev server
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
npm run format     # Format code with Prettier
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
---

# March 18, 2026 – Judo Session

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

### Environment Variables

See [README.md](./README.md) for required variables (GITHUB_TOKEN, GOOGLE_GENAI_API_KEY, Firebase keys). Locally, copy `.env.example` to `.env.local`.

### AI & Genkit Flows

Genkit flows in `src/ai/flows/` integrate Google GenAI for technique suggestions and session analysis. Flows are tested via `npm run genkit:dev`. Schema-driven inputs/outputs for type safety.
