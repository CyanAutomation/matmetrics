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
- **Forms**: [React Hook Form](https://react-hook-form.com/) with [Zod](https://zod.dev/) validation
- **UI Components**: Radix UI primitives with custom Tailwind styling
- **Date Management**: [date-fns](https://date-fns.org/)

## Design System

- **Primary Color**: MatMetrics Blue (#006BAB) in light mode, MatMetrics Blue (#296BCD) in dark mode
- **Background**: Light desaturated blue (#ECF1F4) for a clean canvas
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
| `SENTRY_DSN`                               | Sentry dashboard → Project settings → Client keys (DSN)                           |
| `SENTRY_AUTH_TOKEN`                        | sentry.io → User settings → Auth tokens                                           |

### Environment variable behavior

- Copy `.env.example` to `.env.local` before starting the app. `.env.local` is intentionally ignored by git and should contain your real local credentials.
- Firebase authentication and Firestore-backed preferences require all `NEXT_PUBLIC_FIREBASE_*` variables plus `FIREBASE_SERVICE_ACCOUNT_KEY`.
- `GITHUB_TOKEN` enables GitHub-backed session storage and sync.
- When `GITHUB_TOKEN` is missing, GitHub sync features will not work even if Firebase auth is configured.
- `CLOUDFLARE_API_TOKEN` is required for AI-assisted technique suggestions and description transforms.
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
- **`npm run lint`**: Run ESLint
- **`npm run typecheck`**: Run TypeScript type checking
- **`npm run verify`**: Run the full verification suite sequentially (`test`, `typecheck`, `build`, `go:test`)
- **`npm run test`**: Run TypeScript unit tests (runs `validate:plugin-ui-contract` contract validation first, then executes `.test.ts` files with Node's test runner under `NODE_ENV=test`)
- **`npm test -- <file>`**: Run a specific TypeScript test file with Node's test runner (for example: `npm test -- src/lib/foo.test.ts`)
- **Current API route test entry points**: `src/tests/api-sessions-id-route.test.ts` and `src/tests/api-sessions-create-route.test.ts` (use `src/lib/plugins/validate.test.ts` for plugin validation behavior checks).
- **`npm run test:all`**: Run all TypeScript tests under `src/**/*.test.ts`

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
   - In the "Environment Variables" section, add:
     - `GITHUB_TOKEN`: Fine-grained token with repository contents write access
     - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token (get with: `wrangler auth token`)
     - `SENTRY_DSN`: Your Sentry DSN for error monitoring
     - `SENTRY_AUTH_TOKEN`: Your Sentry auth token for source map uploads

4. **Deploy**:
   - Click "Deploy"
   - Vercel will automatically build and deploy your application

**Data Storage**: Sessions are stored as markdown files. Before GitHub is configured they are written to local markdown storage; after GitHub setup the configured repository becomes the primary backend.

## Project Structure

```text
src/
├── app/               # Next.js app directory
│   └── api/          # API routes including AI endpoints
├── components/        # Reusable React components
│   └── ui/           # Base UI components from Radix UI
├── hooks/            # Custom React hooks
└── lib/              # Utilities, types, and helpers
    ├── cloudflare-ai-client.ts  # Cloudflare AI Gateway client
    ├── ai-api-error.ts          # AI error handling
    └── ai-prompts.ts            # AI prompt templates
```

## AI Features

### POST /api/ai/suggest-techniques

Accepts `{ description: string }` and returns `{ suggestions: string[] }`. Analyzes the provided session description and returns an array of suggested Judo technique names. Powered by Cloudflare AI Gateway with the `dynamic/matmetrics` model routing.

### POST /api/ai/transform-description

Accepts `{ description: string, customPrompt?: string }` and returns `{ transformedDescription: string }`. Processes the provided text and normalizes it into consistent prose format. Uses customizable prompts via `customPrompt` parameter or falls back to the default transformer prompt.

### Input Limits

API routes enforce UTF-8 byte size limits to prevent oversized requests:

| Limit | Value | Applied To |
| --- | --- | --- |
| Request body | 16 KB | Entire JSON body passed to any AI endpoint |
| Description field | 8 KB | The `description` string in `/api/ai/transform-description` |
| Custom prompt | 2 KB | The optional `customPrompt` string in `/api/ai/transform-description` |

Requests exceeding these limits receive an `INPUT_TOO_LARGE` error response (HTTP 400).

### Output Constraints

The `/api/ai/transform-description` endpoint enforces strict output formatting: the model returns plain prose only — no title, heading, Markdown syntax, asterisks, emphasis markers, bullet lists, or code fences. The narrative begins immediately without any introductory phrase. No "Overall" conclusion or reflection is appended unless supported by the user's input.
## Contributing

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
