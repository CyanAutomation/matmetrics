import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const workerRoot = path.dirname(fileURLToPath(import.meta.url));
const testAuthSecret = 'local-auth-test-secret-0123456789-abcdef';
process.env.BETTER_AUTH_SECRET = testAuthSecret;

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const { readD1Migrations } = await import('@cloudflare/vitest-plugin');
      const migrations = await readD1Migrations(
        path.resolve(workerRoot, '../matmetrics-data/migrations')
      );
      return {
        wrangler: { configPath: path.join(workerRoot, 'wrangler.jsonc') },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: testAuthSecret,
            RESEND_API_KEY: '',
            MATMETRICS_AUTH_EMAIL_FROM: 'MatMetrics <auth@scheimann.xyz>',
            MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED: 'false',
          },
        },
      };
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
