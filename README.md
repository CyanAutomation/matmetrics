# MatMetrics

A simple web application for tracking Judo practice sessions, analyzing training patterns to help judoka manage their techniques and training intensity.

## Overview

MatMetrics is designed to help Judo practitioners log and analyze their training sessions with minimal friction. The application combines session logging, AI-powered technique suggestions, effort tracking, and visual dashboards to provide actionable insights into your training progress.

## Core Features

- **Session Logging**: Quickly log training sessions with date, techniques practiced, and effort level
- **AI Technique Helper**: Intelligently suggests Judo techniques as you type, powered by Google Genkit AI
- **Effort Rating**: Track perceived training intensity on a 1-5 scale (1 = easy, 3 = normal, 5 = intense)
- **Session History**: Browse and review all logged training sessions
- **Dashboard Overview**: Visual metrics including average effort levels and frequently practiced techniques
- **Dark Mode Support**: Light and dark theme options for comfortable viewing

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [Radix UI](https://www.radix-ui.com/) components
- **Deployment**: [Vercel](https://vercel.com/) for hosting and serverless functions
- **Data Storage**: GitHub-backed markdown files with local markdown fallback
- **AI Integration**: [Google Genkit](https://github.com/firebase/genkit) with Google GenAI
- **Forms**: [React Hook Form](https://react-hook-form.com/) with [Zod](https://zod.dev/) validation
- **UI Components**: Radix UI primitives with custom Tailwind styling
- **Date Management**: [date-fns](https://date-fns.org/)

## Design System

- **Primary Color**: MatMetrics Blue (#296BCD) - representing focus and strength
- **Background**: Light desaturated blue (#ECF1F4) for a clean canvas
- **Accent Color**: Progress Cyan (#3DCCE2) for interactive elements
- **Typography**: Inter (sans-serif) for clarity and modern appearance
- **Icons**: Minimalist line-art icons from Lucide React
- **Layout**: Clean, spacious design with responsive components

## Getting Started

### Prerequisites

- Node.js 24.x
- npm 11.x
- Google Genkit API key (for AI-powered features)
- GitHub personal access token for GitHub-backed storage

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd matmetrics
```

1. Install dependencies:

```bash
npm install
```

1. Set up environment variables:

Copy `.env.example` to `.env.local` and add your API keys:

```bash
cp .env.example .env.local
```

Then edit `.env.local` and add:

```dotenv
# GitHub token used by server-side GitHub sync/storage
GITHUB_TOKEN=your_github_token

# Google Genai API - Get from https://ai.google.dev/
GOOGLE_GENAI_API_KEY=your_genai_api_key

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

### Environment variable behavior

- Copy `.env.example` to `.env.local` before starting the app. `.env.local` is intentionally ignored by git and should contain your real local credentials.
- Firebase authentication and Firestore-backed preferences require all `NEXT_PUBLIC_FIREBASE_*` variables plus `FIREBASE_SERVICE_ACCOUNT_KEY`.
- `GITHUB_TOKEN` enables GitHub-backed session storage and sync.
- When `GITHUB_TOKEN` is missing, GitHub sync features will not work even if Firebase auth is configured.
- `GOOGLE_GENAI_API_KEY` is required for AI-assisted technique suggestions and description transforms.
- When GitHub is not configured in the app, the server stores sessions as local markdown files under `data/YYYY/MM/`.
- When GitHub is configured in the app and `GITHUB_TOKEN` is present on the server, session APIs read and write directly against the configured repository.
- The browser still keeps a local cache and an offline sync queue so create/update/delete operations can be retried after reconnecting.

## Available Scripts

- **`npm run dev`**: Start the development server on port 9002 (with Turbopack)
- **`npm run genkit:dev`**: Start Genkit AI flows in development mode
- **`npm run genkit:watch`**: Start Genkit AI with file watching
- **`npm run build`**: Build for production
- **`npm run start`**: Start the production server
- **`npm run lint`**: Run ESLint
- **`npm run typecheck`**: Run TypeScript type checking

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
     - `GOOGLE_GENAI_API_KEY`: Your Google Genai API key from [ai.google.dev](https://ai.google.dev/)

4. **Deploy**:
   - Click "Deploy"
   - Vercel will automatically build and deploy your application

**Data Storage**: Sessions are stored as markdown files. Before GitHub is configured they are written to local markdown storage; after GitHub setup the configured repository becomes the primary backend.

## Project Structure

```text
src/
├── ai/                 # AI flows and integrations
│   ├── flows/         # Genkit AI flow definitions
│   └── genkit.ts      # AI initialization
├── app/               # Next.js app directory
├── components/        # Reusable React components
│   └── ui/           # Base UI components from Radix UI
├── hooks/            # Custom React hooks
└── lib/              # Utilities, types, and helpers
```

## AI Flows

### Technique Suggester

Analyzes user input and suggests relevant Judo techniques for quick tagging during session logging.

### Practice Description Transformer

Processes and categorizes technique descriptions to normalize and standardize input data.

## Browser Support

MatMetrics uses modern CSS and JavaScript features. It requires a modern browser with support for:

- CSS Grid and Flexbox
- CSS Custom Properties (CSS Variables)
- ES2020+ JavaScript features

## Contributing

When contributing to MatMetrics, please ensure:

- Code follows the existing style (TypeScript, Tailwind CSS conventions)
- Components are built using Radix UI primitives where applicable
- All changes include appropriate type definitions
- The application maintains the clean, minimalist design aesthetic

## License

See LICENSE file for details.

## Support

For issues or feature requests, please refer to the project's issue tracker.
