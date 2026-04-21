# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Next.js / TypeScript)

```bash
npm install              # Install dependencies
npm run dev              # Dev server on port 9002 (Turbopack)
npm run genkit:dev       # Start Genkit AI flow dev server
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # TypeScript type check
npm run format           # Prettier
npm run verify           # Full suite: test → typecheck → build → go:test (sequential)
npm test                 # Run all TypeScript tests
npm test -- src/lib/foo.test.ts  # Run a single test file
```

**Important**: `npm run build` and `npm run typecheck` both read/write `.next` artifacts — never run them in parallel. Use `npm run verify` for the full suite.

### Go (CLI + HTTP API)

```bash
go build ./go/cmd/matmetrics-cli              # Build CLI binary
go run ./go/cmd/matmetrics-cli sessions list  # Run CLI directly
go test ./internal/... ./go/... ./api/go/...  # Run all Go tests
```

Tests use Node's native `--test` runner (not Jest); test files are `*.test.ts` colocated with source.

## Architecture

MatMetrics is a Judo training session tracker with a **dual-language full-stack**:

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 + TypeScript + Tailwind + Radix UI |
| API | Next.js route handlers in `src/app/api/` |
| CLI + Go API | Go in `go/cmd/` and `internal/` |
| Storage | GitHub markdown (primary), local `data/` markdown (fallback), Firebase Firestore (user prefs) |
| AI | Google Genkit + Google GenAI in `src/ai/flows/` |
| Auth | Firebase Auth (client) + Firebase Admin SDK (server) |

### Storage Layers

1. **GitHub-backed** — when the user configures a GitHub repo, session APIs read/write markdown files there via the GitHub REST API
2. **Local markdown** — fallback to `data/YYYY/MM/YYYYMMDD-matmetrics.md`
3. **Firebase Firestore** — user preferences only (indexed by `uid`)
4. **Offline sync queue** — localStorage queue retries failed create/update/delete operations on reconnect

Key files: `src/lib/storage.ts` (client facade), `src/lib/session-storage.ts` (server orchestrator), `src/lib/github-storage.ts`, `src/lib/file-storage.ts`.

### Session Data Contract (TypeScript ↔ Go)

The session shape and markdown format are **frozen** and shared between TypeScript and Go. Any change requires updates in both languages.

- Shape fields: `id`, `date` (YYYY-MM-DD), `techniques[]`, `effort` (1–5), `category` (Technical|Randori|Shiai), `description`, `notes`, `duration`
- Format: YAML frontmatter + fixed markdown sections

See `docs/go-contract.md` for the exact template and validation rules.

### Plugin System

Plugins live in `plugins/*/` and register via `plugin.json` manifests. They can extend the dashboard with new tabs (`uiExtensions`). The plugin registry (`src/lib/plugins/registry.ts`) validates plugins against a UI contract at startup — see `docs/plugin-ui-contract.md`.

Maturity tiers (Silver/Gold) gate the plugin review bar. Plugins must use `PluginPageShell` and provide required state components (empty, loading, error).

### AI Flows (Genkit)

Flows in `src/ai/flows/` provide:
- **Technique Suggester** — suggests Judo techniques as the user types
- **Practice Description Transformer** — normalizes session descriptions

Flows use schema-driven typed inputs/outputs and are exposed via `src/app/api/ai/` route handlers.

### Authentication

- **Client**: Firebase Auth (Google / email sign-in) via `src/lib/firebase-client.ts`
- **Server**: Firebase Admin SDK validates tokens in `src/lib/server-auth.ts`; all session API routes call `requireAuthenticatedUser`
- **Test mode**: Set `MATMETRICS_AUTH_TEST_MODE=true` to enable `Authorization: Bearer test-token` contract (case-insensitive `Bearer`; any other token → 401)

## Environment Setup

Copy `.env.example` to `.env.local`. Required variables:

```
GITHUB_TOKEN                          # GitHub API access for sync/storage
GOOGLE_GENAI_API_KEY                  # Google GenAI for AI flows
NEXT_PUBLIC_FIREBASE_API_KEY          # Firebase client config (6 variables)
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
FIREBASE_SERVICE_ACCOUNT_KEY          # Full service account JSON on a single line
```

`FIREBASE_SERVICE_ACCOUNT_KEY` must be a single-line JSON string (escape all newlines). `NEXT_PUBLIC_*` vars are baked in at build time.

## Key Conventions

- **Formatting**: Prettier — `semi: true`, `singleQuote: true`, `trailingComma: es5`
- **Path alias**: `@/*` → `./src/*`
- **Go layout**: commands in `go/cmd/`, shared logic in `internal/`
- **Design tokens**: CSS custom properties defined in `src/app/globals.css`; semantic token names in `src/lib/design-tokens.ts`; full spec in `docs/blueprint.md`
- **API test entry points**: `src/tests/api-sessions-id-route.test.ts` and `src/tests/api-sessions-create-route.test.ts`
