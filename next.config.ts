import path from 'path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const sentryRelease =
  process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA;
const sentryEnvironment =
  process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? 'development';

const nextConfig: NextConfig = {
  env: {
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_RELEASE: sentryRelease ?? undefined,
    SENTRY_ENVIRONMENT: sentryEnvironment,
  },
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': path.resolve(process.cwd(), 'src'),
      '@opentelemetry/exporter-jaeger': false,
    };

    return config;
  },
  outputFileTracingIncludes: {
    '/api/\\[\\.\\.\\.path\\]': [
      './plugins/**/plugin.json',
      './plugins/**/src/index.ts',
      './plugins/**/README.md',
    ],
  },
  async rewrites() {
    const authWorkerUrl = process.env.CLOUDFLARE_AUTH_WORKER_URL?.replace(
      /\/$/,
      ''
    );

    return {
      beforeFiles: authWorkerUrl
        ? [
            {
              source: '/api/auth/:path*',
              destination: `${authWorkerUrl}/api/auth/:path*`,
            },
          ]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: 'cyanautomation',
  project: 'matmetrics',
  release: sentryRelease ? { name: sentryRelease } : undefined,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
