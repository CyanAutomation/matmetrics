# MatMetrics

A modern, intelligent web application for tracking Judo practice sessions, analyzing training patterns, and leveraging AI to help athletes manage their techniques and training intensity.

## Overview

MatMetrics is designed to help Judo practitioners log and analyze their training sessions with minimal friction. The application combines session logging, AI-powered technique suggestions, effort tracking, and visual dashboards to provide actionable insights into your training progress.

## Core Features

- **Session Logging**: Quickly log training sessions with date, techniques practiced, and effort level
- **AI Technique Helper**: Intelligently suggests Judo techniques as you type, powered by Google Genkit AI
- **Effort Rating**: Track perceived training intensity on a 0-2 scale (0 = normal, 1 = hard, 2 = very hard)
- **Session History**: Browse and review all logged training sessions
- **Dashboard Overview**: Visual metrics including average effort levels and frequently practiced techniques
- **Dark Mode Support**: Light and dark theme options for comfortable viewing

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [Radix UI](https://www.radix-ui.com/) components
- **Backend**: [Firebase](https://firebase.google.com/) for authentication and data storage
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

- Node.js 18+ and npm/pnpm/yarn
- Firebase project credentials
- Google Genkit API access

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

Create a `.env.local` file with your Firebase and Google Genkit credentials:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
GOOGLE_GENAI_API_KEY=your_genai_api_key
```

## Available Scripts

- **`npm run dev`**: Start the development server on port 9002 (with Turbopack)
- **`npm run genkit:dev`**: Start Genkit AI flows in development mode
- **`npm run genkit:watch`**: Start Genkit AI with file watching
- **`npm run build`**: Build for production
- **`npm run start`**: Start the production server
- **`npm run lint`**: Run ESLint
- **`npm run typecheck`**: Run TypeScript type checking

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
