import path from 'path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  env: {
    SENTRY_DSN: process.env.SENTRY_DSN,
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
    '/api/plugins/list': [
      './plugins/**/plugin.json',
      './plugins/**/src/index.ts',
      './plugins/**/README.md',
    ],
    '/api/plugins/validate': [
      './plugins/**/plugin.json',
      './plugins/**/src/index.ts',
      './plugins/**/README.md',
    ],
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
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
