# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Next.js / TypeScript)

```bash
npm install              # Install dependencies
npm run dev              # Dev server on port 9002 (Turbopack)
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # TypeScript type check
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

| Layer        | Technology                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------- |
| Frontend     | Next.js 15 + React 19 + TypeScript + Tailwind + Radix UI                                      |
| API          | Next.js route handlers in `src/app/api/`                                                      |
| CLI + Go API | Go in `go/cmd/` and `internal/`                                                               |
| Storage      | GitHub markdown (primary), local `data/` markdown (fallback), Cloudflare D1 (user preferences and plugin overrides) |
| AI           | Cloudflare AI Gateway with `dynamic/matmetrics` model routing                                 |
| Auth         | Better Auth passwords + passkeys                                                             |

### Storage Layers

1. **GitHub-backed** — when the user configures a GitHub repo, session APIs read/write markdown files there via the GitHub REST API
2. **Local markdown** — fallback to `data/YYYY/MM/YYYYMMDD-matmetrics.md`
3. **Cloudflare D1** — user preferences and plugin overrides via the signed data Worker
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

### AI (Cloudflare Gateway)

AI features are provided via Cloudflare AI Gateway at `src/app/api/ai/` route handlers:

- **Technique Suggester** (`/api/ai/suggest-techniques`) — suggests Judo techniques as the user types
- **Practice Description Transformer** (`/api/ai/transform-description`) — normalizes session descriptions

Implementation uses direct Cloudflare API calls via `src/lib/cloudflare-ai-client.ts` with the `dynamic/matmetrics` model routing configuration. Error handling via `src/lib/ai-api-error.ts` classifies Cloudflare-specific errors (auth, rate limit, service unavailable) into structured API error codes.

### Authentication

- **Provider**: Better Auth runs in `workers/matmetrics-auth` and supports verified email/password accounts plus passkeys on the same account.
- **Email delivery**: Resend sends verification and password-reset links from the Worker. Keep `RESEND_API_KEY` and `BETTER_AUTH_SECRET` as Cloudflare secrets.
- **API authentication**: Next.js and Go accept Better Auth EdDSA service JWTs verified with the configured JWKS URL, issuer, and audience.
- **Signup**: `MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED` is the Worker gate and defaults off; the Next.js public flag controls signup UI visibility.
- **Data Worker scope**: Preferences and plugin overrides require the signed Cloudflare data Worker and D1.
- **Test mode**: Set `MATMETRICS_AUTH_TEST_MODE=true` with `NODE_ENV=test` to enable `Authorization: Bearer test-token` (case-insensitive `Bearer`; other tokens receive 401).

## Environment Setup

Copy `.env.example` to `.env.local`. Required variables:

```bash
GITHUB_TOKEN                          # GitHub API access for sync/storage
CLOUDFLARE_API_TOKEN                  # Cloudflare AI Gateway for AI features
NEXT_PUBLIC_BETTER_AUTH_ENABLED       # Browser Better Auth feature flag
CLOUDFLARE_AUTH_WORKER_URL            # Better Auth Worker rewrite destination
CLOUDFLARE_AUTH_WORKER_HOST           # Exact trusted *.workers.dev hostname for server-side session-cookie exchange
MATMETRICS_AUTH_JWKS_URL              # Same-origin Better Auth JWKS endpoint
MATMETRICS_AUTH_ISSUER                # Better Auth JWT issuer
MATMETRICS_AUTH_AUDIENCE              # Better Auth JWT audience
```

The auth Worker also needs `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `MATMETRICS_AUTH_EMAIL_FROM`, and `MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED`. Keep Worker secrets out of Vercel and browser variables. `NEXT_PUBLIC_*` vars are baked in at build time.

## Key Conventions

- **Formatting**: Follow the surrounding code style; ESLint checks code quality.
- **Path alias**: `@/*` → `./src/*`
- **Go layout**: commands in `go/cmd/`, shared logic in `internal/`
- **Design tokens**: CSS custom properties defined in `src/app/globals.css`; semantic token names in `src/lib/design-tokens.ts`; full spec in `docs/blueprint.md`
- **API test entry points**: `src/tests/api-sessions-id-route.test.ts` and `src/tests/api-sessions-create-route.test.ts`
