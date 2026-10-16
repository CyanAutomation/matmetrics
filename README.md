# MatMetrics

[![CI](https://github.com/CyanAutomation/matmetrics/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CyanAutomation/matmetrics/actions/workflows/ci.yml) [![CodeQL](https://github.com/CyanAutomation/matmetrics/actions/workflows/github-code-scanning/codeql/badge.svg?branch=main)](https://github.com/CyanAutomation/matmetrics/actions/workflows/github-code-scanning/codeql)

MatMetrics is a web application for judoka to log Judo practice sessions and understand their training patterns, techniques, and intensity. Operators can connect persistent storage and optional AI and authentication services; contributors can work on the Next.js app, Go tools, and Cloudflare Workers in this repository.

## Overview

MatMetrics is designed to help Judo practitioners log and analyze their training sessions with minimal friction. The application combines session logging, AI-powered technique suggestions, effort tracking, and visual dashboards to provide actionable insights into your training progress.

## Core Features

- **Session Logging**: Quickly log training sessions with date, techniques practiced, and effort level
- **AI Technique Helper**: Intelligently suggests Judo techniques as you type, powered by Cloudflare AI Gateway
- **Effort Rating**: Track perceived training intensity on a 1-5 scale (1 = easy, 3 = normal, 5 = intense)
- **Session History**: Browse and review all logged training sessions
- **Dashboard Overview**: Visual metrics including average effort levels and frequently practiced techniques
- **Dark Mode Support**: Light and dark theme options for comfortable viewing

## Quick Start

Run the local app with its guest demo data; no credentials or `.env.local` file
are needed for this preview.

```bash
git clone https://github.com/CyanAutomation/matmetrics.git
cd matmetrics
npm ci
npm run dev
```

Open [http://localhost:9002](http://localhost:9002). The guest preview starts
with sample sessions stored in this browser. Select **Log session** to open the
session form and try adding a practice entry. Guest changes stay in browser
storage and are not synced to GitHub. Configure authentication and a storage
repository for an account-backed workflow; see [Setup](SETUP.md).

AI suggestions, description transforms, and other integrations need their own
credentials. Add only the settings for the features you enable; see
[`.env.example`](.env.example) and [Environment variable behavior](#environment-variable-behavior).

## Using MatMetrics

### Explore the guest preview

The Dashboard opens with sample Judo sessions. Open **Training History** to
review them, or choose **Log session** to create an entry. Add session details,
optionally include techniques or notes, review the entry, and select **Save
session**. In guest mode, the preview and new entries are stored in this
browser. They are not sent to a server or synced to GitHub.

To keep sessions in an account, configure sign-in and a GitHub-backed storage
repository. See the [setup guide](SETUP.md) and [deployment instructions](#deployment).

### Use the Go CLI

List Markdown sessions from the repository's sample `data/` directory as JSON:

```bash
go run ./go/cmd/matmetrics-cli sessions list --data-dir data --format json
```

The CLI reads local files for this command; GitHub credentials are only needed
for GitHub validation and synchronization. See [Go tooling](go/README.md) for
other commands and protected Go API configuration.

## Documentation

| Guide | Purpose |
| --- | --- |
| [Setup guide](SETUP.md) | Local services, authentication, email, and deployment setup |
| [Contributing](CONTRIBUTING.md) | Release and pull request conventions |
| [Go tooling](go/README.md) | CLI commands and Go API authentication |
| [Auth Worker](workers/matmetrics-auth/README.md) | Worker configuration, tests, and deployment |
| [Auth migration](docs/better-auth-passkey-migration.md) | Auth rollout and post-deployment checks |
| [D1 migration](docs/cloudflare-d1-migration.md) | D1-backed preference migration |
| [Plugin UI contract](docs/plugin-ui-contract.md) | Plugin onboarding and UI requirements |

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [Radix UI](https://www.radix-ui.com/) components
- **Deployment**: [Vercel](https://vercel.com/) for hosting and serverless functions
- **Data Storage**: GitHub-backed Markdown for account sessions, browser storage for the guest preview, and local Markdown files for local server fallback
- **Additional components**: Go CLI/API and Cloudflare Workers for authentication and D1-backed data services
- **AI Integration**: Cloudflare AI Gateway with `dynamic/matmetrics` model routing
- **Forms and validation**: React form components with [Zod](https://zod.dev/) validation
- **UI Components**: Radix UI primitives with custom Tailwind styling
- **Date Management**: Built-in TypeScript calendar and formatting helpers

## Design System

- **Primary Color**: MatMetrics Blue (#006BAB) in light mode, MatMetrics Blue (#296BCD) in dark mode
- **Background**: App canvas surface (#F7FAFC) for a clean canvas
- **Accent Color**: Semantic tokens for interactive elements; see [blueprint.md](docs/blueprint.md)
- **Typography**: Inter (sans-serif) for clarity and modern appearance
- **Icons**: Minimalist line-art icons from Lucide React
- **Layout**: Clean, spacious design with responsive components

See [docs/blueprint.md](docs/blueprint.md) for full design specifications.

## Getting Started

### Prerequisites

- Node.js 24.x
- npm 11.x
- Go 1.25.x only if you are building or using the Go CLI/API
- Integration credentials only for the features that use them (see
  [`.env.example`](.env.example))

### Full local setup

The [Quick Start](#quick-start) is enough to open the guest demo. For local
integrations, copy the environment template and fill in only the values needed
for the features you plan to use. Keep secrets in `.env.local`; do not commit
them.

```bash
cp .env.example .env.local
```

For the local data and auth Workers, use the [setup guide](SETUP.md), which
describes their migrations and development configuration. The root app can
still run in guest preview mode without those Workers. The environment
reference below describes what each configured integration enables.

Important credential sources:

| Variable | Where to find it |
| --- | --- |
| `CLOUDFLARE_AUTH_WORKER_URL` | Cloudflare dashboard → `matmetrics-auth` Worker URL |
| `CLOUDFLARE_DATA_WORKER_URL` | Cloudflare dashboard → `matmetrics-data` Worker URL |
| `MATMETRICS_INTERNAL_API_SECRET` | Shared server-only signing secret for Vercel and the data Worker |
| `MATMETRICS_AUTH_JWKS_URL` | Same-origin JWKS endpoint, usually `https://<app-origin>/api/auth/jwks` |
| `MATMETRICS_AUTH_ISSUER` | Public MatMetrics frontend origin used by Better Auth JWTs |
| `MATMETRICS_AUTH_AUDIENCE` | Better Auth JWT audience; defaults to `matmetrics-api` |
| `SENTRY_DSN` | Sentry dashboard → Project settings → Client keys (DSN) |
| `SENTRY_AUTH_TOKEN` | sentry.io → User settings → Auth tokens |

### Environment variable behavior

- `.env.local` is intentionally ignored by git and should contain any real local credentials you need. The guest preview does not require this file.
- Better Auth handles password and passkey sign-in in the Cloudflare auth Worker. Preferences and plugin overrides use the signed Cloudflare data Worker and D1.
- `GITHUB_TOKEN` enables GitHub-backed session storage and sync.
- When `GITHUB_TOKEN` is missing, GitHub sync features will not work even if Better Auth is configured.
- `CLOUDFLARE_API_TOKEN` is required for AI-assisted technique suggestions and description transforms.
- `OPENROUTER_API_KEY` enables the optional JEV training check-in, verification of AI technique-tag candidates, and review-only checks for unsupported facts in transformed descriptions. It is read only by server-side routes; add it as an encrypted Vercel environment variable and never use a `NEXT_PUBLIC_` prefix. Without it, check-ins and fidelity checks are skipped, and technique suggestions remain available without verification. If JEV is unreachable or rejects the key, suggestions and rewrites remain available and the UI asks users to review unchecked results.
- The optional history review runs JEV against up to five previously logged sessions at a time after the user starts a batch. It sends each selected session's description, notes, selected category, effort rating, and up to 12 saved technique tags to OpenRouter/TypeSafe. JEV offers review suggestions, and never changes or saves sessions automatically.
- JEV check-ins send the session description, notes, selected category, effort rating, and saved technique tags to OpenRouter/TypeSafe. Technique suggestion verification sends the description and candidate tags; transformation checks send the original and transformed descriptions. The form labels these provider handoffs next to the relevant AI actions.
- Set `MATMETRICS_JEV_OBSERVABILITY=true` to emit sanitized server logs with the operation, requested and resolved model, question count, latency, and success/error outcome. Logs omit session text, JEV answer values (including fatigue and injury signals), and provider error messages. Observability is disabled by default.
- To smoke-test the JEV request with the Vercel Production environment without writing secrets to a local env file, run `vercel env run -e production -- npm run smoke:jev`. This makes one JEV request with synthetic training text and prints only the assessment summary or a safe error code/status.
- JEV category thresholds can be evaluated against labeled outcomes without storing session text; see [JEV threshold evaluation](docs/jev-evaluation.md).
- `CLOUDFLARE_DATA_WORKER_URL` and `MATMETRICS_INTERNAL_API_SECRET` enable D1-backed preferences and per-user plugin overrides. See [the D1 migration guide](docs/cloudflare-d1-migration.md).
- `CLOUDFLARE_AUTH_WORKER_URL`, `MATMETRICS_AUTH_JWKS_URL`, `MATMETRICS_AUTH_ISSUER`, and `MATMETRICS_AUTH_AUDIENCE` connect Next.js and Go to the Better Auth Worker. Set `NEXT_PUBLIC_BETTER_AUTH_ENABLED=true` when the Worker and same-origin rewrite are ready. Password signup is gated by `NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED` and Worker `MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED`; both default off. Passkey enrollment requires an authenticated session and is controlled by `NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED` and Worker `MATMETRICS_PASSKEY_ENROLMENT_ENABLED`. Keep `BETTER_AUTH_SECRET` and `RESEND_API_KEY` only in Cloudflare. Configure the verified sender with `MATMETRICS_AUTH_EMAIL_FROM`. See [the auth setup guide](docs/better-auth-passkey-migration.md).
- `MATMETRICS_BACKGROUND_EXECUTOR_URL` and `MATMETRICS_BACKGROUND_EXECUTOR_SECRET` enable the Cloudflare Queues background-job executor: the Worker posts background jobs to the URL, and the secret authorizes `POST` calls to `/api/internal/background-jobs/execute`.
- When GitHub is not configured in the app, the server stores sessions as local markdown files under `data/YYYY/MM/`.
- When GitHub is configured in the app and `GITHUB_TOKEN` is present on the server, session APIs read and write directly against the configured repository.
- The browser still keeps a local cache and an offline sync queue so create/update/delete operations can be retried after reconnecting.
- `SENTRY_DSN` enables browser-side error monitoring. Set in Vercel for every deployment environment.
- `SENTRY_AUTH_TOKEN` is used only in CI/Vercel to upload source maps and create releases.
- `MATMETRICS_AUTH_TEST_MODE` enables simplified test-mode authentication. Requires both this variable set to `true` and `NODE_ENV=test`. See [Authentication Setup](#test-mode-authentication) for details.

## Available Scripts

- **`npm run dev`**: Start the development server on port 9002 (with Turbopack)
- **`npm run build`**: Build for production
- **`npm run start`**: Start the production server
- **`npm run lint`**: Run the plugin UI contract validator, then ESLint
- **`npm run typecheck`**: Clear `.next/types` and `tsconfig.tsbuildinfo`, regenerate Next.js route types with `next typegen`, write a placeholder `.next/types/cache-life.d.ts`, then run `tsc --noEmit`
- **`npm run verify`**: Run the full verification suite sequentially (`test:all`, auth Worker tests/typecheck, `plugin:maturity:check`, `typecheck`, `build`, `go:test`)
- **`npm run test`**: Run the focused TypeScript test suite (runs `validate:plugin-ui-contract` and the tsx availability preflight, then executes `src/lib/sync-queue.test.ts` with Node's test runner under `NODE_ENV=test`, followed by `npm run test:styles`)
- **`npm test -- <file>`**: Append a specific TypeScript test file to the focused run (for example: `npm test -- src/lib/plugins/validate.test.ts`)
- **API route tests**: Live in `src/tests/` (for example `src/tests/api-sessions-id-route.test.ts` and `src/tests/api-sessions-create-route.test.ts`) and are covered by `npm run test:all`; `src/lib/plugins/validate.test.ts` covers plugin validation behavior checks.
- **`npm run test:all`**: Run all TypeScript tests under `plugins/` and `src/` (with `src/lib/storage.test.ts` executed separately), after `validate:plugin-ui-contract`, `validate:plugin-ui-migration-artifact`, `validate:docs`, and the tsx availability preflight
- **`npm run lint:readme`**: Check root README Markdown style with the repository's markdownlint config
- **`npm run test:readme`**: Test the root README link and heading validator
- **`npm run validate:readme`**: Check the root README heading hierarchy and local file/heading links

`npm run build` and `npm run typecheck` both read and write `.next` artifacts. Run them sequentially, or prefer `npm run verify`, instead of launching them in parallel.

### CI dependency requirement for validation and tests

CI/runner jobs that execute any of the following scripts must install **full dependencies** (including `devDependencies`):

- `npm run validate:plugin-ui-contract`
- `npm run test`
- `npm run test:all`
- `npm run ci:contracts`

Do not use production-only install flags (`--omit=dev`, `NODE_ENV=production`) in those validation/test jobs. Immediately after install, run:

```bash
node -e "require.resolve('tsx')"
```

This preflight fails fast with a clear error when test tooling dependencies are missing.

## Authentication Setup

MatMetrics uses Better Auth for verified email/password accounts and passkeys.
Email/password signup is initially disabled; existing users can sign in with a
passkey and use the emailed password-reset link to set their first password.
Passkeys remain available as an additional sign-in method on the same account.

The Cloudflare auth Worker owns Better Auth and the existing D1 auth tables.
Next.js exposes it through a same-origin `/api/auth/*` rewrite. Better Auth
sends verification and password-reset links through Resend using the Worker
secret `RESEND_API_KEY` and verified sender `MATMETRICS_AUTH_EMAIL_FROM` (for
example `MatMetrics <auth@scheimann.xyz>`). The Worker uses `waitUntil` for
email delivery. Set the Resend key with Wrangler; never put it in Vercel or a
`NEXT_PUBLIC_*` variable.

Set these values for the Next.js deployment:

- `CLOUDFLARE_AUTH_WORKER_URL`
- `NEXT_PUBLIC_BETTER_AUTH_ENABLED=true`
- `NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED=false` until public signup is opened
- `NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED=true`
- `MATMETRICS_AUTH_JWKS_URL`, `MATMETRICS_AUTH_ISSUER`, and `MATMETRICS_AUTH_AUDIENCE`

Set these Worker values in `workers/matmetrics-auth/wrangler.jsonc` or its
Cloudflare environment:

- `BETTER_AUTH_SECRET` and `RESEND_API_KEY` as Worker secrets
- `MATMETRICS_AUTH_EMAIL_FROM` to a sender on a verified Resend domain
- `MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED=false` until launch
- `MATMETRICS_AUTH_SIGNIN_ENABLED=true` and `MATMETRICS_PASSKEY_ENROLMENT_ENABLED=true`
- The exact frontend origin, RP ID, JWT issuer, and audience

After deploying the Worker and rewrite, use the reset email for an existing
passkey account to set its first password. Better Auth preserves that account's
user ID, passkeys, preferences, and data ownership, and revokes its active
sessions after a password reset. Firebase Auth client sign-in and Firebase ID
token verification have been removed.

See [`workers/matmetrics-auth/README.md`](workers/matmetrics-auth/README.md)
and the [auth rollout and retirement record](docs/better-auth-passkey-migration.md)
for deployment and post-deploy account checks.

### Test Mode Authentication

For development and testing, set both `MATMETRICS_AUTH_TEST_MODE=true` and
`NODE_ENV=test`. Next.js and Go then accept only
`Authorization: Bearer test-token`; all other tokens receive HTTP 401. Outside
test mode, protected APIs accept Better Auth service JWTs verified through the
configured JWKS URL, issuer, audience, expiry, and signature.

## Deployment

### Vercel (Recommended)

MatMetrics works well on Vercel and stores sessions as markdown files, with GitHub as the preferred remote backend.

Use Node.js 24.x for local development and configure the deployment runtime to Node.js 24 as well.

1. **Push to GitHub**: Ensure your code is on GitHub

2. **Create Vercel Project**:
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "Add New" → "Project"
   - Select your GitHub repository
   - Click "Import"

3. **Configure Environment Variables**:
   - Configure Better Auth with `CLOUDFLARE_AUTH_WORKER_URL`, `NEXT_PUBLIC_BETTER_AUTH_ENABLED`, the signup/enrollment flags, and the JWKS issuer/audience values listed above.
   - Add the server-side integrations used by your deployment:
     - `GITHUB_TOKEN`: Fine-grained token with repository contents read and write access to each user-configured repository
     - `CLOUDFLARE_API_TOKEN`: Cloudflare API token for AI-assisted suggestions and transforms (get with: `wrangler auth token`)
   - Optional integrations:
     - `OPENROUTER_API_KEY`: OpenRouter API key for the optional server-side JEV training check-in
     - `SENTRY_DSN`: Your Sentry DSN for error monitoring
     - `SENTRY_AUTH_TOKEN`: A Sentry auth token for source map uploads
     - `CLOUDFLARE_DATA_WORKER_URL` and `MATMETRICS_INTERNAL_API_SECRET` for D1-backed preferences and plugin overrides (required for those features)
     - `MATMETRICS_BACKGROUND_EXECUTOR_URL` and `MATMETRICS_BACKGROUND_EXECUTOR_SECRET` when using the Cloudflare Queues executor
   - Set credentials for Production and for Preview if preview deployments need authenticated features. Keep server credentials server-only.

4. **Deploy**:
   - Click "Deploy"
   - Vercel will automatically build and deploy your application

5. **Gate production deployments**:
   - Protect the `main` branch in GitHub, require pull requests, and require the `CI / release-readiness` status check before merging.
   - Set the Vercel Production Branch to `main`. This keeps production deployments on commits that passed the required CI checks.

**Data Storage**: Hosted Vercel Preview and Production deployments do not use local markdown files for session storage. Each user must configure a GitHub repository, and Vercel must have `GITHUB_TOKEN` with access to that repository. The API returns `503` when this persistent backend is unavailable instead of writing to an ephemeral function filesystem. Migrate any existing local `data/` sessions to the configured repository before deploying.

## Project Structure

```text
src/
├── app/                         # Next.js pages and catch-all API dispatcher
├── components/                  # Dashboard, session forms, and reusable UI
├── hooks/                       # Client-side state and data hooks
└── lib/                         # Storage, auth, AI clients, and shared types
api/go/                          # Go HTTP API handlers
go/cmd/matmetrics-cli/           # Go command-line application
internal/                        # Go session, Markdown, storage, and API logic
workers/
├── matmetrics-auth/             # Better Auth, passkeys, and auth email
└── matmetrics-data/             # D1 data API, migrations, and job support
```

The Next.js catch-all route registers API handler modules under `src/app/api/`.
The auth Worker hosts Better Auth and is exposed to the frontend through the
same-origin `/api/auth/*` rewrite. The data Worker owns D1 migrations and serves
the D1-backed data features. Go CLI and API code share session and storage
logic in `internal/`.

For session storage, authenticated users use GitHub-backed Markdown files;
guest preview data stays in browser storage. Local server development can use
Markdown files under `data/YYYY/MM/`. Hosted Vercel deployments require a
configured GitHub repository for persistent user sessions and do not write
session data to the ephemeral function filesystem; see [Deployment](#deployment).

## AI Features

### POST /api/ai/suggest-techniques

Accepts `{ description: string }` and returns `{ suggestions: string[] }`. Analyzes the provided session description and returns an array of suggested Judo technique names. Powered by Cloudflare AI Gateway with the `dynamic/matmetrics` model routing.

### POST /api/ai/transform-description

Accepts `{ description: string, customPrompt?: string }` and returns `{ transformedDescription: string, fidelityStatus }`. Processes the provided text and normalizes it into consistent prose format. Uses customizable prompts via `customPrompt` parameter or falls back to the default transformer prompt. When `OPENROUTER_API_KEY` is configured, JEV checks for unsupported factual details; `fidelityStatus` is `clear`, `flagged`, or `unavailable`. Without the key, it is `not_checked`. The check only flags possible issues and never blocks the rewrite.

### Input Limits

API routes enforce UTF-8 byte size limits to prevent oversized requests:

| Limit             | Value | Applied To                                                            |
| ----------------- | ----- | --------------------------------------------------------------------- |
| Request body      | 16 KB | Entire JSON body passed to any AI endpoint                            |
| Description field | 8 KB  | The `description` string in `/api/ai/transform-description`           |
| Custom prompt     | 2 KB  | The optional `customPrompt` string in `/api/ai/transform-description` |

Requests exceeding these limits are rejected before calling the AI provider. `/api/ai/transform-description` returns an `INPUT_TOO_LARGE` error response (HTTP 413); `/api/ai/suggest-techniques` rejects oversized bodies with HTTP 413 and oversized descriptions with HTTP 400.

### Output Constraints

The `/api/ai/transform-description` endpoint enforces strict output formatting: the model returns plain prose only — no title, heading, Markdown syntax, asterisks, emphasis markers, bullet lists, or code fences. The narrative begins immediately without any introductory phrase. No "Overall" conclusion or reflection is appended unless supported by the user's input.

## Contributing

When contributing to MatMetrics, please ensure:

- Code follows the existing style (TypeScript, Tailwind CSS conventions)
- Components are built using Radix UI primitives where applicable
- All changes include appropriate type definitions
- The application maintains the clean, minimalist design aesthetic

Read the [contribution guide](CONTRIBUTING.md) for release and pull request
conventions. Report bugs and request features through
[GitHub Issues](https://github.com/CyanAutomation/matmetrics/issues).

## License

The repository does not currently include a project license file. Contact the
maintainers about reuse permissions.

## Roadmap

Upcoming work is tracked in [nextsteps.md](nextsteps.md).

## Plugin Development

- Plugin onboarding UI baseline: [docs/plugin-ui-contract.md](docs/plugin-ui-contract.md).
- Individual onboarding references live in `plugins/*/README.md`.
