[![CI](https://github.com/CyanAutomation/matmetrics/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CyanAutomation/matmetrics/actions/workflows/ci.yml) [![CodeQL](https://github.com/CyanAutomation/matmetrics/actions/workflows/github-code-scanning/codeql/badge.svg?branch=main)](https://github.com/CyanAutomation/matmetrics/actions/workflows/github-code-scanning/codeql)

# MatMetrics

A simple web application for tracking Judo practice sessions, analyzing training patterns to help judoka manage their techniques and training intensity.

## Overview

MatMetrics is designed to help Judo practitioners log and analyze their training sessions with minimal friction. The application combines session logging, AI-powered technique suggestions, effort tracking, and visual dashboards to provide actionable insights into your training progress.

## Core Features

- **Session Logging**: Quickly log training sessions with date, techniques practiced, and effort level
- **AI Technique Helper**: Intelligently suggests Judo techniques as you type, powered by Cloudflare AI Gateway
- **Effort Rating**: Track perceived training intensity on a 1-5 scale (1 = easy, 3 = normal, 5 = intense)
- **Session History**: Browse and review all logged training sessions
- **Dashboard Overview**: Visual metrics including average effort levels and frequently practiced techniques
- **Dark Mode Support**: Light and dark theme options for comfortable viewing

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [Radix UI](https://www.radix-ui.com/) components
- **Deployment**: [Vercel](https://vercel.com/) for hosting and serverless functions
- **Data Storage**: GitHub-backed markdown files with local markdown fallback
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
- Cloudflare API token (for AI-powered features)
- GitHub personal access token for GitHub-backed storage

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd matmetrics
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

Copy `.env.example` to `.env.local` and add your API keys:

```bash
cp .env.example .env.local
```

Then edit `.env.local` and add:

```dotenv
# GitHub token used by server-side GitHub sync/storage
GITHUB_TOKEN=your_github_token

# Cloudflare AI Gateway API - Get with: wrangler auth token
CLOUDFLARE_API_TOKEN=your_cloudflare_token

# OpenRouter API key for server-side JEV check-ins and verification
OPENROUTER_API_KEY=your_openrouter_key

# Cloudflare D1 preference data Worker (server-only)
CLOUDFLARE_DATA_WORKER_URL=https://matmetrics-data.example.workers.dev
MATMETRICS_INTERNAL_API_SECRET=generate-a-long-random-secret

# Cloudflare Queues background-job executor (server-only)
# Use the public Vercel origin for the URL and generate a distinct long secret.
MATMETRICS_BACKGROUND_EXECUTOR_URL=
MATMETRICS_BACKGROUND_EXECUTOR_SECRET=

# Firebase client SDK - Firebase console → Project Settings → Your web app
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app

# Firebase admin SDK - paste the full service account JSON on one line
# Firebase console → Project Settings → Service accounts → Generate new private key
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Sentry DSN for error monitoring in browser bundle
SENTRY_DSN=https://example@o0.ingest.sentry.io/0

# Sentry auth token for CI/Vercel source map uploads and release creation
SENTRY_AUTH_TOKEN=sentry_example_token
```

Firebase values come from:

| Variable                                   | Where to find it                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | Firebase console → Project Settings → Your web app                                |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Firebase console → Project Settings → Your web app                                |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | Firebase console → Project Settings → Your web app                                |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | Firebase console → Project Settings → Your web app                                |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase console → Project Settings → Your web app                                |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Firebase console → Project Settings → Your web app                                |
| `FIREBASE_SERVICE_ACCOUNT_KEY`             | Firebase console → Project Settings → Service accounts → Generate new private key |
| `CLOUDFLARE_AUTH_WORKER_URL`                | Cloudflare dashboard → `matmetrics-auth` Worker URL (server-side rewrite destination) |
| `MATMETRICS_AUTH_JWKS_URL`                  | Same-origin JWKS endpoint, usually `https://<app-origin>/api/auth/jwks` |
| `MATMETRICS_AUTH_ISSUER`                    | Public MatMetrics frontend origin used by Better Auth JWTs |
| `MATMETRICS_AUTH_AUDIENCE`                  | Better Auth JWT audience; defaults to `matmetrics-api` |
| `MATMETRICS_AUTH_CONTEXT_SECRET`            | Shared Vercel/Cloudflare secret for short-lived registration contexts |
| `SENTRY_DSN`                               | Sentry dashboard → Project settings → Client keys (DSN)                           |
| `SENTRY_AUTH_TOKEN`                        | sentry.io → User settings → Auth tokens                                           |

### Environment variable behavior

- Copy `.env.example` to `.env.local` before starting the app. `.env.local` is intentionally ignored by git and should contain your real local credentials.
- Firebase authentication and Firestore-backed preferences require all `NEXT_PUBLIC_FIREBASE_*` variables plus `FIREBASE_SERVICE_ACCOUNT_KEY`.
- `GITHUB_TOKEN` enables GitHub-backed session storage and sync.
- When `GITHUB_TOKEN` is missing, GitHub sync features will not work even if Firebase auth is configured.
- `CLOUDFLARE_API_TOKEN` is required for AI-assisted technique suggestions and description transforms.
- `OPENROUTER_API_KEY` enables the optional JEV training check-in, verification of AI technique-tag candidates, and review-only checks for unsupported facts in transformed descriptions. It is read only by server-side routes; add it as an encrypted Vercel environment variable and never use a `NEXT_PUBLIC_` prefix. Without it, check-ins and fidelity checks are skipped, and technique suggestions remain available without verification. If JEV is unreachable or rejects the key, suggestions and rewrites remain available and the UI asks users to review unchecked results.
- The optional history review runs JEV against up to five previously logged sessions at a time after the user starts a batch. It sends each selected session's description, notes, selected category, effort rating, and up to 12 saved technique tags to OpenRouter/TypeSafe. JEV offers review suggestions, and never changes or saves sessions automatically.
- JEV check-ins send the session description, notes, selected category, effort rating, and saved technique tags to OpenRouter/TypeSafe. Technique suggestion verification sends the description and candidate tags; transformation checks send the original and transformed descriptions. The form labels these provider handoffs next to the relevant AI actions.
- Set `MATMETRICS_JEV_OBSERVABILITY=true` to emit sanitized server logs with the operation, requested and resolved model, question count, latency, and success/error outcome. Logs omit session text, JEV answer values (including fatigue and injury signals), and provider error messages. Observability is disabled by default.
- To smoke-test the JEV request with the Vercel Production environment without writing secrets to a local env file, run `vercel env run -e production -- npm run smoke:jev`. This makes one JEV request with synthetic training text and prints only the assessment summary or a safe error code/status.
- JEV category thresholds can be evaluated against labeled outcomes without storing session text; see [JEV threshold evaluation](docs/jev-evaluation.md).
- `CLOUDFLARE_DATA_WORKER_URL` and `MATMETRICS_INTERNAL_API_SECRET` enable D1-backed preferences and per-user plugin overrides. See [the D1 migration guide](docs/cloudflare-d1-migration.md).
- `CLOUDFLARE_AUTH_WORKER_URL`, `MATMETRICS_AUTH_JWKS_URL`, `MATMETRICS_AUTH_ISSUER`, `MATMETRICS_AUTH_AUDIENCE`, and `MATMETRICS_AUTH_CONTEXT_SECRET` configure the incremental Better Auth passkey migration. Passkey sign-in uses `NEXT_PUBLIC_BETTER_AUTH_ENABLED` and Worker `MATMETRICS_PASSKEY_SIGNIN_ENABLED`. Existing-user enrolment uses `NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED` plus server-side `MATMETRICS_PASSKEY_ENROLMENT_ENABLED` in Vercel and Cloudflare. Public passkey-only signup has separate `NEXT_PUBLIC_PASSKEY_SIGNUP_ENABLED` and server-side `MATMETRICS_PASSKEY_SIGNUP_ENABLED` flags and must stay disabled for the pilot. Keep `BETTER_AUTH_SECRET` only in Cloudflare; it is not needed by Vercel. See [the rollout guide](docs/better-auth-passkey-migration.md).
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

MatMetrics uses Firebase Authentication for secure user authentication. The application supports both production Firebase authentication and a test mode for development and testing scenarios.

### Production Authentication (Firebase)

The primary authentication method uses Firebase with the following configuration:

- **Client SDK**: `NEXT_PUBLIC_FIREBASE_*` environment variables (see table above)
- **Admin SDK**: `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable
- **Token Validation**: Firebase ID tokens are verified using Firebase's public certificates
- **Header Format**: `Authorization: Bearer <firebase-id-token>`

### Better Auth passkey migration

The migration adds Better Auth in a dedicated Cloudflare Worker bound directly
to the existing D1 database. The Vercel application proxies `/api/auth/*` to
that Worker through a same-origin rewrite; the browser keeps a host-only
session cookie on the MatMetrics origin. Better Auth issues normal browser
sessions and separate JWKS-verifiable JWTs for protected application APIs.

The current stage keeps Firebase available. A Firebase-authenticated user can
request a short-lived, signed registration context at
`/api/passkey/registration-context`; Better Auth links the verified passkey to
the same canonical MatMetrics user ID. Public passkey-only signup is disabled
by default and is not part of the pilot. Emails identify accounts but do not
establish ownership or provide recovery; passkeys are the only Better Auth
sign-in credential.

Configure the Cloudflare Worker secrets `BETTER_AUTH_SECRET` and
`MATMETRICS_AUTH_CONTEXT_SECRET`. Set the same context secret in Vercel, along
with the Worker URL, JWT issuer/audience, and same-origin JWKS URL. Never put
either secret in a `NEXT_PUBLIC_*` variable. Apply the additive auth schema
through the existing D1 migration owner before enabling the browser flag; see
[`workers/matmetrics-auth/README.md`](workers/matmetrics-auth/README.md) and
[`docs/better-auth-passkey-migration.md`](docs/better-auth-passkey-migration.md).

For the existing-user pilot, enable passkey sign-in and Firebase-user
enrolment explicitly in both UI and server configuration while leaving both
signup flags false. Production Worker defaults keep all three capabilities
disabled. The rollout guide includes the controlled-account smoke test,
recovery limitations, rate-limit setup, and Firebase rollback procedure.

Set the passkey RP ID to the deployed frontend hostname and the WebAuthn
origin/trusted origin to that exact origin. Local development uses `localhost`
as the RP ID. Vercel preview deployments need a stable explicit hostname; do
not wildcard preview origins. Firebase verification remains the migration
fallback until the API and Go verifier migration is complete.

### Test Mode Authentication

For development and testing, you can enable test mode using **two** environment variables: `MATMETRICS_AUTH_TEST_MODE=true` **and** `NODE_ENV=test`. Both must be set for test mode to activate. This is particularly useful for:

- **Unit Testing**: Testing authentication logic without real Firebase tokens
- **CI/CD**: Running tests in environments where Firebase configuration isn't available

#### Test Mode Behavior

When test mode is enabled (both `MATMETRICS_AUTH_TEST_MODE=true` and `NODE_ENV=test`), both authentication paths (Next.js route handlers and Go HTTP API handlers, including proxy calls) enforce the same simplified contract:

- **Header**: `Authorization: Bearer test-token`
- **Case Sensitivity**: `Bearer` is case-insensitive (`Bearer` and `bearer` are both accepted)
- **Missing/Malformed Headers**: Return `401` with `Authentication required`
- **Invalid Tokens**: Any token other than `test-token` returns `401` with `Invalid test token`

#### When to Use Test Mode

1. **Testing**: Enable both `MATMETRICS_AUTH_TEST_MODE=true` and `NODE_ENV=test` in test environments
2. **CI/CD**: Set both variables in automated testing pipelines

#### Integration with Firebase Authentication

The authentication system automatically falls back to Firebase authentication when either condition is false:

- Test mode is not fully enabled (either `MATMETRICS_AUTH_TEST_MODE` is not `true` **or** `NODE_ENV` is not `test`)
- Firebase is properly configured (all required environment variables are set)

This ensures that test mode doesn't interfere with production authentication while providing a simplified testing experience.

### Authentication Flow Overview

```
Client Request
    ↓
Authorization Header
    ↓
┌─────────────────────────────────────────────┐
│           Authentication Check               │
│ ┌─────────────┐  ┌─────────────┐             │
│ │ Test Mode?  │  │  Firebase   │             │
│ │ (test-token)│  │  (ID Token) │             │
│ └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────┘
    ↓
Authorized Request → Business Logic
```

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
   - Add the required Firebase client values:
     - `NEXT_PUBLIC_FIREBASE_API_KEY`
     - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
     - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
     - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` and `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` are optional client settings.
   - Add `FIREBASE_SERVICE_ACCOUNT_KEY` with the service account JSON. Keep it server-only; do not give it a `NEXT_PUBLIC_` prefix.
   - Add the server-side integrations used by your deployment:
     - `GITHUB_TOKEN`: Fine-grained token with repository contents read and write access to each user-configured repository
     - `CLOUDFLARE_API_TOKEN`: Cloudflare API token for AI-assisted suggestions and transforms (get with: `wrangler auth token`)
   - Optional integrations:
     - `OPENROUTER_API_KEY`: OpenRouter API key for the optional server-side JEV training check-in
     - `SENTRY_DSN`: Your Sentry DSN for error monitoring
     - `SENTRY_AUTH_TOKEN`: A Sentry auth token for source map uploads
     - `CLOUDFLARE_DATA_WORKER_URL` and `MATMETRICS_INTERNAL_API_SECRET` when using D1-backed preferences
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
├── app/               # Next.js app directory
│   └── api/          # API routes, emitted through one catch-all handler
│       └── ai/       # AI endpoints (suggest-techniques, transform-description)
├── components/        # Reusable React components
│   └── ui/           # Base UI components from Radix UI
├── hooks/            # Custom React hooks
└── lib/              # Utilities, types, and helpers
    ├── cloudflare-ai-client.ts  # Cloudflare AI Gateway client
    ├── ai-api-error.ts          # AI error handling
    └── ai-prompts.ts            # AI prompt templates
```

API handlers live in `api-handler.ts` modules (each exports `POST` and `maxDuration`) that are registered in `src/app/api/[...path]/route.ts`, which emits the API surface as a single Next.js route handler. The AI endpoints are at `src/app/api/ai/suggest-techniques/api-handler.ts` and `src/app/api/ai/transform-description/api-handler.ts`.

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

## Roadmap

Upcoming work is tracked in [nextsteps.md](nextsteps.md).

## Plugin Development

- Plugin onboarding UI baseline: [docs/plugin-ui-contract.md](docs/plugin-ui-contract.md).
- Individual onboarding references live in `plugins/*/README.md`.
